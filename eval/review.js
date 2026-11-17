#!/usr/bin/env node
// Label review: a page for checking the test set's labels by eye, and a
// command that writes the corrections back.
//
//   node eval/review.js                   writes eval/review.html; open it in a browser
//   node eval/review.js apply <file>      applies the changes the page copied
//   node eval/review.js apply -           same, reading them from stdin
//
// The page is one self-contained file: no network, no server. It shows every
// comment with its label and with what the rules do to it, and lets the
// reviewer pick a different label. "Copy my changes" gives lines like
//   v02 5.3 -> finance_chain
// (video, thread.comment, new label; comment 0 is the thread's top comment).
// See eval/README.md.
const fs = require('node:fs');
const path = require('node:path');
const A = require('./accuracy.js');

const PAGE = path.join(__dirname, 'review.html');

const NAMES = {
  ok: 'Not spam',
  engagement_farm: 'Engagement farming',
  promo_link: 'Promo / link',
  finance_chain: 'Scam chain',
  offtopic: 'Off-topic',
  other_spam: 'Other spam',
};

function allLabels(rules) {
  return ['ok', ...Object.keys(rules.categories), 'other_spam'];
}

// Every comment with its position key, its label, the reviewer note if any,
// and the category the rules hide it for (null when they leave it alone).
function reviewData(videos, rules, H) {
  const report = A.evaluate(videos, rules, H);
  const wrong = new Map(report.errors.map((e) => [`${e.video} ${e.thread}.${e.comment}`, e.predicted]));
  const detectable = new Set(Object.keys(report.categories));
  return videos.map((v) => ({
    video: v.video,
    threads: v.threads.map((t, ti) =>
      [t.seed, ...(t.replies || [])].map((c, ci) => {
        const key = `${v.video} ${ti + 1}.${ci}`;
        // Errors list only the comments the rules got wrong; for the rest the
        // rules agree with the label (or leave an undetectable label alone).
        const engine = wrong.has(key) ? wrong.get(key) : detectable.has(c.label) ? c.label : null;
        return { key, author: c.author, time: c.time || '', text: c.text, label: c.label, engine, note: c.note || '' };
      })
    ),
  }));
}

// Reads "v02 5.3 -> finance_chain" lines. Blank lines and the
// "Label changes:" header the page adds are skipped; anything else is an error.
function parseChanges(text, labels) {
  const changes = [];
  const problems = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || /^label changes:?$/i.test(line) || /^no label changes\.?$/i.test(line)) return;
    const m = /^(v\d+)\s+(\d+)\.(\d+)\s*->\s*(\S+)$/.exec(line);
    if (!m) return problems.push(`line ${i + 1}: expected "v02 5.3 -> finance_chain", got "${line}"`);
    if (!labels.includes(m[4])) return problems.push(`line ${i + 1}: "${m[4]}" is not one of ${labels.join(', ')}`);
    changes.push({ video: m[1], thread: Number(m[2]), comment: Number(m[3]), label: m[4] });
  });
  if (problems.length) throw new Error(problems.join('\n'));
  return changes;
}

// Writes the changes into the files in `dir`. Checks every change before
// writing anything, so a typo leaves the data untouched.
function applyChanges(dir, changes) {
  const files = new Map();
  const problems = [];
  const targets = [];
  for (const ch of changes) {
    const file = path.join(dir, `${ch.video}.json`);
    if (!files.has(file)) {
      if (!fs.existsSync(file)) {
        problems.push(`${ch.video}: no file ${path.relative(process.cwd(), file)}`);
        continue;
      }
      files.set(file, JSON.parse(fs.readFileSync(file, 'utf8')));
    }
    const thread = files.get(file).threads[ch.thread - 1];
    const comment = thread && (ch.comment === 0 ? thread.seed : (thread.replies || [])[ch.comment - 1]);
    if (!comment) problems.push(`${ch.video} ${ch.thread}.${ch.comment}: no such comment`);
    else targets.push({ ch, comment });
  }
  if (problems.length) throw new Error(problems.join('\n'));
  const applied = [];
  for (const { ch, comment } of targets) {
    if (comment.label === ch.label) continue;
    applied.push(`${ch.video} ${ch.thread}.${ch.comment}: ${comment.label} -> ${ch.label}`);
    comment.label = ch.label;
  }
  for (const [file, video] of files) fs.writeFileSync(file, JSON.stringify(video, null, 2) + '\n');
  return applied;
}

