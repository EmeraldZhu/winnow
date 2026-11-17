# A labelled comment test set and an accuracy report

- **Issue:** #5
- **Status:** Implemented
- **Date:** 2026-11-17

## Problem

Every rule in `rules.json` was written by guesswork. The unit tests check
that the engine does what the rules say, not that the rules are right. There
is no way to tell whether a rule change helps or hurts, and the spec's targets
(§11: 90% of scam-chain threads caught, under 2% false positives) cannot be
checked.

## Proposal

**A test set** in `eval/data/`: a few hundred real YouTube comments, one JSON
file per video, kept as whole threads (seed plus replies, with each comment's
relative time). Whole threads are needed because the scam-chain pass works on
a thread and on who else commented on the video; a flat list of comments could
not exercise it. Each comment carries one label: `ok`, a category key from
`rules.json` (`engagement_farm`, `promo_link`, `finance_chain`, `offtopic`),
or `other_spam` for spam none of the categories describe.

**A report**, `node eval/accuracy.js`: runs `heuristics.js` and `rules.json`
over the set, making the decisions `content.js` makes with default settings,
and prints per category the number labelled, flagged and correct, with
precision and recall. It also prints overall spam recall, the share of
ordinary comments hidden, and the share of labelled scam-chain threads the
thread-level pass fired on. `--errors` lists every wrong comment, which is the
working list for improving rules. `--json` gives the numbers for scripts.

**A capture tool**, `node eval/capture.js v07`: prints a snippet to paste into
the DevTools console on a video page. It embeds the extension's own `dom.js`
and selectors, so the set holds what the extension would have seen. It replaces
every commenter's handle with `@user<N>`, rewrites mentions of those commenters
in comment text, and records neither the video id nor display names.

**Collection and labelling:**

- About 20 videos, chosen to cover where each category shows up: finance and
  crypto videos (scam chains, promo), music videos (engagement farming), and
  several ordinary videos with little spam, so the false-positive rate is
  measured on normal comment sections and not only on spam-heavy ones.
- Per video, capture the first comments YouTube shows (default "Top" order)
  and expand reply threads. Keep everything captured from a video rather than
  picking comments, so the set is not biased toward what the rules already
  catch.
- Each comment is labelled by a person reading it, before the report is run on
  it, against the definitions in `eval/README.md`.
- The baseline (the report's output, the date, the rules version) is recorded
  in `eval/README.md`.

**A test** in `tests/` fails if a file in `eval/data/` has an author that is
not a pseudonym, a video label that is not `v<N>`, or a missing label, so a
raw capture cannot be merged by accident.

The extension itself does not change. Nothing here ships in `extension/`.

## Alternatives considered

- **YouTube Data API.** Gives channel ids and exact timestamps, and scales.
  Rejected: needs a key, the API's terms limit how long comment data may be
  stored, and it returns different data from what the extension sees in the
  page (exact times rather than "2 days ago", which the chain pass depends on).
- **Synthetic comments written to look like spam.** No privacy question at
  all. Rejected as the test set, because it measures the rules against the
  author's idea of spam, which is the guesswork the issue is about. Still used
  for the unit tests.
- **A flat list of comments.** Simpler to label. Rejected: cannot measure the
  scam-chain pass.
- **Keeping the set out of the public repository.** Avoids republishing
  comments. Not chosen, because a baseline nobody else can reproduce is of
  little use to contributors; see the first risk below.

## Risks and open questions

- **Republishing real comments in a public repository.** Handles are removed,
  but comment text is verbatim and can be searched for on YouTube, and names
  typed inside comments are not caught automatically. A few hundred
  hand-captured comments is not the "scraping to a bulk store" the spec rules
  out (§10), but it is the first time the project publishes other people's
  words. Mitigations: manual read-through for names before committing, no
  video ids, removal on request. **Needs a decision by the maintainer.**
- **Who labels.** One labeller means the labels carry one person's judgement.
  Borderline cases (is "who's here in 2026?" spam?) decide the precision
  numbers. The definitions in `eval/README.md` are the reference; a second
  pass by another person would be better and is not planned.
- **The numbers are relative, not absolute.** Twenty videos chosen by hand are
  not a random sample of YouTube. The baseline is good for "better or worse
  than before", less good for "true accuracy in the wild".
- **English only.** The rules are English; so will the set be.
- **Relative times age.** "2 days ago" is stored as captured, which is what
  the chain pass reads. That is correct for the test but means a capture
  cannot be refreshed later.
- **The 2% target is defined on reveals by users** (spec §11). The report's
  false-positive rate is an offline stand-in for it.

## Done when

- `eval/data/` holds the labelled set, with a note on how comments were
  collected and labelled, and with commenter identities removed.
- `node eval/accuracy.js` prints precision and recall per category.
- The current numbers are recorded as the baseline in `eval/README.md`.

## What changed from the plan

- **Size.** 976 comments, not "a few hundred": 20 videos, the first 8 threads
  of each, with the first page of replies. Replies were kept in full because
  the scam-chain pass needs them, and they are most of the count.
- **Per video, a fixed window instead of "everything captured".** The first 8
  threads by position. Still nothing chosen by content.
- **Collected by a script, not by pasting the snippet by hand.** The script
  drove a separate, signed-out Chrome window and ran the same capture snippet.
  It is not in the repository; `eval/README.md` describes what it did.
- **Labelled by an AI assistant, then reviewed by the maintainer.** The
  proposal said "a person reading it". The review changed one label.
- **Added a review tool**, `node eval/review.js`: a self-contained page for
  checking labels by eye, and an `apply` command that writes the reviewer's
  corrections back to the data. The proposal had planned no second labelling
  pass; this makes one cheap enough to require for every addition to the set.
  Comments may carry an optional `note` for the labeller's doubts.
- **Ten manual redactions** after capture, for handles and names the snippet
  cannot find. Listed by kind in `eval/README.md`.
- **Creators and public figures are not anonymised.** Comments name them, and
  creators' pinned comments carry their links, so some videos can be
  identified from the set.
- **Label definitions were tightened while labelling** (emoji reactions are
  `ok`; every scripted part of a staged thread is `finance_chain`). The
  conventions are in `eval/README.md`.
- **The set is lopsided.** 112 of the 129 spam comments are scam-chain
  comments, 82 of them from two videos; there are 2 engagement-farming and 12
  promo comments. The "Top" order surfaces little of those. Newest-first
  captures would be the way to add them.
