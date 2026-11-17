# Accuracy test set

Real YouTube comments, each marked spam or not, and a script that runs the
scoring engine over them. It answers "did this rule change help or hurt?"
with numbers instead of a guess.

```
node eval/accuracy.js            # precision and recall per category
node eval/accuracy.js --errors   # also list every comment it got wrong
node eval/accuracy.js --json     # the numbers as JSON
node eval/review.js              # a page for checking the labels by eye
```

## Baseline

Measured 2026-11-17 against `rules.json` version 1, on the set as first
collected and reviewed (20 videos, 160 threads, 976 comments):

```
Winnow accuracy: 976 comments (129 spam, 847 not spam) in 160 threads from 20 videos
rules.json version 1, threshold 1

Category            Labelled   Flagged   Correct Precision    Recall
engagement_farm            2         7         0      0.0%      0.0%
promo_link                12        21         3     14.3%     25.0%
finance_chain            112         4         4    100.0%      3.6%

other_spam: 2 labelled, 0 hidden (no rule targets this label)
offtopic: 1 labelled, 0 hidden (no rule targets this label)
All spam: 14 of 129 hidden. Recall 10.9%, precision 43.8%
Not spam: 18 of 847 hidden. False-positive rate 2.1% (spec target: under 2%)
Scam-chain threads: 2 of 17 caught. 11.8% (spec target: 90%)
```

What is behind those numbers (`--errors` lists every case):

- **Scam chains are mostly missed.** Why each one is missed has not been
  traced. Things visible in the data that the chain pass does not allow for:
  seeds with none of the lexicon words ("stock strategy", "mentor", a bare
  success story); ring accounts that post in several threads of the same
  video, which the "commented nowhere else" condition reads as genuine; and
  one account playing several parts in a thread, where only distinct authors
  count.
- **11 of the 18 false positives are the video creator's own pinned comment**
  with links. The other 7 are short emoji reactions: the pure-emoji rule
  fires at three emoji, because its length is counted in UTF-16 units.
- **Promo spam without a link or contact detail is not caught**: book and
  product plugs, token tickers, gift-card bait.
- Seven of the `promo_link` flags are the "he's mostly on Telegram" lines of
  scam chains: hidden, but for the other category.

Read the category rows with their sizes in mind: 2 engagement-farming and 12
promo comments are too few for the percentages to mean much, and 82 of the
112 scam-chain comments come from two videos.

When the rules or the set change, replace this section and say what changed.

## What the report measures

The script makes the decisions `content.js` makes with default settings: all
categories on, Scorched Earth off, empty block and allow lists.

- **Per category.** *Labelled*: comments a person marked with that category.
  *Flagged*: comments the engine hid for that category. *Correct*: both.
  Precision is correct ÷ flagged; recall is correct ÷ labelled. A comment
  hidden for the wrong category counts against both categories.
- **All spam / Not spam.** Whether a comment was hidden at all, whatever the
  reason. The false-positive rate is hidden ordinary comments ÷ all ordinary
  comments. The spec's 2% target is defined on reveals by real users, so this
  is the nearest offline stand-in, not the same number.
- **Scam-chain threads.** Of the threads with at least one `finance_chain`
  comment, how many the thread-level pass fired on (spec target: 90%).

When the chain pass hides a whole thread, every comment in it counts as
flagged `finance_chain`, so an ordinary reply caught in the thread shows up as
a false positive. That is what a user would see.

The cross-video repeat rule needs the same text on three videos, so files are
scored in file-name order with one shared cache.

## Data format

One file per video in `eval/data/`, named after its label (`v07.json`):

```json
{
  "video": "v07",
  "collected": "2026-11-17",
  "threads": [
    {
      "seed": { "author": "@user1", "text": "…", "time": "3 days ago", "label": "ok" },
      "replies": [
        { "author": "@user2", "text": "…", "time": "3 days ago", "label": "promo_link",
          "note": "Optional: why this label was a close call" }
      ]
    }
  ]
}
```

Threads are kept whole because the scam-chain pass looks at a seed and its
replies together, and at who else has commented on the video.

A `note` is for the labeller's own doubts. The review page shows every
comment that has one first, so reviewers spend their time on the hard cases.

### Labels

| Label | Meaning |
|---|---|
| `ok` | Not spam |
| `engagement_farm` | Spec §5A: year-bait, "like if you", flattery bait, copy-paste posted to farm likes |
| `promo_link` | Spec §5B: links, contact details, "DM me", broker call-to-action |
| `finance_chain` | Spec §5C: a comment that is part of a staged "expert" recommendation thread |
| `offtopic` | Spec §5D: irrelevant to the video. Report-only; no rule targets it |
| `other_spam` | Spam that fits none of the above |

