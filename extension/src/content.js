// Winnow content script — wires heuristics + storage + DOM + report UI
// together on YouTube. Phase 3: fully local/offline, no network calls other
// than fetching the bundled rules.json.
//
// Injected on every youtube.com page, not just /watch: YouTube is a
// single-page app, so a visit that starts on the home page or search never
// loads a /watch-only script. It stays idle until the URL is a video.
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
    if (location.pathname !== '/watch') return null;
    return new URLSearchParams(location.search).get('v');
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

  // `signature` identifies the comment being hidden so that a user's "Show"
  // survives later scans (see WinnowDOM.isRevealed).
  function registerAndCount(element, reasonLabel, isThread, signature) {
    WinnowDOM.registerHidden(
      element,
      reasonLabel,
      isThread,
      () => {
        WinnowStorage.incrementStat('revealedCount', 1);
      },
      signature
    );
    WinnowStorage.incrementStat('hiddenThisWeek', 1);
  }

  function scoreComment(renderer) {
    const ctx = { videoId: currentVideoId, hashCache };
    const result = WinnowHeuristics.evaluateComment(renderer.text, rulesDoc, ctx);
    hashCacheDirty = true;
    return result && categoryEnabled(result.categoryKey) && result.score >= effectiveThreshold() ? result : null;
  }

  function scoreAndMaybeHide(renderer) {
    if (!renderer.text || isAllowed(renderer.authorId)) return;
    const signature = WinnowDOM.signatureOf(renderer);
    if (WinnowDOM.isRevealed(renderer.element, signature)) return;

    if (isBlocklisted(renderer.authorId)) {
      if (WinnowDOM.hideRenderer(renderer.element, 'blocklist')) {
        registerAndCount(renderer.element, `Blocked by you (${renderer.authorName || 'unknown'})`, false, signature);
      }
      return;
    }

    const result = scoreComment(renderer);
    if (result && WinnowDOM.hideRenderer(renderer.element, result.categoryKey)) {
      const label = rulesDoc.categories[result.categoryKey].label;
      registerAndCount(renderer.element, `${label} (${renderer.authorName || 'unknown'})`, false, signature);
    }
  }

  function reportImplicated(hit) {
    for (const { authorId, text } of hit.implicated) {
      if (!authorId || isAllowed(authorId)) continue;
      WinnowReport.submitReport({
        authorId,
        text,
        reasonCode: 'finance_chain',
        videoId: currentVideoId,
        rulesVersion: rulesDoc.version,
      });
    }
  }

  function runFinanceChainPass(thread, videoAuthorCounts, threadRevealed) {
    if (!categoryEnabled('finance_chain')) return;
    if (thread.replies.length === 0) return;
    const threadAuthorCounts = new Map();
    for (const r of [thread.seed, ...thread.replies]) {
      if (!r.authorId) continue;
      threadAuthorCounts.set(r.authorId, (threadAuthorCounts.get(r.authorId) || 0) + 1);
    }
    const hit = WinnowHeuristics.evaluateFinanceChain(
      {
        seedText: thread.seed.text,
        seedAuthorId: thread.seed.authorId,
        replies: thread.replies.map((r) => ({ authorId: r.authorId, text: r.text, timeText: r.timeText })),
        threadAuthorCounts,
        videoAuthorCounts,
      },
      rulesDoc
    );
    if (!hit) return;
    const label = rulesDoc.categories.finance_chain.label;

    if (hit.hideThread && !isAllowed(thread.seed.authorId)) {
      if (threadRevealed) return;
      if (WinnowDOM.hideThread(thread.threadEl, 'finance_chain')) {
        registerAndCount(
          thread.threadEl,
          `${label} (${hit.implicated.length} accounts)`,
          true,
          WinnowDOM.signatureOf(thread.seed)
        );
        reportImplicated(hit);
      }
      return;
    }

    // The seed doesn't name the "expert": it may be an ordinary comment the
    // ring replied under, so take out only the replies that do.
    let newlyHidden = false;
    for (const index of hit.replyIndexes) {
      const reply = thread.replies[index];
      if (isAllowed(reply.authorId)) continue;
      const signature = WinnowDOM.signatureOf(reply);
      if (WinnowDOM.isRevealed(reply.element, signature)) continue;
      if (WinnowDOM.hideRenderer(reply.element, 'finance_chain')) {
        registerAndCount(reply.element, `${label} (${reply.authorName || 'unknown'})`, false, signature);
        newlyHidden = true;
      }
    }
    if (newlyHidden) reportImplicated(hit);
  }

  function processThread(thread, videoAuthorCounts) {
    const { threadEl } = thread;
    if (WinnowDOM.isHidden(threadEl)) return;
    const threadRevealed = WinnowDOM.isRevealed(threadEl, WinnowDOM.signatureOf(thread.seed));

    if (settings.scorchedEarth && !threadRevealed) {
      // Scorched Earth: any single hit anywhere in the thread nukes the whole
      // reply chain (spec §8). Evaluate seed + replies before committing.
      const anyHit = [thread.seed, ...thread.replies].some((r) => {
        if (!r.text || isAllowed(r.authorId)) return false;
        return isBlocklisted(r.authorId) || !!scoreComment(r);
      });
      if (anyHit) {
        if (WinnowDOM.hideThread(threadEl, 'scorched_earth')) {
          registerAndCount(
            threadEl,
            `Scorched Earth (${thread.seed.authorName || 'unknown'})`,
            true,
            WinnowDOM.signatureOf(thread.seed)
          );
        }
        attachReportButtons(thread);
        return;
      }
    } else {
      scoreAndMaybeHide(thread.seed);
      for (const reply of thread.replies) scoreAndMaybeHide(reply);
    }

    runFinanceChainPass(thread, videoAuthorCounts, threadRevealed);
    attachReportButtons(thread);
  }

  function attachReportButtons(thread) {
    const ctx = { videoId: currentVideoId, rulesVersion: rulesDoc.version };
    const attach = (renderer) => {
      if (!renderer.element) return;
      WinnowReport.attachReportButton(renderer.element, renderer, rulesDoc.selectors, ctx, (reasonCode) => {
        const label = rulesDoc.categories[reasonCode] ? rulesDoc.categories[reasonCode].label : reasonCode;
        if (WinnowDOM.hideRenderer(renderer.element, reasonCode)) {
          registerAndCount(
            renderer.element,
            `Reported: ${label} (${renderer.authorName || 'unknown'})`,
            false,
            WinnowDOM.signatureOf(renderer)
          );
        }
        // A spam report also blocks the account locally, so its other
        // comments disappear too (the storage change triggers a rescan).
        // "Off-topic" is a judgement on one comment, not on the account.
        if (reasonCode !== 'offtopic' && renderer.authorId && !isAllowed(renderer.authorId)) {
          WinnowStorage.addToBlocklist(renderer.authorId);
        }
      });
    };
    attach(thread.seed);
    for (const reply of thread.replies) attach(reply);
  }

  function scan() {
    if (!settings || !settings.masterEnabled || !currentVideoId) return;
    const selectors = rulesDoc.selectors;
    const threads = [];
    // Comments per author across everything loaded: the scam-chain pass
    // needs to know whether a replier has spoken anywhere else on the video.
    const videoAuthorCounts = new Map();
    for (const threadEl of WinnowDOM.getThreadElements(selectors)) {
      const thread = WinnowDOM.extractThread(threadEl, selectors);
      if (!thread) continue;
      threads.push(thread);
      for (const r of [thread.seed, ...thread.replies]) {
        if (r.authorId) videoAuthorCounts.set(r.authorId, (videoAuthorCounts.get(r.authorId) || 0) + 1);
      }
    }
    for (const thread of threads) processThread(thread, videoAuthorCounts);
    WinnowDOM.ensurePill(selectors);
  }

  function stopObserving() {
    if (observer) observer.disconnect();
    observer = null;
  }

  function startObserving() {
    stopObserving();
    observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  async function persistHashCacheDebounced() {
    if (!hashCacheDirty) return;
    hashCacheDirty = false;
    await WinnowStorage.persistHashCache(hashCache);
  }

  // Called on every navigation signal; several can fire for one navigation,
  // so it does nothing unless the video actually changed (or `force`).
  async function initForVideo(force) {
    const videoId = getVideoId();
    if (!force && videoId === currentVideoId) return;
    currentVideoId = videoId;
    WinnowDOM.resetForNewVideo();
    stopObserving();
    if (!videoId) return;
    settings = await WinnowStorage.getSettings();
    blocklist = await WinnowStorage.getBlocklist();
    allowlist = await WinnowStorage.getAllowlist();
    if (videoId !== currentVideoId) return; // navigated again while loading
    if (!settings.masterEnabled) return;
    startObserving();
    scan();
  }

  function watchForNavigation() {
    document.addEventListener('yt-navigate-finish', () => initForVideo());
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
    if (area !== 'local' || !settings) return;
    if (changes.settings) {
      const wasEnabled = settings.masterEnabled;
      settings = { ...settings, ...changes.settings.newValue };
      if (wasEnabled && !settings.masterEnabled) {
        stopObserving();
        WinnowDOM.unhideAll();
        return;
      }
      if (!wasEnabled && settings.masterEnabled) {
        initForVideo(true);
        return;
      }
    }
    if (changes.blocklist) blocklist = changes.blocklist.newValue || { version: 0, channelIds: [] };
    if (changes.allowlist) allowlist = changes.allowlist.newValue || [];
    if (changes.settings || changes.blocklist || changes.allowlist) scan();
  });

  async function main() {
    rulesDoc = await loadRules();
    hashCache = await WinnowStorage.loadHashCache();
    watchForNavigation();
    await initForVideo();
  }

  main();
})();
