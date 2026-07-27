// Winnow content script — wires heuristics + storage + DOM + report UI
// together on youtube.com/watch pages. Phase 3: fully local/offline, no
// network calls other than fetching the bundled rules.json.
(function () {
  const { WinnowHeuristics, WinnowStorage, WinnowDOM, WinnowReport } = window;

  let rulesDoc = null;
  let settings = null;
  let blocklist = null;
  let allowlist = null;
  let hashCache = null;
  let currentVideoId = null;
  let observer = null;
  let hashCacheDirty = false;

  function getVideoId() {
    const params = new URLSearchParams(location.search);
    return params.get('v');
  }

  async function loadRules() {
    const url = chrome.runtime.getURL('src/rules.json');
    const res = await fetch(url);
    return res.json();
  }

  function isAllowed(authorId) {
    return authorId && allowlist.includes(authorId);
  }

  function isBlocklisted(authorId) {
    return authorId && blocklist.channelIds.includes(authorId);
  }

  function categoryEnabled(categoryKey) {
    if (categoryKey === 'offtopic') return false; // report-only, never auto-hides
    return !!settings.categories[categoryKey];
  }

  function effectiveThreshold() {
    return settings.scorchedEarth ? rulesDoc.scorchedEarthThreshold : rulesDoc.threshold;
  }

  async function onHiddenRegisterAndCount(element, reasonLabel, isThread) {
    WinnowDOM.registerHidden(element, reasonLabel, isThread, () => {
      WinnowStorage.incrementStat('revealedCount', 1);
    });
    await WinnowStorage.incrementStat('hiddenThisWeek', 1);
  }

  function scoreAndMaybeHide(renderer, selectors, isReplyOfHiddenThread) {
    if (!renderer.text || isAllowed(renderer.authorId)) return false;

    if (isBlocklisted(renderer.authorId)) {
      if (WinnowDOM.hideRenderer(renderer.element, 'blocklist')) {
        onHiddenRegisterAndCount(renderer.element, `Blocklisted channel (${renderer.authorName || 'unknown'})`, false);
      }
      return true;
    }

    const ctx = { videoId: currentVideoId, hashCache };
    const result = WinnowHeuristics.evaluateComment(renderer.text, rulesDoc, ctx);
    hashCacheDirty = true;
    if (result && categoryEnabled(result.categoryKey) && result.score >= effectiveThreshold()) {
      const label = rulesDoc.categories[result.categoryKey].label;
      if (WinnowDOM.hideRenderer(renderer.element, result.categoryKey)) {
        onHiddenRegisterAndCount(renderer.element, `${label} (${renderer.authorName || 'unknown'})`, false);
      }
      return true;
    }
    return false;
  }

  function runFinanceChainPass(thread, selectors) {
    if (!categoryEnabled('finance_chain')) return;
    if (thread.replies.length === 0) return;
    const authorCounts = new Map();
    for (const r of [thread.seed, ...thread.replies]) {
      if (!r.authorId) continue;
      authorCounts.set(r.authorId, (authorCounts.get(r.authorId) || 0) + 1);
    }
    const financeCtx = {
      seedText: thread.seed.text,
      seedAuthorId: thread.seed.authorId,
      replies: thread.replies.map((r) => ({ authorId: r.authorId, text: r.text, timestamp: null })),
      threadAuthors: authorCounts,
    };
    const hit = WinnowHeuristics.evaluateFinanceChain(financeCtx, rulesDoc);
    if (hit && WinnowDOM.hideThread(thread.threadEl, 'finance_chain')) {
      onHiddenRegisterAndCount(thread.threadEl, `Financial/crypto scam chain (${hit.implicatedAuthors.length} accounts)`, true);
      for (const authorId of hit.implicatedAuthors) {
        WinnowReport.submitReport({
          authorId,
          text: thread.seed.text,
          reasonCode: 'finance_chain',
          videoId: currentVideoId,
          rulesVersion: rulesDoc.version,
        });
      }
    }
  }

  function processThread(threadEl, selectors) {
    if (WinnowDOM.isHidden(threadEl)) return;
    const thread = WinnowDOM.extractThread(threadEl, selectors);
    if (!thread) return;

    if (settings.scorchedEarth) {
      // Scorched Earth: any single hit anywhere in the thread nukes the whole
      // reply chain (spec §8). Evaluate seed + replies before committing.
      const all = [thread.seed, ...thread.replies];
      const anyHit = all.some((r) => {
        if (isBlocklisted(r.authorId)) return true;
        const ctx = { videoId: currentVideoId, hashCache };
        const result = WinnowHeuristics.evaluateComment(r.text, rulesDoc, ctx);
        hashCacheDirty = true;
        return result && categoryEnabled(result.categoryKey) && result.score >= effectiveThreshold();
      });
      if (anyHit) {
        if (WinnowDOM.hideThread(threadEl, 'scorched_earth')) {
          onHiddenRegisterAndCount(threadEl, `Scorched Earth (${thread.seed.authorName || 'unknown'})`, true);
        }
        attachReportButtons(thread, selectors);
        return;
      }
    } else {
      scoreAndMaybeHide(thread.seed, selectors, false);
      for (const reply of thread.replies) {
        scoreAndMaybeHide(reply, selectors, false);
      }
    }

    runFinanceChainPass(thread, selectors);
    attachReportButtons(thread, selectors);
  }

  function attachReportButtons(thread, selectors) {
    const ctx = { videoId: currentVideoId, rulesVersion: rulesDoc.version };
    const attach = (renderer, isThread) => {
      if (!renderer.element) return;
      WinnowReport.attachReportButton(renderer.element, renderer, selectors, ctx, (reasonCode) => {
        const label = rulesDoc.categories[reasonCode] ? rulesDoc.categories[reasonCode].label : reasonCode;
        const target = isThread ? thread.threadEl : renderer.element;
        const hidden = isThread ? WinnowDOM.hideThread(target, reasonCode) : WinnowDOM.hideRenderer(target, reasonCode);
        if (hidden) onHiddenRegisterAndCount(target, `Reported: ${label} (${renderer.authorName || 'unknown'})`, isThread);
      });
    };
    attach(thread.seed, false);
    for (const reply of thread.replies) attach(reply, false);
  }

  function scanExistingThreads(selectors) {
    for (const threadEl of WinnowDOM.getThreadElements(selectors)) {
      processThread(threadEl, selectors);
    }
    WinnowDOM.ensurePill(selectors);
  }

  function startObserving(selectors) {
    if (observer) observer.disconnect();
    observer = new MutationObserver(() => {
      if (!settings.masterEnabled) return;
      scanExistingThreads(selectors);
    });
    const target = document.body;
    observer.observe(target, { childList: true, subtree: true });
  }

  async function persistHashCacheDebounced() {
    if (!hashCacheDirty) return;
    hashCacheDirty = false;
    await WinnowStorage.persistHashCache(hashCache);
  }

  async function initForVideo() {
    currentVideoId = getVideoId();
    if (!currentVideoId) return;
    WinnowDOM.resetForNewVideo();
    settings = await WinnowStorage.getSettings();
    blocklist = await WinnowStorage.getBlocklist();
    allowlist = await WinnowStorage.getAllowlist();
    if (!settings.masterEnabled) return;
    startObserving(rulesDoc.selectors);
    scanExistingThreads(rulesDoc.selectors);
  }

  function watchForNavigation() {
    document.addEventListener('yt-navigate-finish', () => {
      initForVideo();
    });
    // Fallback for cases yt-navigate-finish doesn't fire (defensive; SPA event names drift)
    let lastHref = location.href;
    setInterval(() => {
      if (location.href !== lastHref) {
        lastHref = location.href;
        initForVideo();
      }
    }, 1000);
    setInterval(persistHashCacheDebounced, 5000);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) persistHashCacheDebounced();
    });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings) {
      settings = { ...settings, ...changes.settings.newValue };
    }
    if (area === 'local' && changes.blocklist) {
      blocklist = changes.blocklist.newValue;
    }
    if (area === 'local' && changes.allowlist) {
      allowlist = changes.allowlist.newValue;
    }
  });

  async function main() {
    rulesDoc = await loadRules();
    hashCache = await WinnowStorage.loadHashCache();
    watchForNavigation();
    await initForVideo();
  }

  main();
})();
