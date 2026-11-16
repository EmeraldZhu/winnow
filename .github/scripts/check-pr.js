// Checks that a pull request description follows .github/PULL_REQUEST_TEMPLATE.md.
// See CONTRIBUTING.md.
//
// In CI:    node .github/scripts/check-pr.js                     (reads GITHUB_EVENT_PATH)
// Locally:  node .github/scripts/check-pr.js body.md             (reads the file as the description)
//           node .github/scripts/check-pr.js body.md --release   (checks it as a dev -> master release)
const fs = require('node:fs');

const REQUIRED_SECTIONS = ['Summary', 'Linked issue', 'Proposal', 'Changes', 'Testing', 'Docs updated', 'Known limits'];
// A release pull request (dev -> master) bundles changes that each already
// passed the full check on their way into dev, so it only has to say what it ships.
const RELEASE_SECTIONS = ['Summary'];
const CLOSES_RE = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#\d+/i;

function isRelease(pullRequest) {
  if (!pullRequest || !pullRequest.head || !pullRequest.base) return false;
  const sameRepo =
    pullRequest.head.repo && pullRequest.base.repo && pullRequest.head.repo.full_name === pullRequest.base.repo.full_name;
  return Boolean(sameRepo) && pullRequest.head.ref === 'dev' && pullRequest.base.ref === 'master';
}

function check(body, { release = false } = {}) {
  const problems = [];
  // Template guidance lives in HTML comments; a section holding only that is empty.
  const text = (body || '').replace(/\r\n/g, '\n').replace(/<!--[\s\S]*?-->/g, '');

  const sections = new Map();
  let current = null;
  for (const line of text.split('\n')) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading) {
      current = heading[1].toLowerCase();
      sections.set(current, '');
    } else if (current) {
      sections.set(current, sections.get(current) + line + '\n');
    }
  }

  for (const name of release ? RELEASE_SECTIONS : REQUIRED_SECTIONS) {
    const content = sections.get(name.toLowerCase());
    if (content === undefined) problems.push(`Missing section "## ${name}".`);
    else if (!content.trim()) problems.push(`Section "## ${name}" is empty.`);
  }
  if (release) return problems;

  const linked = sections.get('linked issue');
  if (linked !== undefined && linked.trim() && !CLOSES_RE.test(linked)) {
    problems.push('Section "## Linked issue" must contain "Closes #N" (or Fixes / Resolves).');
  }
  return problems;
}

function main() {
  let body;
  let release;
  if (process.argv[2]) {
    body = fs.readFileSync(process.argv[2], 'utf8');
    release = process.argv.includes('--release');
  } else {
    const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
    body = event.pull_request && event.pull_request.body;
    release = isRelease(event.pull_request);
  }
  const problems = check(body, { release });
  if (problems.length === 0) {
    console.log(release ? 'Release pull request has a summary.' : 'Pull request description follows the template.');
    return;
  }
  console.error(
    release
      ? 'Release pull request (dev -> master) needs a "## Summary" section saying what it ships:\n'
      : 'Pull request description does not follow .github/PULL_REQUEST_TEMPLATE.md:\n'
  );
  for (const p of problems) console.error(`  - ${p}`);
  console.error('\nEdit the description to fix this; the check re-runs on edit. See CONTRIBUTING.md.');
  process.exit(1);
}

if (require.main === module) main();
module.exports = { check, isRelease };
