// Winnow heuristics engine — scores comments against declarative rules.json.
// No executable rule content is ever evaluated: rules are pattern strings +
// weights only, interpreted by the fixed set of rule "type"s below.
(function (global) {
  const EMOJI_RE = /\p{Extended_Pictographic}/u;
  const NON_EMOJI_RE = /[\p{L}\p{N}]/u;

  function isPureEmojiOverLength(text, minLength) {
    const trimmed = text.trim();
    if (trimmed.length < minLength) return false;
    if (!EMOJI_RE.test(trimmed)) return false;
    return !NON_EMOJI_RE.test(trimmed);
  }

  function compileRegex(rule) {
    try {
      return new RegExp(rule.pattern, rule.flags || '');
    } catch (e) {
      return null;
    }
  }


  function repeatLength(text) {
    return [...text.trim().replace(/\s+/g, ' ')].length;
  }

  // crossVideoRepeat needs a shared cache: Map<commentHash, Set<videoId>>
  // with per-entry lastSeen for 7-day TTL pruning. Owned by content.js,
  // passed in as `ctx.hashCache`.
  function checkCrossVideoRepeat(text, videoId, ctx, minVideos, minLength) {
    if (!ctx || !ctx.hashCache) return false;
    if (repeatLength(text) < minLength) return false;
    const hash = simpleHash(text.trim().toLowerCase());
    const entry = ctx.hashCache.get(hash);
    const now = Date.now();
    if (!entry) {
      ctx.hashCache.set(hash, { videos: new Set([videoId]), lastSeen: now });
      return false;
    }
    entry.videos.add(videoId);
    entry.lastSeen = now;
    return entry.videos.size >= minVideos;
  }

  function simpleHash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
    }
    return 'h' + h;
  }

  function scoreComment(text, category, ctx) {
    const hits = [];
    let score = 0;
    for (const rule of category.rules || []) {
      let fired = false;
      if (rule.type === 'regex') {
        const re = compileRegex(rule);
        fired = !!(re && re.test(text));
      } else if (rule.type === 'pureEmojiOverLength') {
        fired = isPureEmojiOverLength(text, rule.minLength || 6);
      } else if (rule.type === 'crossVideoRepeat') {
        fired = checkCrossVideoRepeat(text, ctx && ctx.videoId, ctx, rule.minVideos || 3, rule.minLength || 40);
      }
      if (fired) {
        score += rule.weight;
        hits.push({ ruleId: rule.id, weight: rule.weight });
      }
    }
    return { score, hits };
  }

  // Runs every non-thread-level, non-report-only category against a single
  // comment and returns the best (highest-scoring) match.
  function evaluateComment(text, rulesDoc, ctx) {
    let best = null;
    for (const [key, category] of Object.entries(rulesDoc.categories)) {
      if (category.threadLevel || category.reportOnly) continue;
      const { score, hits } = scoreComment(text, category, ctx);
      if (score > 0 && (!best || score > best.score)) {
        best = { categoryKey: key, reasonCode: category.reasonCode, score, hits };
      }
    }
    return best;
  }

  // --- Financial/crypto scam chains (spec §5C) --------------------------
  // The pattern: a seed comment about money, then several throwaway accounts
  // replying to recommend the same named "expert". The name is the signal,
  // so the pass is built around finding one that independent replies share.

  const TITLE_RE = /^(?:mr|mrs|ms|miss|dr|sir|madam)\.?\s+/i;
  const NAME_RE = /\p{Lu}[\p{L}'’.-]+(?:\s+\p{Lu}[\p{L}'’-]+){1,3}/gu;
  const HANDLE_RE = /@[\w.-]{3,}/g;
  // Capitalised sentence openers that are not names.
  const NOT_NAME_START = new Set([
    'the', 'this', 'that', 'these', 'those', 'thanks', 'thank', 'great', 'good', 'nice', 'love', 'best',
    'what', 'when', 'where', 'why', 'how', 'who', 'and', 'but', 'you', 'your', 'not', 'yes', 'well',
    'just', 'very', 'please', 'happy', 'merry', 'god', 'lol', 'omg', 'wow',
  ]);

  // Names and @handles a comment mentions, lower-cased, titles stripped.
  // `participantIds` are the thread's own authors: YouTube prefixes every
  // reply with "@whoever-it-answers", which is not a recommendation.
  function extractEntities(text, participantIds) {
    const found = new Set();
    for (const m of text.match(NAME_RE) || []) {
      const name = m.replace(TITLE_RE, '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (name.length < 5) continue;
      if (NOT_NAME_START.has(name.split(' ')[0])) continue;
      found.add(name);
    }
    for (const m of text.match(HANDLE_RE) || []) {
      const handle = m.toLowerCase().replace(/[.-]+$/, '');
      if (participantIds && participantIds.has(handle)) continue;
      found.add(handle);
    }
    return found;
  }

  const TIME_UNITS = { second: 1, minute: 60, hour: 3600, day: 86400, week: 604800, month: 2592000, year: 31536000 };

  // "3 days ago (edited)" -> { age: 259200, unit: 86400 }. YouTube only shows
  // relative, rounded times, so `unit` is carried as the precision. Returns
  // null for anything unparseable (e.g. a non-English UI).
  function parseRelativeTime(str) {
    const m = /(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/i.exec(str || '');
    if (!m) return null;
    const unit = TIME_UNITS[m[2].toLowerCase()];
    return { age: Number(m[1]) * unit, unit };
  }

  // `thread` = {
  //   seedText, seedAuthorId,
  //   replies: [{ authorId, text, timeText }],
  //   threadAuthorCounts: Map<authorId, comments in this thread>,
  //   videoAuthorCounts:  Map<authorId, comments in all loaded threads>,
  // }
  // Fires when all hold (spec §5C):
  //   1. the seed matches the finance lexicon (whole words);
  //   2. >= minReplyMatches replies, from different authors, name the same entity;
  //   3. those authors have commented nowhere else on this video;
  //   4. those replies were posted close together, as far as YouTube's
  //      rounded timestamps can show.
  // Returns { entity, hideThread, replyIndexes, implicated: [{authorId, text}] }.
  // The whole thread goes only if the seed names the entity too; otherwise
  // the seed may be an ordinary comment the ring replied under, so only the
  // matching replies are hidden and reported.
  function evaluateFinanceChain(thread, rulesDoc) {
    const cat = rulesDoc.categories.finance_chain;
    if (!cat || !cat.seedPattern) return null;
    let seedRe;
    try {
      seedRe = new RegExp(cat.seedPattern, 'i');
    } catch (e) {
      return null;
    }
    if (!seedRe.test(thread.seedText || '')) return null;

    const minMatches = cat.minReplyMatches || 2;
    const windowSeconds = cat.replyWindowSeconds || 86400;
    const participants = new Set();
    for (const id of thread.threadAuthorCounts.keys()) participants.add(String(id).toLowerCase());

    const isNovel = (authorId) =>
      (thread.videoAuthorCounts.get(authorId) || 0) <= (thread.threadAuthorCounts.get(authorId) || 0);

    const seedEntities = extractEntities(thread.seedText, participants);
    const candidates = new Set(seedEntities);
    const replies = thread.replies.map((r, index) => {
      for (const e of extractEntities(r.text || '', participants)) candidates.add(e);
      return { ...r, index, lower: (r.text || '').toLowerCase() };
    });

    let best = null;
    for (const entity of candidates) {
      const byAuthor = new Map();
      for (const r of replies) {
        if (!r.authorId || r.authorId === thread.seedAuthorId) continue;
        if (!r.lower.includes(entity) || !isNovel(r.authorId)) continue;
        if (!byAuthor.has(r.authorId)) byAuthor.set(r.authorId, r);
      }
      if (byAuthor.size < minMatches) continue;

      const matched = [...byAuthor.values()];
      const times = matched.map((r) => parseRelativeTime(r.timeText)).filter(Boolean);
      if (times.length >= 2) {
        const span = Math.max(...times.map((t) => t.age)) - Math.min(...times.map((t) => t.age));
        const precision = Math.max(...times.map((t) => t.unit));
        if (span > Math.max(windowSeconds, precision)) continue;
      }
      if (!best || matched.length > best.matched.length) best = { entity, matched };
    }
    if (!best) return null;

    const hideThread = (thread.seedText || '').toLowerCase().includes(best.entity);
    const implicated = best.matched.map((r) => ({ authorId: r.authorId, text: r.text }));
    if (hideThread && thread.seedAuthorId) implicated.unshift({ authorId: thread.seedAuthorId, text: thread.seedText });
    return {
      categoryKey: 'finance_chain',
      reasonCode: cat.reasonCode,
      entity: best.entity,
      hideThread,
      replyIndexes: best.matched.map((r) => r.index),
      implicated,
    };
  }

  global.WinnowHeuristics = {
    evaluateComment,
    evaluateFinanceChain,
    extractEntities,
    parseRelativeTime,
    isPureEmojiOverLength,
    simpleHash,
  };
})(typeof window !== 'undefined' ? window : globalThis);
