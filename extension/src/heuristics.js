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

  // crossVideoRepeat needs a shared cache: Map<commentHash, Set<videoId>>
  // with per-entry lastSeen for 7-day TTL pruning. Owned by content.js,
  // passed in as `ctx.hashCache`.
  function checkCrossVideoRepeat(text, videoId, ctx, minVideos) {
    if (!ctx || !ctx.hashCache) return false;
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
        fired = checkCrossVideoRepeat(text, ctx && ctx.videoId, ctx, rule.minVideos || 3);
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

  // Structural, thread-level pass for financial/crypto scam chains (spec §5C).
  // `thread` = { seedText, seedAuthorId, replies: [{authorId, text, timestamp}], threadAuthors: Set<authorId> }
  function evaluateFinanceChain(thread, rulesDoc) {
    const cat = rulesDoc.categories.finance_chain;
    if (!cat) return null;
    const seedLower = thread.seedText.toLowerCase();
    const seedHit = cat.seedLexicon.some((term) => seedLower.includes(term));
    if (!seedHit) return null;

    // Find the entity the seed names: crude heuristic — any @handle-like or
    // capitalized multi-word token shared with replies. Fall back to just
    // requiring replies that echo seed-adjacent finance lexicon + novelty.
    const novelReplies = thread.replies.filter(
      (r) => !thread.threadAuthors.has(r.authorId) || thread.threadAuthors.get(r.authorId) === 1
    );
    if (novelReplies.length < (cat.minReplyMatches || 2)) return null;

    const timestamps = novelReplies.map((r) => r.timestamp).filter(Boolean);
    if (timestamps.length >= 2) {
      const span = Math.max(...timestamps) - Math.min(...timestamps);
      if (span > (cat.replyWindowSeconds || 3600) * 1000) return null;
    }

    return {
      categoryKey: 'finance_chain',
      reasonCode: cat.reasonCode,
      implicatedAuthors: [thread.seedAuthorId, ...novelReplies.map((r) => r.authorId)],
    };
  }

  global.WinnowHeuristics = {
    evaluateComment,
    evaluateFinanceChain,
    isPureEmojiOverLength,
    simpleHash,
  };
})(typeof window !== 'undefined' ? window : globalThis);
