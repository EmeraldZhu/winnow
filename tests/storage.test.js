// Run with: node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

// Minimal chrome.storage.local: async like the real one, so overlapping
// read-modify-write callers interleave unless storage.js serializes them.
const store = {};
globalThis.chrome = {
  storage: {
    local: {
      get(keys, cb) {
        const wanted = typeof keys === 'string' ? [keys] : keys;
        const out = {};
        for (const k of wanted) if (k in store) out[k] = structuredClone(store[k]);
        setTimeout(() => cb(out), 1);
      },
      set(obj, cb) {
        Object.assign(store, structuredClone(obj));
        setTimeout(cb, 1);
      },
    },
  },
};
globalThis.window = globalThis;
require(path.join(__dirname, '..', 'extension', 'src', 'storage.js'));
const S = globalThis.WinnowStorage;

test('concurrent stat increments are all kept', async () => {
  await Promise.all(Array.from({ length: 9 }, () => S.incrementStat('hiddenThisWeek', 1)));
  assert.strictEqual((await S.getStats()).hiddenThisWeek, 9);
});

test('concurrent reports are all queued, duplicates dropped', async () => {
  const report = (i) => ({ channelId: `@acct${i}`, reasonCode: 'finance_chain', videoHmac: 'vid', commentHash: 'h1' });
  const added = await Promise.all(Array.from({ length: 9 }, (_, i) => S.queueReport(report(i))));
  assert.ok(added.every(Boolean));
  assert.strictEqual((await S.getReportQueue()).length, 9);
  assert.strictEqual(await S.queueReport(report(0)), false);
  assert.strictEqual((await S.getReportQueue()).length, 9);
});

test('blocklist add / remove', async () => {
  await Promise.all([S.addToBlocklist('@a'), S.addToBlocklist('@b'), S.addToBlocklist('@a')]);
  assert.deepStrictEqual((await S.getBlocklist()).channelIds, ['@a', '@b']);
  await S.removeFromBlocklist('@a');
  assert.deepStrictEqual((await S.getBlocklist()).channelIds, ['@b']);
});
