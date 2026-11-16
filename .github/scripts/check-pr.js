// Checks that a pull request description follows .github/PULL_REQUEST_TEMPLATE.md.
// See CONTRIBUTING.md.
//
// In CI:    node .github/scripts/check-pr.js            (reads GITHUB_EVENT_PATH)
// Locally:  node .github/scripts/check-pr.js body.md    (reads the file as the description)
const fs = require('node:fs');

const REQUIRED_SECTIONS = ['Summary', 'Linked issue', 'Proposal', 'Changes', 'Testing', 'Docs updated', 'Known limits'];
const CLOSES_RE = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#\d+/i;

function check(body) {
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

  for (const name of REQUIRED_SECTIONS) {
    const content = sections.get(name.toLowerCase());
    if (content === undefined) problems.push(`Missing section "## ${name}".`);
    else if (!content.trim()) problems.push(`Section "## ${name}" is empty.`);
  }

  const linked = sections.get('linked issue');
  if (linked !== undefined && linked.trim() && !CLOSES_RE.test(linked)) {
    problems.push('Section "## Linked issue" must contain "Closes #N" (or Fixes / Resolves).');
  }
  return problems;
}

function main() {
  let body;
  if (process.argv[2]) {
    body = fs.readFileSync(process.argv[2], 'utf8');
  } else {
    const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
    body = event.pull_request && event.pull_request.body;
  }
  const problems = check(body);
  if (problems.length === 0) {
    console.log('Pull request description follows the template.');
    return;
  }
  console.error('Pull request description does not follow .github/PULL_REQUEST_TEMPLATE.md:\n');
  for (const p of problems) console.error(`  - ${p}`);
  console.error('\nEdit the description to fix this; the check re-runs on edit. See CONTRIBUTING.md.');
  process.exit(1);
}

if (require.main === module) main();
module.exports = { check };
