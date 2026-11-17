#!/usr/bin/env node
// Prints a snippet that copies the comments loaded on a YouTube watch page
// as a test-set file, with commenter identities already replaced.
//
//   node eval/capture.js v07      (pipe to `clip` / `pbcopy`)
//
// Then, on the video's page: scroll to load the comments you want, expand the
// reply threads you want, paste the snippet into the DevTools console, and
// save what it copies as eval/data/v07.json. Fill in each "label" by hand.
//
// The snippet embeds extension/src/dom.js and the selectors from rules.json,
// so it reads the page exactly as the extension does. Nothing leaves the
// browser, and the video's id is not recorded.
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'extension', 'src');

// Replaces every author with "@user<N>", numbered in order of appearance, and
// rewrites mentions of those authors inside comment text to match (YouTube
// starts each reply with "@whoever-it-answers"). Handles of people who did
// not comment in the capture are left alone: in spam they are usually the
// account being advertised, which is the signal. Names typed in plain text
// cannot be found automatically; check for them while labelling.
function pseudonymise(threads) {
  const ids = new Map();
  const idFor = (raw) => {
    if (!raw) return null;
    const key = String(raw).toLowerCase();
    if (!ids.has(key)) ids.set(key, `@user${ids.size + 1}`);
    return ids.get(key);
  };
  const all = (thread) => [thread.seed, ...thread.replies];
  for (const thread of threads) for (const c of all(thread)) idFor(c.author);

  const handles = [...ids.keys()].filter((k) => k.startsWith('@')).sort((a, b) => b.length - a.length);
  const escaped = handles.map((h) => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const mention = handles.length ? new RegExp(`(?:${escaped.join('|')})(?![\\w-]|\\.\\w)`, 'gi') : null;
  const scrub = (text) => (mention ? text.replace(mention, (m) => ids.get(m.toLowerCase())) : text);

  const clean = (c) => ({ author: idFor(c.author), text: scrub(c.text), time: c.time, label: '' });
  return threads.map((thread) => ({ seed: clean(thread.seed), replies: thread.replies.map(clean) }));
}

// Runs in the page. `dom` is the extension's WinnowDOM.
function capture(dom, selectors, videoLabel, pseudonymise) {
  const decode = (id) => {
    try {
      return id ? decodeURIComponent(id) : id;
    } catch (e) {
      return id;
    }
  };
  const plain = (r) => ({ author: decode(r.authorId), text: r.text, time: r.timeText });
  const threads = [];
  for (const threadEl of dom.getThreadElements(selectors)) {
    const thread = dom.extractThread(threadEl, selectors);
    if (!thread || !thread.seed.text) continue;
    threads.push({ seed: plain(thread.seed), replies: thread.replies.filter((r) => r.text).map(plain) });
  }
  if (!threads.length) return 'No comments found. Scroll down until comments have loaded, then run this again.';
  return JSON.stringify(
    // en-CA formats as YYYY-MM-DD, in local time (toISOString is UTC and can be a day off).
    { video: videoLabel, collected: new Date().toLocaleDateString('en-CA'), threads: pseudonymise(threads) },
    null,
    2
  );
}

function buildSnippet(videoLabel) {
  const domSource = fs.readFileSync(path.join(SRC, 'dom.js'), 'utf8');
  const { selectors } = JSON.parse(fs.readFileSync(path.join(SRC, 'rules.json'), 'utf8'));
  return [
    '(() => {',
    'const window = {}; // dom.js attaches WinnowDOM here, not to the page',
    domSource,
    pseudonymise.toString(),
    capture.toString(),
    `const out = capture(window.WinnowDOM, ${JSON.stringify(selectors)}, ${JSON.stringify(videoLabel)}, pseudonymise);`,
    "if (typeof copy === 'function') copy(out);",
    'return out;',
    '})()',
  ].join('\n');
}

if (require.main === module) {
  const label = process.argv[2];
  if (!/^v\d+$/.test(label || '')) {
    console.error('Usage: node eval/capture.js v07   (the label this video gets in the test set)');
    process.exitCode = 1;
  } else {
    console.log(buildSnippet(label));
  }
}

module.exports = { pseudonymise, buildSnippet };
