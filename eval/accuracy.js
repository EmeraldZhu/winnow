#!/usr/bin/env node
// Accuracy report: runs the scoring engine over the labelled comments in
// eval/data/ and prints precision and recall per category.
//
//   node eval/accuracy.js            the report
//   node eval/accuracy.js --errors   also list every comment it got wrong
//   node eval/accuracy.js --json     the numbers as JSON
//
// It makes the same decisions content.js makes with default settings (all
// categories on, Scorched Earth off, empty block and allow lists). See
// eval/README.md for the data format and what the numbers mean.
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'extension', 'src');
const DATA_DIR = path.join(__dirname, 'data');

const OK = 'ok';
// Spam that fits none of the rule categories (e.g. "check my profile" bots).
const OTHER = 'other_spam';

function loadEngine() {
  require(path.join(SRC, 'heuristics.js'));
  return globalThis.WinnowHeuristics;
}

function loadRules() {
  return JSON.parse(fs.readFileSync(path.join(SRC, 'rules.json'), 'utf8'));
}

function validLabels(rules) {
  return [OK, ...Object.keys(rules.categories), OTHER];
}

// Categories the engine can hide on its own (not report-only).
function detectable(rules) {
  return Object.keys(rules.categories).filter((key) => !rules.categories[key].reportOnly);
}

function commentsOf(thread) {
  return [thread.seed, ...(thread.replies || [])];
}

// Returns a list of problems with one video file; empty when it is usable.
// Also the privacy gate: authors must already be pseudonyms.
function validateVideo(video, rules, name) {
  const problems = [];
  const labels = validLabels(rules);
  if (!video || typeof video !== 'object' || Array.isArray(video)) return [`${name}: not a JSON object`];
  if (!/^v\d+$/.test(video.video || '')) problems.push(`${name}: "video" must look like "v07", not a YouTube id`);
  if (!Array.isArray(video.threads)) return [...problems, `${name}: "threads" must be an array`];
  video.threads.forEach((thread, t) => {
    if (!thread || !thread.seed || (thread.replies && !Array.isArray(thread.replies))) {
      problems.push(`${name}: thread ${t + 1} needs a "seed" and an optional "replies" array`);
      return;
    }
    commentsOf(thread).forEach((c, i) => {
      const where = `${name}: thread ${t + 1}, ${i === 0 ? 'seed' : `reply ${i}`}`;
      if (!c || typeof c.text !== 'string' || !c.text.trim()) {
        problems.push(`${where}: missing text`);
        return;
      }
      if (c.author !== null && !/^@user\d+$/.test(c.author || '')) {
        problems.push(`${where}: author must be a pseudonym like "@user3", or null`);
      }
      if (!labels.includes(c.label)) {
        problems.push(`${where}: label ${JSON.stringify(c.label)} is not one of ${labels.join(', ')}`);
      }
    });
  });
  return problems;
}

// Reads every .json file in `dir`, sorted by name. The order matters: the
// cross-video repeat rule only fires once a text has been seen on earlier videos.
function loadDataset(dir, rules) {
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort() : [];
  const videos = [];
  const problems = [];
  for (const file of files) {
    let video;
    try {
      video = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    } catch (e) {
      problems.push(`${file}: ${e.message}`);
      continue;
    }
    problems.push(...validateVideo(video, rules, file));
    videos.push(video);
  }
  const seen = new Set();
  for (const v of videos) {
    if (v && seen.has(v.video)) problems.push(`"${v.video}" is used by more than one file`);
    if (v) seen.add(v.video);
  }
  return { videos, problems };
}

// What the extension would do to each comment of one video. Returns, per
// thread, { predicted: [category key or null per comment], chainFired }.
function predictVideo(video, rules, H, hashCache) {
  const videoAuthorCounts = new Map();
  for (const thread of video.threads) {
    for (const c of commentsOf(thread)) {
      if (c.author) videoAuthorCounts.set(c.author, (videoAuthorCounts.get(c.author) || 0) + 1);
    }
  }
  return video.threads.map((thread) => {
    const comments = commentsOf(thread);
    const predicted = comments.map((c) => {
      const hit = H.evaluateComment(c.text, rules, { videoId: video.video, hashCache });
      return hit && hit.score >= rules.threshold ? hit.categoryKey : null;
    });
    let chainFired = false;
    if (comments.length > 1 && rules.categories.finance_chain) {
      const threadAuthorCounts = new Map();
      for (const c of comments) {
        if (c.author) threadAuthorCounts.set(c.author, (threadAuthorCounts.get(c.author) || 0) + 1);
      }
      const hit = H.evaluateFinanceChain(
        {
          seedText: thread.seed.text,
          seedAuthorId: thread.seed.author,
          replies: comments.slice(1).map((c) => ({ authorId: c.author, text: c.text, timeText: c.time || '' })),
          threadAuthorCounts,
          videoAuthorCounts,
        },
        rules
      );
      if (hit) {
        chainFired = true;
        // The comments the chain pass names are reported as finance_chain
        // whatever else they matched.
        for (const index of hit.replyIndexes) predicted[index + 1] = 'finance_chain';
        if (hit.hideThread) {
          predicted[0] = 'finance_chain';
          // The whole thread goes, bystanders included.
          for (let i = 0; i < predicted.length; i++) predicted[i] = predicted[i] || 'finance_chain';
        }
      }
    }
    return { predicted, chainFired };
  });
}

