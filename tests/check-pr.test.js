const test = require('node:test');
const assert = require('node:assert');
const { check, isRelease } = require('../.github/scripts/check-pr.js');

const SECTIONS = ['Summary', 'Linked issue', 'Proposal', 'Changes', 'Testing', 'Docs updated', 'Known limits'];
const fullBody = (overrides = {}) =>
  SECTIONS.map((s) => `## ${s}\n\n${overrides[s] ?? (s === 'Linked issue' ? 'Closes #5' : 'Text.')}\n`).join('\n');

const pr = (headRef, baseRef, headRepo = 'o/winnow') => ({
  head: { ref: headRef, repo: { full_name: headRepo } },
  base: { ref: baseRef, repo: { full_name: 'o/winnow' } },
});

test('a complete description passes', () => {
  assert.deepStrictEqual(check(fullBody()), []);
});

test('an empty description fails on every section', () => {
  assert.strictEqual(check('').length, SECTIONS.length);
  assert.strictEqual(check(null).length, SECTIONS.length);
});

test('a section holding only a template comment counts as empty', () => {
  const problems = check(fullBody({ Testing: '<!-- what was run -->' }));
  assert.deepStrictEqual(problems, ['Section "## Testing" is empty.']);
});

test('the linked issue section needs Closes #N', () => {
  const problems = check(fullBody({ 'Linked issue': 'See the tracker.' }));
  assert.strictEqual(problems.length, 1);
  assert.match(problems[0], /Closes #N/);
});

test('a release needs only a summary', () => {
  assert.deepStrictEqual(check('## Summary\n\nShips #7 and #9.\n', { release: true }), []);
  assert.strictEqual(check('', { release: true }).length, 1);
  assert.strictEqual(check('## Summary\n\n<!-- todo -->\n', { release: true }).length, 1);
});

test('only dev -> master inside this repository is a release', () => {
  assert.strictEqual(isRelease(pr('dev', 'master')), true);
  assert.strictEqual(isRelease(pr('fix/1-x', 'master')), false);
  assert.strictEqual(isRelease(pr('fix/1-x', 'dev')), false);
  assert.strictEqual(isRelease(pr('dev', 'master', 'someone/fork')), false);
  assert.strictEqual(isRelease(undefined), false);
});