Label what the comment *is*, not what the engine does with it. If a comment
fits two categories, pick the one a person would report it as.

Conventions used so far:

- Every comment that plays a part in a staged recommendation thread is
  `finance_chain`: the bait question, the "who is he?" replies, the thanks.
  A bystander replying in the same thread is `ok`.
- A lone comment that matches a bait template seen in a staged thread
  elsewhere in the set is `finance_chain` even with no replies captured.
- A creator's own pinned comment is `ok`, links and all.
- A few emoji as a reaction is `ok`. The spec lists pure-emoji comments under
  engagement farming, but a person would not report "😂😂😂" as spam.
- Low-effort is not spam: "Same", "Me too", "Am here" are `ok`.

## How this set was collected

- **When and what:** 17 November 2026. Twenty videos picked from the first
  results of twelve YouTube searches: seven on investing, trading and passive
  income, five music videos, eight ordinary ones (laptops, cooking, science,
  gaming, travel, football). Video ids are not kept.
- **Which comments:** the first 8 threads YouTube showed (default "Top"
  order, not signed in) and the first page of replies to each, up to 10.
  Everything in that window was kept; nothing was picked or dropped by hand.
- **How:** a script opened each video in a separate Chrome window with an
  empty profile, clicked each thread's replies button, and ran the capture
  snippet described below. The script is not in the repository.
- **Labelling:** every comment was read and labelled by Claude (an AI
  assistant) before the report was first run, with notes on 15 close calls.
  The maintainer then reviewed the labels on the review page and changed one
  (v02 5.3, a reply asking for the plugged book, to `finance_chain`).
- **Removed by hand after capture** (10 edits): four handles of people who
  were not in the capture became `@removed`, and six private names typed into
  comments became `[name]`.

## Adding more comments

1. Pick the next unused label (`v21`) and run `node eval/capture.js v21`. It
   prints a snippet; copy it (`| clip` on Windows, `| pbcopy` on macOS).
2. Open the video. Scroll until the comments you want have loaded and expand
   the reply threads you want. Only what is on the page is captured.
3. Paste the snippet into the DevTools console. It copies the capture to the
   clipboard. Save it as `eval/data/v21.json`.
4. Decide which threads to keep by position (the first N), not by content,
   then fill in every `label`. Add a `note` to any label you were unsure of.
5. Read each comment once more for names (below), then run
   `node eval/accuracy.js`. It refuses files with missing labels.
6. Have someone else review the new labels (next section) before the pull
   request is merged.

The snippet reads the page with the extension's own `dom.js` and selectors, so
the test set contains what the extension would have seen. It sends nothing
anywhere.

## Reviewing labels

The numbers are only as good as the labels, so every label gets a second pair
of eyes: a reviewer who is not the person who labelled it.

1. Run `node eval/review.js`. It writes `eval/review.html` (not tracked by
   git) and needs no server; open the file in a browser.
2. Go through the first three tabs: **Judgement calls** (comments with a
   `note`), **Labelled spam** (with each thread for context) and **Hidden but
   labelled not spam**. The video menu narrows the page to one video, which
   is the way to review a pull request that adds `v21`. For each comment, ask
   only whether the label is right.
3. Where it is not, pick the right label from the dropdown. Choices are kept
   in the browser until **Undo all**, so the page can be closed and reopened.
4. Press **Copy my changes**. It copies lines like `v02 5.3 -> finance_chain`
   (video, thread.comment, new label; comment 0 is the top comment of the
   thread).
5. Whoever applies them saves the lines to a file and runs
   `node eval/review.js apply <file>` (or pipes them in with `apply -`). It
   checks every line first and changes nothing if one is wrong. Then rerun
   `node eval/accuracy.js` and update the baseline above.

Disagreements are settled in the pull request. If one turns into a rule of
thumb, add it to the conventions under **Labels**.

### What is removed, and what is not

- Every commenter's handle becomes `@user<N>`, numbered per video. Mentions of
  those commenters inside comment text are rewritten to match.
- The video's id and title are not recorded. Display names, avatars and like
  counts are never read.
- **Kept:** the names of creators, artists and other public figures that
  comments mention, and the links in a creator's own pinned comment. These
  can identify the video.
- **Not removed automatically:** names typed into comment text ("thanks
  Sarah"), and handles of accounts that did not comment in the capture. In
  spam the second kind is usually the account being advertised, and the rules
  key on it, so it stays. Remove or replace anything that identifies an
  ordinary person before committing.

`node --test tests/*.test.js` fails if a file in `eval/data/` has an author
that is not a pseudonym, a video label that is not `v<N>`, or a missing label.

Comment text is quoted verbatim and can be searched for. If a comment's author
asks for it to be taken out, delete it and record the new baseline.
