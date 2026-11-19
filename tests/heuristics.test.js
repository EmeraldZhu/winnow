// Run with: node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

globalThis.window = globalThis;
const src = path.join(__dirname, '..', 'extension', 'src');
require(path.join(src, 'heuristics.js'));
const rules = require(path.join(src, 'rules.json'));
const H = globalThis.WinnowHeuristics;

// Builds the input evaluateFinanceChain expects. `replies` are
// [authorId, text, timeText?]; `elsewhere` lists authors who also commented
// in other threads on the video.
function thread(seedText, replies, elsewhere = []) {
  const threadAuthorCounts = new Map([['@seed', 1]]);
  for (const [id] of replies) threadAuthorCounts.set(id, (threadAuthorCounts.get(id) || 0) + 1);
  const videoAuthorCounts = new Map(threadAuthorCounts);
  for (const id of elsewhere) videoAuthorCounts.set(id, (videoAuthorCounts.get(id) || 0) + 1);
  return {
    seedText,
    seedAuthorId: '@seed',
    replies: replies.map(([authorId, text, timeText]) => ({ authorId, text, timeText: timeText || '2 days ago' })),
    threadAuthorCounts,
    videoAuthorCounts,
  };
}

test('finance chain: seed names the expert, replies echo it -> whole thread', () => {
  const hit = H.evaluateFinanceChain(
    thread('Mrs Evelyn Vera changed my life, I made $30k trading with her', [
      ['@a', '@seed How can I reach Evelyn Vera?'],
      ['@b', 'I also work with Evelyn Vera, she is the best'],
    ]),
    rules
  );
  assert.ok(hit);
  assert.strictEqual(hit.entity, 'evelyn vera');
  assert.strictEqual(hit.hideThread, true);
  assert.deepStrictEqual(hit.implicated.map((i) => i.authorId), ['@seed', '@a', '@b']);
});

test('finance chain: ring replies under an ordinary seed -> only those replies', () => {
  const hit = H.evaluateFinanceChain(
    thread('I am 45 and worried my investments will not cover retirement', [
      ['@a', 'You need an advisor. Marcus Hale Dunn grew my portfolio 4x'],
      ['@real', 'Index funds and patience, honestly'],
      ['@b', 'Marcus Hale Dunn is who I use as well, look him up'],
    ]),
    rules
  );
  assert.ok(hit);
  assert.strictEqual(hit.hideThread, false);
  assert.deepStrictEqual(hit.replyIndexes, [0, 2]);
  assert.deepStrictEqual(hit.implicated.map((i) => i.authorId), ['@a', '@b']);
});

test('finance chain: ordinary threads are left alone', () => {
  const ordinary = [
    // "expert" / "investigate" used to trip the old substring lexicon
    thread("You're clearly an expert at explaining things, thank you!", [['@a', 'agreed'], ['@b', 'so true']]),
    thread('Someone should investigate this bug', [['@a', 'yes'], ['@b', '+1']]),
    // finance topic, but nobody names a shared entity
    thread('Trading forex ruined my sleep schedule', [['@a', 'Same here lol'], ['@b', 'Take a break man']]),
    // replies only share the automatic "@seed" prefix
    thread('I started investing last year', [['@a', '@seed nice'], ['@b', '@seed me too']]),
    // only one reply names the entity
    thread('Is crypto still worth it?', [['@a', 'Ask Evelyn Vera'], ['@b', 'no idea']]),
  ];
  for (const t of ordinary) assert.strictEqual(H.evaluateFinanceChain(t, rules), null, t.seedText);
});

test('finance chain: needs distinct, otherwise-silent authors posting close together', () => {
  const seed = 'Evelyn Vera changed my life with bitcoin trading';
  const replies = [['@a', 'Evelyn Vera is great'], ['@b', 'Evelyn Vera helped me too']];
  assert.ok(H.evaluateFinanceChain(thread(seed, replies), rules));
  // same author twice
  assert.strictEqual(H.evaluateFinanceChain(thread(seed, [replies[0], ['@a', 'Evelyn Vera again']]), rules), null);
  // one replier is active elsewhere on the video
  assert.strictEqual(H.evaluateFinanceChain(thread(seed, replies, ['@b']), rules), null);
  // posted months apart
  const spread = [['@a', 'Evelyn Vera is great', '2 days ago'], ['@b', 'Evelyn Vera helped me too', '5 months ago']];
  assert.strictEqual(H.evaluateFinanceChain(thread(seed, spread), rules), null);
});

test('parseRelativeTime', () => {
  assert.deepStrictEqual(H.parseRelativeTime('3 days ago (edited)'), { age: 259200, unit: 86400 });
  assert.deepStrictEqual(H.parseRelativeTime('1 hour ago'), { age: 3600, unit: 3600 });
  assert.strictEqual(H.parseRelativeTime('hace 3 días'), null);
});

test('pure-emoji rule fires on emoji text', () => {
  const r = H.evaluateComment('🔥🔥🔥🔥🔥🔥', rules, { videoId: 'v', hashCache: new Map() });
  assert.ok(r && r.score >= rules.threshold);
});

// najaribu issue #9: the repeat rule must not hide short phrases everyone types.
function seenOn(text, videoIds, hashCache = new Map()) {
  return videoIds.map((videoId) => H.evaluateComment(text, rules, { videoId, hashCache }));
}

test('repeat: short common phrases are not hidden for repetition alone', () => {
  for (const text of ['Great video!', 'first', 'lol', 'Thanks for sharing this ❤️', '  great   VIDEO!  ']) {
    const hashCache = new Map();
    const results = seenOn(text, ['v1', 'v2', 'v3', 'v4', 'v5'], hashCache);
    for (const r of results) {
      assert.ok(!r || !r.hits.some((h) => h.ruleId === 'repeat_cross_video'), `repeat fired on ${JSON.stringify(text)}`);
    }
    assert.strictEqual(hashCache.size, 0, 'short comments are not cached');
  }
});

test('repeat: a long identical comment on three videos is hidden', () => {
  const text = 'I made so much money working from home with this one simple method, check my channel';
  const results = seenOn(text, ['v1', 'v2', 'v3']);
  assert.strictEqual(results[0], null);
  assert.strictEqual(results[1], null);
  assert.ok(results[2].hits.some((h) => h.ruleId === 'repeat_cross_video'));
  assert.ok(results[2].score >= rules.threshold);
});

test('repeat: the same long comment twice on one video does not count', () => {
  const text = 'I made so much money working from home with this one simple method, check my channel';
  const results = seenOn(text, ['v1', 'v1', 'v1', 'v2']);
  assert.ok(results.every((r) => r === null));
});