function renderPage(data, rules) {
  const payload = JSON.stringify({ data, labels: allLabels(rules), names: NAMES }).replace(/</g, '\\u003c');
  return PAGE_TEMPLATE.replace('/*DATA*/null', () => payload);
}

const PAGE_TEMPLATE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Winnow label review</title>
<style>
  :root { --bg: #f7f6f2; --card: #ffffff; --ink: #1d1d1b; --dim: #6b6a65; --line: #dddbd3; --accent: #1f5fbf; --on-accent: #ffffff;
          --spam: #b3261e; --spam-bg: #fdecea; --fp: #8a5a00; --fp-bg: #fff4d6; --changed: #1b6e3c; --changed-bg: #e3f4e8; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #17171a; --card: #212125; --ink: #ececea; --dim: #a09f99; --line: #3a3a40; --accent: #8ab4ff; --on-accent: #10131a;
            --spam: #ff8a80; --spam-bg: #3a1f1d; --fp: #ffcf66; --fp-bg: #3a3016; --changed: #7fd69b; --changed-bg: #1c3324; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.5 system-ui, "Segoe UI", sans-serif; }
  main { max-width: 900px; margin: 0 auto; padding: 24px 16px 160px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .lede { color: var(--dim); margin: 0 0 16px; }
  .how { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 12px 16px; margin-bottom: 16px; }
  .how ol { margin: 6px 0 0; padding-left: 20px; }
  .how p { margin: 8px 0 0; color: var(--dim); font-size: 14px; }
  code { font: 13px ui-monospace, Consolas, monospace; }
  .controls { position: sticky; top: 0; background: var(--bg); padding: 8px 0; z-index: 2; margin: 16px 0; }
  .tabs { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .tabs button { font: inherit; padding: 6px 12px; border-radius: 999px; border: 1px solid var(--line); background: var(--card); color: var(--ink); cursor: pointer; }
  .tabs button[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
  .tabs select { width: auto; }
  .thread { background: var(--card); border: 1px solid var(--line); border-radius: 10px; margin-bottom: 14px; overflow: hidden; }
  .thread h2 { font-size: 13px; font-weight: 600; color: var(--dim); margin: 0; padding: 8px 14px; border-bottom: 1px solid var(--line); }
  .c { display: grid; grid-template-columns: 1fr 180px; gap: 12px; padding: 10px 14px; border-bottom: 1px solid var(--line); border-left: 4px solid transparent; }
  .c:last-child { border-bottom: 0; }
  .c.reply { padding-left: 34px; }
  .c.spam { border-left-color: var(--spam); background: var(--spam-bg); }
  .c.fp { border-left-color: var(--fp); background: var(--fp-bg); }
  .c.changed { border-left-color: var(--changed); background: var(--changed-bg); }
  .meta { font-size: 12px; color: var(--dim); }
  .text { white-space: pre-wrap; overflow-wrap: anywhere; }
  .badge { display: inline-block; font-size: 12px; border-radius: 4px; padding: 0 6px; border: 1px solid currentColor; }
  .badge.miss { color: var(--spam); } .badge.hit { color: var(--changed); } .badge.wrong { color: var(--fp); }
  .note { font-size: 13px; margin-top: 4px; color: var(--fp); font-weight: 600; }
  select { font: inherit; width: 100%; padding: 4px; border-radius: 6px; border: 1px solid var(--line); background: var(--card); color: var(--ink); }
  .side { display: flex; flex-direction: column; gap: 4px; }
  .empty { color: var(--dim); padding: 24px 0; }
  .bar { position: fixed; left: 0; right: 0; bottom: 0; background: var(--card); border-top: 1px solid var(--line); padding: 10px 16px; }
  .bar > div { max-width: 900px; margin: 0 auto; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
  .bar button { font: inherit; padding: 6px 14px; border-radius: 6px; border: 1px solid var(--accent); background: var(--accent); color: var(--on-accent); cursor: pointer; }
  .bar button.plain { background: transparent; color: var(--accent); }
  textarea { width: 100%; height: 90px; font: 12px/1.4 ui-monospace, Consolas, monospace; display: none; background: var(--bg); color: var(--ink); border: 1px solid var(--line); border-radius: 6px; }
  @media (max-width: 600px) { .c { grid-template-columns: 1fr; } .c.reply { padding-left: 22px; } }
</style>
</head>
<body>
<main>
  <h1>Winnow label review</h1>
  <p class="lede" id="summary"></p>
  <div class="how">
    <strong>What to do</strong>
    <ol>
      <li>Go through the first three tabs. For each comment, ask one thing: <em>is this label right?</em> You are checking the labels, not the rules.</li>
      <li>If a label is wrong, pick the right one from its dropdown. The row turns green.</li>
      <li>Press <strong>Copy my changes</strong> and send the text to whoever maintains the set, or save it to a file and run <code>node eval/review.js apply &lt;file&gt;</code>.</li>
    </ol>
    <p>Red: labelled spam. Yellow: the rules hide it, but it is labelled not spam. "Check:" lines are the labeller's own doubts. Your changes are kept in this browser until you press Undo all.</p>
  </div>
  <div class="controls"><div class="tabs" id="tabs"></div></div>
  <div id="list"></div>
</main>
<div class="bar"><div>
  <span id="count"></span>
  <button id="copy">Copy my changes</button>
  <button id="reset" class="plain">Undo all</button>
  <textarea id="out" readonly aria-label="Your changes"></textarea>
</div></div>
<script>
const { data, labels, names } = /*DATA*/null;
const comments = data.flatMap((v) => v.threads.flat());
const byKey = new Map(comments.map((c) => [c.key, c]));
const STORE = 'winnow-review';
let changes = {};
try { changes = JSON.parse(localStorage.getItem(STORE) || '{}'); } catch (e) {}
// Drop remembered changes that no longer apply (comment gone, or already applied).
for (const [k, v] of Object.entries(changes)) if (!byKey.has(k) || byKey.get(k).label === v) delete changes[k];
const save = () => { try { localStorage.setItem(STORE, JSON.stringify(changes)); } catch (e) {} };
const current = (c) => changes[c.key] || c.label;

const VIEWS = [
  { id: 'notes', name: 'Judgement calls', test: (c) => !!c.note, blurb: 'Labels the labeller was least sure of, each with a "Check:" line. Start here.' },
  { id: 'spam', name: 'Labelled spam', test: (c) => c.label !== 'ok', blurb: 'Everything labelled spam, shown with its whole thread. Is each red row really spam, and of that kind?' },
  { id: 'fp', name: 'Hidden but labelled not spam', test: (c) => c.label === 'ok' && !!c.engine, only: true, blurb: 'Comments the rules hide that are labelled not spam. Are they really fine?' },
  { id: 'all', name: 'Everything', test: () => true, blurb: 'Every comment. Optional: skim for spam that was labelled not spam.' },
];
let view = VIEWS[0].id;
let video = '';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

function render() {
  const spam = comments.filter((c) => c.label !== 'ok').length;
  document.getElementById('summary').textContent =
    comments.length + ' comments in ' + data.reduce((n, v) => n + v.threads.length, 0) + ' threads from ' + data.length + ' videos. ' + spam + ' are labelled spam.';
  const inVideo = (c) => !video || c.key.startsWith(video + ' ');
  const tabs = document.getElementById('tabs');
  tabs.innerHTML = '';
  for (const v of VIEWS) {
    const b = el('button', '', v.name + ' (' + comments.filter((c) => inVideo(c) && v.test(c)).length + ')');
    b.setAttribute('aria-pressed', String(v.id === view));
    b.onclick = () => { view = v.id; render(); scrollTo(0, 0); };
    tabs.appendChild(b);
  }
  const pick = el('select');
  pick.setAttribute('aria-label', 'Video');
  for (const [value, text] of [['', 'All videos'], ...data.map((v) => [v.video, 'Video ' + v.video])]) {
    const o = el('option', '', text); o.value = value; o.selected = value === video; pick.appendChild(o);
  }
  pick.onchange = () => { video = pick.value; render(); };
  tabs.appendChild(pick);

  const v = VIEWS.find((x) => x.id === view);
  const list = document.getElementById('list');
  list.innerHTML = '';
  list.appendChild(el('p', 'lede', v.blurb));
  let shown = 0;
  for (const vid of data) {
    if (video && vid.video !== video) continue;
    vid.threads.forEach((thread, ti) => {
      if (!thread.some(v.test)) return;
      shown++;
      const box = el('section', 'thread');
      box.appendChild(el('h2', '', 'Video ' + vid.video + ' · thread ' + (ti + 1)));
      thread.forEach((c, ci) => {
        if (v.only && !v.test(c)) return;
        const lab = current(c);
        const row = el('div', 'c' + (ci ? ' reply' : '') + (changes[c.key] ? ' changed' : lab !== 'ok' ? ' spam' : c.engine ? ' fp' : ''));
        const left = el('div');
        left.appendChild(el('div', 'meta', (ci ? 'Reply ' + ci : 'Top comment') + ' · ' + (c.author || 'unknown author') + (c.time ? ' · ' + c.time : '') + ' · ' + c.key));
        left.appendChild(el('div', 'text', c.text));
        if (c.note) left.appendChild(el('div', 'note', 'Check: ' + c.note));
        const side = el('div', 'side');
        const sel = el('select');
        sel.setAttribute('aria-label', 'Label for ' + c.key);
        for (const l of labels) { const o = el('option', '', names[l] || l); o.value = l; o.selected = l === lab; sel.appendChild(o); }
        sel.onchange = () => { if (sel.value === c.label) delete changes[c.key]; else changes[c.key] = sel.value; save(); render(); };
        side.appendChild(sel);
        if (changes[c.key]) side.appendChild(el('div', 'meta', 'Was: ' + (names[c.label] || c.label)));
        if (c.engine || c.label !== 'ok') {
          const wrap = el('div', 'meta');
          wrap.appendChild(el('span', 'badge ' + (!c.engine ? 'miss' : c.engine === c.label ? 'hit' : 'wrong'),
            c.engine ? 'Rules hide it: ' + (names[c.engine] || c.engine) : 'Rules miss it'));
          side.appendChild(wrap);
        }
        row.append(left, side);
        box.appendChild(row);
      });
      list.appendChild(box);
    });
  }
  if (!shown) list.appendChild(el('p', 'empty', 'Nothing here.'));
  const n = Object.keys(changes).length;
  document.getElementById('count').textContent = n ? n + ' label' + (n > 1 ? 's' : '') + ' changed' : 'No labels changed';
}

document.getElementById('copy').onclick = () => {
  const lines = Object.keys(changes).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).map((k) => k + ' -> ' + changes[k]);
  const text = lines.length ? 'Label changes:\\n' + lines.join('\\n') : 'No label changes.';
  const out = document.getElementById('out');
  out.style.display = 'block'; out.value = text; out.select();
  if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
};
document.getElementById('reset').onclick = () => { changes = {}; save(); document.getElementById('out').style.display = 'none'; render(); };
render();
</script>
</body>
</html>
`;

function loadOrExit(rules) {
  const { videos, problems } = A.loadDataset(A.DATA_DIR, rules);
  if (problems.length) {
    console.error(`The test set has ${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
    return null;
  }
  if (!videos.length) {
    console.error('No labelled comments in eval/data yet. See eval/README.md.');
    return null;
  }
  return videos;
}

function main(argv) {
  const rules = A.loadRules();
  if (argv[0] === 'apply') {
    const source = argv[1];
    if (!source) {
      console.error('Usage: node eval/review.js apply <file>   (or "-" to read stdin)');
      return 1;
    }
    let changes;
    try {
      changes = parseChanges(fs.readFileSync(source === '-' ? 0 : source, 'utf8'), allLabels(rules));
    } catch (e) {
      console.error(e.message);
      return 1;
    }
    let applied;
    try {
      applied = applyChanges(A.DATA_DIR, changes);
    } catch (e) {
      console.error(`Nothing was changed:\n${e.message}`);
      return 1;
    }
    console.log(applied.length ? `Changed ${applied.length} label(s):\n  ${applied.join('\n  ')}` : 'Nothing to change; the labels already match.');
    console.log('Run node eval/accuracy.js for the new numbers.');
    return 0;
  }
  if (argv.length) {
    console.error('Usage: node eval/review.js   or   node eval/review.js apply <file>');
    return 1;
  }
  const videos = loadOrExit(rules);
  if (!videos) return 1;
  fs.writeFileSync(PAGE, renderPage(reviewData(videos, rules, A.loadEngine()), rules));
  console.log(`Wrote ${PAGE}\nOpen it in a browser. It is not tracked by git.`);
  return 0;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { reviewData, parseChanges, applyChanges, renderPage, allLabels };
