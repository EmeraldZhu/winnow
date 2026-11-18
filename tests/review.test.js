// Run with: node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const A = require(path.join(__dirname, '..', 'eval', 'accuracy.js'));
const R = require(path.join(__dirname, '..', 'eval', 'review.js'));
const rules = A.loadRules();
const labels = R.allLabels(rules);

const video = {
  video: 'v1',
  threads: [
    {
      seed: { author: '@user1', text: 'Message me on WhatsApp </script><b>x</b>', time: '1 day ago', label: 'promo_link' },
      replies: [{ author: '@user2', text: 'nice', time: '1 day ago', label: 'ok', note: 'Could be bait.' }],
    },
    { seed: { author: '@user3', text: 'check my profile', time: '', label: 'other_spam' } },
  ],
};

test('review: parses what the page copies, and rejects anything else', () => {
  const text = 'Label changes:\r\nv02 5.3 -> finance_chain\n\n v10 12.0->ok \n';
  assert.deepStrictEqual(R.parseChanges(text, labels), [
    { video: 'v02', thread: 5, comment: 3, label: 'finance_chain' },
    { video: 'v10', thread: 12, comment: 0, label: 'ok' },
  ]);
  assert.deepStrictEqual(R.parseChanges('No label changes.', labels), []);
  assert.throws(() => R.parseChanges('v02 5.3 -> spam', labels), /line 1: "spam" is not one of/);
  assert.throws(() => R.parseChanges('v02 thread 5 -> ok', labels), /line 1: expected/);
});

test('review: applies changes, and changes nothing if one of them is wrong', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'winnow-review-'));
  const file = path.join(dir, 'v1.json');
  fs.writeFileSync(file, JSON.stringify(video, null, 2) + '\n');
  const before = fs.readFileSync(file, 'utf8');

  assert.throws(
    () => R.applyChanges(dir, R.parseChanges('v1 1.1 -> finance_chain\nv1 1.5 -> ok\nv9 1.0 -> ok', labels)),
    /v1 1\.5: no such comment\nv9: no file/
  );
  assert.strictEqual(fs.readFileSync(file, 'utf8'), before);

  const applied = R.applyChanges(dir, R.parseChanges('v1 1.1 -> finance_chain\nv1 2.0 -> other_spam', labels));
  assert.deepStrictEqual(applied, ['v1 1.1: ok -> finance_chain']);
  const after = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.strictEqual(after.threads[0].replies[0].label, 'finance_chain');
  assert.strictEqual(after.threads[0].replies[0].note, 'Could be bait.');
  fs.rmSync(dir, { recursive: true });
});

test('review: the page carries every comment, its label and what the rules did', () => {
  const data = R.reviewData([video], rules, A.loadEngine());
  assert.deepStrictEqual(
    data[0].threads.flat().map((c) => [c.key, c.label, c.engine, c.note]),
    [
      ['v1 1.0', 'promo_link', 'promo_link', ''],
      ['v1 1.1', 'ok', null, 'Could be bait.'],
      ['v1 2.0', 'other_spam', null, ''],
    ]
  );
  const html = R.renderPage(data, rules);
  // Comment text cannot close the script block it is embedded in.
  assert.strictEqual((html.match(/<\/script>/g) || []).length, 1);
  assert.ok(html.includes('\\u003c/script>\\u003cb>x\\u003c/b>'));
  const script = html.slice(html.indexOf('<script>') + 8, html.indexOf('</script>'));
  assert.doesNotThrow(() => new Function(script.replace(/^const \{[^\n]+\n/, '')));
});

test('review: a page only reuses changes saved for the same comments', () => {
  const engine = A.loadEngine();
  const page = (v) => R.renderPage(R.reviewData([v], rules, engine), rules);
  const store = (html) => /"store":"(winnow-review:[0-9a-f]{16})"/.exec(html)[1];
  const relabelled = JSON.parse(JSON.stringify(video));
  relabelled.threads[0].replies[0].label = 'finance_chain';
  const otherSet = JSON.parse(JSON.stringify(video));
  otherSet.threads[0].replies[0].text = 'a different comment at the same position';

  assert.strictEqual(store(page(relabelled)), store(page(video)), 'applying a review keeps the store');
  assert.notStrictEqual(store(page(otherSet)), store(page(video)), 'another dataset with the same keys gets its own store');
});

test('review: the page shows what the rules did to spam no rule targets', () => {
  const v = { video: 'v1', threads: [{ seed: { author: '@user1', text: 'see my profile https://example.com', time: '', label: 'other_spam' } }] };
  assert.strictEqual(R.reviewData([v], rules, A.loadEngine())[0].threads[0][0].engine, 'promo_link');
});
