// Run with: node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const A = require(path.join(__dirname, '..', 'eval', 'accuracy.js'));
const { pseudonymise, buildSnippet } = require(path.join(__dirname, '..', 'eval', 'capture.js'));
const rules = A.loadRules();
const H = A.loadEngine();

const c = (author, text, label, time = '2 days ago') => ({ author, text, label, time });

// One video: a scam chain with a bystander, a caught and a missed promo
// comment, a wrongly hidden ordinary comment, and spam no rule targets.
const video = {
  video: 'v1',
  threads: [
    {
      seed: c('@user1', 'Mrs Evelyn Vera changed my life, I made $30k trading with her', 'finance_chain'),
      replies: [
        c('@user2', '@user1 How can I reach Evelyn Vera?', 'finance_chain'),
        c('@user3', 'I also work with Evelyn Vera, she is the best', 'finance_chain'),
        c('@user4', 'this is a scam, ignore it', 'ok'),
      ],
    },
    { seed: c('@user5', 'Message me on WhatsApp for a discount', 'promo_link'), replies: [] },
    { seed: c('@user6', 'cheap followers at my channel', 'promo_link'), replies: [] },
    { seed: c('@user7', 'Like if you cried at the ending', 'ok'), replies: [] },
    { seed: c('@user8', 'I am 18 and bored, see my profile', 'other_spam'), replies: [] },
    { seed: c('@user4', 'Great video, thanks', 'ok'), replies: [] },
  ],
};

test('accuracy: counts per category, overall and per chain thread', () => {
  const r = A.evaluate([video], rules, H);
  // The bystander reply goes with the hidden thread: flagged, not correct.
  assert.deepStrictEqual(
    { ...r.categories.finance_chain },
    { labelled: 3, flagged: 4, correct: 3, precision: 0.75, recall: 1 }
  );
  assert.deepStrictEqual({ ...r.categories.promo_link }, { labelled: 2, flagged: 1, correct: 1, precision: 1, recall: 0.5 });
  // "like if you" scores 0.8, under the threshold: not hidden.
  assert.strictEqual(r.categories.engagement_farm.flagged, 0);
  assert.strictEqual(r.categories.engagement_farm.precision, null);
  assert.deepStrictEqual(r.undetectable, { other_spam: { labelled: 1, hidden: 0 } });
  assert.deepStrictEqual(r.chains, { labelled: 1, caught: 1, recall: 1 });
  assert.strictEqual(r.overall.comments, 9);
  assert.strictEqual(r.overall.spamHidden, 4);
  assert.strictEqual(r.overall.okHidden, 1);
  assert.strictEqual(r.overall.falsePositiveRate, 1 / 3);
  assert.deepStrictEqual(
    r.errors.map((e) => [e.thread, e.comment, e.label, e.predicted]),
    [
      [1, 3, 'ok', 'finance_chain'],
      [3, 0, 'promo_link', null],
    ]
  );
  assert.match(A.formatReport(r), /finance_chain\s+3\s+4\s+3\s+75\.0%\s+100\.0%/);
});

test('accuracy: cross-video repeats are scored across videos, in order', () => {
  const same = (id) => ({ video: id, threads: [{ seed: c('@user1', 'best song ever made', 'engagement_farm'), replies: [] }] });
  const r = A.evaluate([same('v1'), same('v2'), same('v3')], rules, H);
  assert.strictEqual(r.categories.engagement_farm.correct, 1); // only the third sighting
});

test('accuracy: rejects unlabelled comments, unknown labels and real identities', () => {
  const bad = {
    video: 'dQw4w9WgXcQ',
    threads: [{ seed: c('@realhandle', 'hello', ''), replies: [c('@user2', 'hi', 'spam'), c(null, '', 'ok')] }],
  };
  const problems = A.validateVideo(bad, rules, 'bad.json');
  assert.strictEqual(problems.length, 5);
  assert.deepStrictEqual(A.validateVideo(video, rules, 'good.json'), []);
});

test('the committed test set is valid and carries no real handles', () => {
  const { problems } = A.loadDataset(A.DATA_DIR, rules);
  assert.deepStrictEqual(problems, []);
});

test('capture: authors and mentions of them become pseudonyms', () => {
  const out = pseudonymise([
    {
      seed: { author: '@Jane.Doe', text: 'Ask @CryptoGuru_fx about bitcoin', time: '1 day ago' },
      replies: [
        { author: '@bob', text: '@jane.doe thanks. cc @Jane.Doe-2 and @bobby', time: '1 day ago' },
        { author: '@Jane.Doe-2', text: 'Agree with @Bob.', time: '1 day ago' },
        { author: null, text: 'no author', time: '' },
      ],
    },
  ]);
  assert.deepStrictEqual(out, [
    {
      seed: { author: '@user1', text: 'Ask @CryptoGuru_fx about bitcoin', time: '1 day ago', label: '' },
      replies: [
        { author: '@user2', text: '@user1 thanks. cc @user3 and @bobby', time: '1 day ago', label: '' },
        { author: '@user3', text: 'Agree with @user2.', time: '1 day ago', label: '' },
        { author: null, text: 'no author', time: '', label: '' },
      ],
    },
  ]);
});

test('capture: the snippet is valid JavaScript', () => {
  assert.doesNotThrow(() => new Function(`return ${buildSnippet('v1')}`));
});