function ratio(part, whole) {
  return whole ? part / whole : null;
}

function evaluate(videos, rules, H) {
  const categories = {};
  for (const key of detectable(rules)) categories[key] = { labelled: 0, flagged: 0, correct: 0 };
  const undetectable = {};
  const overall = { comments: 0, threads: 0, videos: videos.length, spam: 0, spamHidden: 0, ok: 0, okHidden: 0 };
  const chains = { labelled: 0, caught: 0 };
  const errors = [];
  const hashCache = new Map();

  for (const video of videos) {
    const results = predictVideo(video, rules, H, hashCache);
    video.threads.forEach((thread, t) => {
      const { predicted, chainFired } = results[t];
      const comments = commentsOf(thread);
      overall.threads++;
      if (comments.some((c) => c.label === 'finance_chain')) {
        chains.labelled++;
        if (chainFired) chains.caught++;
      }
      comments.forEach((c, i) => {
        const guess = predicted[i];
        overall.comments++;
        if (c.label === OK) {
          overall.ok++;
          if (guess) overall.okHidden++;
        } else {
          overall.spam++;
          if (guess) overall.spamHidden++;
        }
        if (categories[c.label]) categories[c.label].labelled++;
        else if (c.label !== OK) {
          undetectable[c.label] = undetectable[c.label] || { labelled: 0, hidden: 0 };
          undetectable[c.label].labelled++;
          if (guess) undetectable[c.label].hidden++;
        }
        if (guess) {
          categories[guess].flagged++;
          if (guess === c.label) categories[guess].correct++;
        }
        // Wrong: a detectable label not matched, or any comment hidden for a
        // category other than its label. Spam no rule targets (other_spam,
        // offtopic) is not wrong for being missed, but is when hidden as
        // something else, so the review page shows what the rules did to it.
        const wrong = categories[c.label] ? guess !== c.label : !!guess;
        if (wrong) errors.push({ video: video.video, thread: t + 1, comment: i, label: c.label, predicted: guess, text: c.text });
      });
    });
  }

  for (const c of Object.values(categories)) {
    c.precision = ratio(c.correct, c.flagged);
    c.recall = ratio(c.correct, c.labelled);
  }
  overall.recall = ratio(overall.spamHidden, overall.spam);
  overall.precision = ratio(overall.spamHidden, overall.spamHidden + overall.okHidden);
  overall.falsePositiveRate = ratio(overall.okHidden, overall.ok);
  chains.recall = ratio(chains.caught, chains.labelled);
  return { rulesVersion: rules.version, threshold: rules.threshold, overall, categories, undetectable, chains, errors };
}

function pct(value) {
  return value === null ? 'n/a' : `${(value * 100).toFixed(1)}%`;
}

function formatReport(report, { showErrors } = {}) {
  const { overall: o, chains } = report;
  const lines = [
    `Winnow accuracy: ${o.comments} comments (${o.spam} spam, ${o.ok} not spam) in ${o.threads} threads from ${o.videos} videos`,
    `rules.json version ${report.rulesVersion}, threshold ${report.threshold}`,
    '',
  ];
  const row = (cells) => cells.map((cell, i) => (i === 0 ? String(cell).padEnd(18) : String(cell).padStart(10))).join('');
  lines.push(row(['Category', 'Labelled', 'Flagged', 'Correct', 'Precision', 'Recall']));
  for (const [key, c] of Object.entries(report.categories)) {
    lines.push(row([key, c.labelled, c.flagged, c.correct, pct(c.precision), pct(c.recall)]));
  }
  lines.push('');
  for (const [key, u] of Object.entries(report.undetectable)) {
    lines.push(`${key}: ${u.labelled} labelled, ${u.hidden} hidden (no rule targets this label)`);
  }
  lines.push(`All spam: ${o.spamHidden} of ${o.spam} hidden. Recall ${pct(o.recall)}, precision ${pct(o.precision)}`);
  lines.push(`Not spam: ${o.okHidden} of ${o.ok} hidden. False-positive rate ${pct(o.falsePositiveRate)} (spec target: under 2%)`);
  lines.push(`Scam-chain threads: ${chains.caught} of ${chains.labelled} caught. ${pct(chains.recall)} (spec target: 90%)`);
  if (showErrors) {
    lines.push('', `Wrong (${report.errors.length}):`);
    for (const e of report.errors) {
      const which = e.comment === 0 ? 'seed' : `reply ${e.comment}`;
      lines.push(`  ${e.video} thread ${e.thread} ${which}: labelled ${e.label}, got ${e.predicted || 'nothing'}: ${e.text.slice(0, 100)}`);
    }
  }
  return lines.join('\n');
}

function main(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const dir = argv.find((a) => !a.startsWith('--')) || DATA_DIR;
  const rules = loadRules();
  const { videos, problems } = loadDataset(dir, rules);
  if (problems.length) {
    console.error(`The test set has ${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
    return 1;
  }
  if (!videos.length) {
    console.error(`No labelled comments in ${dir} yet. See eval/README.md.`);
    return 1;
  }
  const report = evaluate(videos, rules, loadEngine());
  console.log(flags.has('--json') ? JSON.stringify(report, null, 2) : formatReport(report, { showErrors: flags.has('--errors') }));
  return 0;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { evaluate, formatReport, loadDataset, loadEngine, loadRules, validateVideo, DATA_DIR };
