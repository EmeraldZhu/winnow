(async function () {
  const { WinnowStorage } = window;

  const els = {
    masterEnabled: document.getElementById('masterEnabled'),
    scorchedEarth: document.getElementById('scorchedEarth'),
    catFarm: document.getElementById('cat-engagement_farm'),
    catPromo: document.getElementById('cat-promo_link'),
    catFinance: document.getElementById('cat-finance_chain'),
    catOfftopic: document.getElementById('cat-offtopic'),
    statHidden: document.getElementById('stat-hidden'),
    statReports: document.getElementById('stat-reports'),
    statVersion: document.getElementById('stat-version'),
    openOptions: document.getElementById('open-options'),
    seModal: document.getElementById('se-modal'),
    seCancel: document.getElementById('se-cancel'),
    seConfirm: document.getElementById('se-confirm'),
  };

  async function render() {
    const settings = await WinnowStorage.getSettings();
    els.masterEnabled.checked = settings.masterEnabled;
    els.scorchedEarth.checked = settings.scorchedEarth;
    els.catFarm.checked = settings.categories.engagement_farm;
    els.catPromo.checked = settings.categories.promo_link;
    els.catFinance.checked = settings.categories.finance_chain;
    els.catOfftopic.checked = settings.categories.offtopic;

    const stats = await WinnowStorage.getStats();
    els.statHidden.textContent = stats.hiddenThisWeek;
    els.statReports.textContent = stats.reportsContributed;

    const blocklist = await WinnowStorage.getBlocklist();
    els.statVersion.textContent = `v${blocklist.version}`;
  }

  els.masterEnabled.addEventListener('change', () => WinnowStorage.setSettings({ masterEnabled: els.masterEnabled.checked }));
  els.catFarm.addEventListener('change', () => WinnowStorage.setSettings({ categories: { engagement_farm: els.catFarm.checked } }));
  els.catPromo.addEventListener('change', () => WinnowStorage.setSettings({ categories: { promo_link: els.catPromo.checked } }));
  els.catFinance.addEventListener('change', () => WinnowStorage.setSettings({ categories: { finance_chain: els.catFinance.checked } }));
  els.catOfftopic.addEventListener('change', () => WinnowStorage.setSettings({ categories: { offtopic: els.catOfftopic.checked } }));

  els.scorchedEarth.addEventListener('change', async () => {
    if (!els.scorchedEarth.checked) {
      await WinnowStorage.setSettings({ scorchedEarth: false });
      return;
    }
    const settings = await WinnowStorage.getSettings();
    if (settings.seenScorchedEarthModal) {
      await WinnowStorage.setSettings({ scorchedEarth: true });
      return;
    }
    els.scorchedEarth.checked = false; // revert until confirmed
    els.seModal.style.display = 'flex';
  });

  els.seCancel.addEventListener('click', () => {
    els.seModal.style.display = 'none';
  });

  els.seConfirm.addEventListener('click', async () => {
    els.seModal.style.display = 'none';
    els.scorchedEarth.checked = true;
    await WinnowStorage.setSettings({ scorchedEarth: true, seenScorchedEarthModal: true });
  });

  els.openOptions.addEventListener('click', () => chrome.runtime.openOptionsPage());

  render();
})();
