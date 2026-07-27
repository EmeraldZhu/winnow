// Winnow service worker. Phase 3 (current): no backend exists yet, so the
// daily sync alarm is a stub that will start actually fetching
// blocklist/rules snapshots once Phase 5 (worker + R2) ships (see spec §9).
const DAILY_SYNC_ALARM = 'winnow-daily-sync';

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(DAILY_SYNC_ALARM, { periodInMinutes: 60 * 24 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === DAILY_SYNC_ALARM) {
    // TODO(Phase 5): fetch versioned blocklist snapshot from R2/CDN with
    // ETag, merge into chrome.storage.local's `blocklist` key, and drain
    // the local `reportQueue` to the /report worker endpoint.
  }
});
