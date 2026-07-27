(async function () {
  const { WinnowStorage } = window;

  const allowInput = document.getElementById('allow-input');
  const allowAdd = document.getElementById('allow-add');
  const allowList = document.getElementById('allow-list');
  const installIdEl = document.getElementById('install-id');
  const resetBtn = document.getElementById('reset-install');
  const resetStatus = document.getElementById('reset-status');
  const forceRefreshBtn = document.getElementById('force-refresh');
  const refreshStatus = document.getElementById('refresh-status');
  const blocklistVersionEl = document.getElementById('blocklist-version');
  const blocklistCountEl = document.getElementById('blocklist-count');

  async function renderAllowlist() {
    const list = await WinnowStorage.getAllowlist();
    allowList.innerHTML = '';
    if (list.length === 0) {
      allowList.innerHTML = '<p class="help">No channels allowlisted yet.</p>';
      return;
    }
    for (const id of list) {
      const row = document.createElement('div');
      row.className = 'list-item';
      const label = document.createElement('span');
      label.textContent = id;
      const removeBtn = document.createElement('button');
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', async () => {
        await WinnowStorage.removeFromAllowlist(id);
        renderAllowlist();
      });
      row.appendChild(label);
      row.appendChild(removeBtn);
      allowList.appendChild(row);
    }
  }

  allowAdd.addEventListener('click', async () => {
    const val = allowInput.value.trim();
    if (!val) return;
    await WinnowStorage.addToAllowlist(val);
    allowInput.value = '';
    renderAllowlist();
  });
  allowInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') allowAdd.click();
  });

  async function renderInstallId() {
    const id = await WinnowStorage.getInstallId();
    installIdEl.textContent = id;
  }

  resetBtn.addEventListener('click', async () => {
    await WinnowStorage.resetInstallId();
    await renderInstallId();
    resetStatus.textContent = 'Reset — new reports use a fresh ID.';
    setTimeout(() => (resetStatus.textContent = ''), 3000);
  });

  async function renderBlocklist() {
    const bl = await WinnowStorage.getBlocklist();
    blocklistVersionEl.textContent = `v${bl.version}`;
    blocklistCountEl.textContent = bl.channelIds.length;
  }

  forceRefreshBtn.addEventListener('click', async () => {
    // No backend/CDN snapshot exists yet (spec Phase 5) — this is a no-op
    // placeholder that will call the R2-hosted snapshot fetch once it ships.
    refreshStatus.textContent = 'No remote blocklist yet — local snapshot unchanged.';
    setTimeout(() => (refreshStatus.textContent = ''), 4000);
  });

  renderAllowlist();
  renderInstallId();
  renderBlocklist();
})();
