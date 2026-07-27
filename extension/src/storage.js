// Winnow storage layer — chrome.storage.local wrapper. Phase 3: fully
// offline. Blocklist/allowlist live locally; report queue accumulates
// locally until a backend exists to drain it into (spec §6/§9 Phase 4-5).
(function (global) {
  const DEFAULT_SETTINGS = {
    masterEnabled: true,
    categories: {
      engagement_farm: true,
      promo_link: true,
      finance_chain: true,
      offtopic: false, // report-only, no auto-hide
    },
    scorchedEarth: false,
  };

  const DEFAULT_STATS = {
    hiddenThisWeek: 0,
    weekStart: Date.now(),
    reportsContributed: 0,
    revealedCount: 0,
  };

  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function get(keys) {
    return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
  }
  function set(obj) {
    return new Promise((resolve) => chrome.storage.local.set(obj, resolve));
  }

  async function getInstallId() {
    const { installId } = await get('installId');
    if (installId) return installId;
    const id = uuid();
    await set({ installId: id, installFirstSeen: Date.now() });
    return id;
  }

  async function resetInstallId() {
    const id = uuid();
    await set({ installId: id, installFirstSeen: Date.now() });
    return id;
  }

  async function getSettings() {
    const { settings } = await get('settings');
    return { ...DEFAULT_SETTINGS, ...(settings || {}), categories: { ...DEFAULT_SETTINGS.categories, ...((settings || {}).categories || {}) } };
  }

  async function setSettings(partial) {
    const current = await getSettings();
    const merged = { ...current, ...partial, categories: { ...current.categories, ...(partial.categories || {}) } };
    await set({ settings: merged });
    return merged;
  }

  async function getBlocklist() {
    const { blocklist } = await get('blocklist');
    return blocklist || { version: 0, channelIds: [] };
  }

  async function setBlocklist(blocklist) {
    await set({ blocklist });
  }

  async function getAllowlist() {
    const { allowlist } = await get('allowlist');
    return allowlist || [];
  }

  async function setAllowlist(list) {
    await set({ allowlist: list });
  }

  async function addToAllowlist(channelId) {
    const list = await getAllowlist();
    if (!list.includes(channelId)) list.push(channelId);
    await setAllowlist(list);
    return list;
  }

  async function removeFromAllowlist(channelId) {
    const list = (await getAllowlist()).filter((id) => id !== channelId);
    await setAllowlist(list);
    return list;
  }

  const HASH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

  async function loadHashCache() {
    const { hashCache } = await get('hashCache');
    const map = new Map();
    const now = Date.now();
    if (hashCache) {
      for (const [hash, entry] of Object.entries(hashCache)) {
        if (now - entry.lastSeen <= HASH_TTL_MS) {
          map.set(hash, { videos: new Set(entry.videos), lastSeen: entry.lastSeen });
        }
      }
    }
    return map;
  }

  async function persistHashCache(map) {
    const now = Date.now();
    const obj = {};
    for (const [hash, entry] of map.entries()) {
      if (now - entry.lastSeen <= HASH_TTL_MS) {
        obj[hash] = { videos: [...entry.videos], lastSeen: entry.lastSeen };
      }
    }
    await set({ hashCache: obj });
  }

  async function getStats() {
    const { stats } = await get('stats');
    let s = { ...DEFAULT_STATS, ...(stats || {}) };
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - s.weekStart > weekMs) {
      s = { ...s, hiddenThisWeek: 0, weekStart: Date.now() };
      await set({ stats: s });
    }
    return s;
  }

  async function incrementStat(key, by = 1) {
    const s = await getStats();
    s[key] = (s[key] || 0) + by;
    await set({ stats: s });
    return s;
  }

  async function getReportQueue() {
    const { reportQueue } = await get('reportQueue');
    return reportQueue || [];
  }

  async function queueReport(report) {
    const queue = await getReportQueue();
    queue.push({ ...report, queuedAt: Date.now() });
    await set({ reportQueue: queue });
    return queue;
  }

  global.WinnowStorage = {
    getInstallId,
    resetInstallId,
    getSettings,
    setSettings,
    getBlocklist,
    setBlocklist,
    getAllowlist,
    setAllowlist,
    addToAllowlist,
    removeFromAllowlist,
    loadHashCache,
    persistHashCache,
    getStats,
    incrementStat,
    getReportQueue,
    queueReport,
  };
})(typeof window !== 'undefined' ? window : globalThis);
