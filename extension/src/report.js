// Winnow report UI — hover "Report as spam" + reason picker (spec §8).
// Reporting is optimistic: the comment vanishes locally immediately and the
// report is queued (WinnowStorage.queueReport) for the sync phase.
(function (global) {
  const REASONS = [
    { code: 'engagement_farm', label: 'Engagement farming' },
    { code: 'promo_link', label: 'Promo / link spam' },
    { code: 'finance_chain', label: 'Financial / crypto scam' },
    { code: 'offtopic', label: 'Off-topic / irrelevant' },
  ];

  let openMenu = null;
  function closeMenu() {
    if (openMenu) {
      openMenu.remove();
      openMenu = null;
      document.removeEventListener('click', closeMenu, true);
    }
  }

  async function submitReport({ authorId, text, reasonCode, videoId, rulesVersion }) {
    const installId = await global.WinnowStorage.getInstallId();
    const commentHash = global.WinnowHeuristics.simpleHash((text || '').trim().toLowerCase());
    await global.WinnowStorage.queueReport({
      channelId: authorId,
      reasonCode,
      commentHash,
      videoHmac: videoId, // real HMAC computation happens server-side once a backend exists (spec §6)
      rulesVersion,
      installId,
    });
    await global.WinnowStorage.incrementStat('reportsContributed', 1);
  }

  function openReasonMenu(anchorBtn, onPick) {
    closeMenu();
    const menu = document.createElement('div');
    menu.className = 'winnow-reason-menu';
    for (const reason of REASONS) {
      const btn = document.createElement('button');
      btn.textContent = `Report: ${reason.label}`;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeMenu();
        onPick(reason.code);
      });
      menu.appendChild(btn);
    }
    document.body.appendChild(menu);
    const rect = anchorBtn.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.left = `${Math.max(4, rect.left - 100)}px`;
    openMenu = menu;
    setTimeout(() => document.addEventListener('click', closeMenu, true), 0);
  }

  // `comment` = { element, authorId, text } from dom.js extraction.
  // `onReported(reasonCode)` lets content.js decide hide-single-vs-thread and
  // register the pill entry.
  function attachReportButton(rendererEl, comment, selectors, context, onReported) {
    if (rendererEl.hasAttribute('data-winnow-report-attached')) return;
    const actionRow = rendererEl.querySelector(selectors.actionButtons);
    if (!actionRow) return;
    rendererEl.setAttribute('data-winnow-report-attached', 'true');

    const btn = document.createElement('button');
    btn.className = 'winnow-report-btn';
    btn.textContent = 'Report as spam';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openReasonMenu(btn, async (reasonCode) => {
        await submitReport({
          authorId: comment.authorId,
          text: comment.text,
          reasonCode,
          videoId: context.videoId,
          rulesVersion: context.rulesVersion,
        });
        onReported(reasonCode);
      });
    });
    actionRow.appendChild(btn);
  }

  global.WinnowReport = { attachReportButton, submitReport, REASONS };
})(typeof window !== 'undefined' ? window : globalThis);
