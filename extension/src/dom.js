// Winnow DOM layer — extraction, hide/reveal, sticky pill.
// Selectors come from rules.json (remote-fetchable) so a YouTube DOM change
// is a data fix, not a store resubmission (spec §10 risk #1).
(function (global) {
  function textOf(el) {
    return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
  }

  // YouTube author links are usually `/@handle` now rather than `/channel/UC...`.
  // We use the handle as the local identity key. Resolving handle -> UC channel
  // id is deferred to the backend phase (spec requires UC-form ids for the
  // public blocklist); for the fully-local Phase 3 build the handle is enough
  // to match a comment to the allow/blocklist and to reason about identity.
  function authorIdFromHref(href) {
    if (!href) return null;
    const chan = href.match(/\/channel\/(UC[\w-]{22})/);
    if (chan) return chan[1];
    const handle = href.match(/\/(@[^/?#]+)/);
    if (handle) return handle[1];
    return href;
  }

  function extractCommentRenderer(rendererEl, selectors) {
    const authorEl = rendererEl.querySelector(selectors.authorLink);
    const textEl = rendererEl.querySelector(selectors.commentText);
    return {
      element: rendererEl,
      authorId: authorEl ? authorIdFromHref(authorEl.getAttribute('href')) : null,
      authorName: textOf(authorEl),
      text: textOf(textEl),
    };
  }

  function getTopLevelRenderer(threadEl, selectors) {
    // First match in document order is the top-level comment: replies live
    // further down inside `#replies`, which is a later descendant.
    return threadEl.querySelector(selectors.commentRenderer);
  }

  function getReplyRenderers(threadEl, selectors) {
    const container = threadEl.querySelector(selectors.repliesContainer);
    if (!container) return [];
    return [...container.querySelectorAll(selectors.commentRenderer)];
  }

  function extractThread(threadEl, selectors) {
    const seedRenderer = getTopLevelRenderer(threadEl, selectors);
    if (!seedRenderer) return null;
    const seed = extractCommentRenderer(seedRenderer, selectors);
    const replyRenderers = getReplyRenderers(threadEl, selectors);
    const replies = replyRenderers.map((el) => extractCommentRenderer(el, selectors));
    return { threadEl, seed, replies };
  }

  function getThreadElements(selectors) {
    const section = document.querySelector(selectors.commentsSection);
    if (!section) return [];
    const contents = section.querySelector(selectors.commentsContentsList) || section;
    return [...contents.querySelectorAll(selectors.commentThread)];
  }

  const HIDDEN_ATTR = 'data-winnow-hidden';
  const HIDDEN_CLASS = 'winnow-hidden';

  function hideRenderer(rendererEl, reason) {
    if (rendererEl.hasAttribute(HIDDEN_ATTR)) return false;
    rendererEl.setAttribute(HIDDEN_ATTR, 'true');
    rendererEl.setAttribute('data-winnow-reason', reason || 'unknown');
    rendererEl.classList.add(HIDDEN_CLASS);
    return true;
  }

  function hideThread(threadEl, reason) {
    if (threadEl.hasAttribute(HIDDEN_ATTR)) return false;
    threadEl.setAttribute(HIDDEN_ATTR, 'true');
    threadEl.setAttribute('data-winnow-reason', reason || 'unknown');
    threadEl.classList.add(HIDDEN_CLASS);
    return true;
  }

  function revealElement(el) {
    el.removeAttribute(HIDDEN_ATTR);
    el.removeAttribute('data-winnow-reason');
    el.classList.remove(HIDDEN_CLASS);
    el.classList.add('winnow-revealed-flash');
  }

  function isHidden(el) {
    return el.hasAttribute(HIDDEN_ATTR);
  }

  // --- Sticky pill -----------------------------------------------------
  let pillEl = null;
  const hiddenRegistry = new Map(); // id -> { element, reasonLabel, isThread }
  let nextHiddenId = 1;

  function registerHidden(element, reasonLabel, isThread, onReveal) {
    const id = nextHiddenId++;
    hiddenRegistry.set(id, { element, reasonLabel, isThread, onReveal });
    updatePill();
    return id;
  }

  function unregisterHidden(id) {
    hiddenRegistry.delete(id);
    updatePill();
  }

  function ensurePill(selectors) {
    if (pillEl && document.body.contains(pillEl)) return pillEl;
    const section = document.querySelector(selectors.commentsSection);
    if (!section) return null;
    const header = section.querySelector(selectors.commentsHeader) || section;
    pillEl = document.createElement('div');
    pillEl.id = 'winnow-pill';
    pillEl.className = 'winnow-pill';
    pillEl.style.display = 'none';
    header.insertAdjacentElement('afterend', pillEl);
    pillEl.addEventListener('click', togglePillList);
    return pillEl;
  }

  let listOpen = false;
  function togglePillList() {
    listOpen = !listOpen;
    renderPillList();
  }

  function renderPillList() {
    if (!pillEl) return;
    let list = pillEl.querySelector('.winnow-pill-list');
    if (!listOpen) {
      if (list) list.remove();
      return;
    }
    if (!list) {
      list = document.createElement('div');
      list.className = 'winnow-pill-list';
      pillEl.appendChild(list);
    }
    list.innerHTML = '';
    for (const [id, entry] of hiddenRegistry.entries()) {
      const row = document.createElement('div');
      row.className = 'winnow-pill-row';
      const label = document.createElement('span');
      label.textContent = entry.reasonLabel;
      const btn = document.createElement('button');
      btn.textContent = 'Show';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        revealElement(entry.element);
        if (entry.onReveal) entry.onReveal();
        unregisterHidden(id);
      });
      row.appendChild(label);
      row.appendChild(btn);
      list.appendChild(row);
    }
  }

  function updatePill() {
    if (!pillEl) return;
    const count = hiddenRegistry.size;
    if (count === 0) {
      pillEl.style.display = 'none';
      return;
    }
    pillEl.style.display = 'flex';
    const countLabel = pillEl.querySelector('.winnow-pill-count') || document.createElement('span');
    countLabel.className = 'winnow-pill-count';
    countLabel.textContent = `${count} hidden`;
    if (!pillEl.contains(countLabel)) pillEl.prepend(countLabel);
    renderPillList();
  }

  function resetForNewVideo() {
    hiddenRegistry.clear();
    listOpen = false;
    if (pillEl) {
      pillEl.remove();
      pillEl = null;
    }
  }

  global.WinnowDOM = {
    resetForNewVideo,
    authorIdFromHref,
    extractThread,
    getThreadElements,
    hideRenderer,
    hideThread,
    revealElement,
    isHidden,
    ensurePill,
    registerHidden,
    unregisterHidden,
    textOf,
  };
})(typeof window !== 'undefined' ? window : globalThis);
