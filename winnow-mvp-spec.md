# Winnow — MVP Spec v0.1

Crowd-sourced YouTube comment spam filter with a public blocklist.

*Working name: **Winnow** (to separate wheat from chaff). Alternatives: Chaff, Sieve, Husk.*

---

## 1. One-liner

A Chrome extension that hides spam and bot comments on YouTube, lets users report the ones it misses, and pools those reports into a public blocklist so every install makes the filter better for everyone.

---

## 2. Scope

**In (v1)**
- Client-side heuristic detection of 3 spam classes
- User reporting with reason codes
- Anonymous submission to a hosted API
- Daily-published public blocklist, consumed by all clients
- Scorched Earth mode (off by default)

**Out (v1)**
- Firefox / Edge builds
- LLM-based semantic classification
- Off-topic detection heuristics (report-only — see §5D)
- Comment sentiment, hate speech, or moderation beyond spam
- Any per-video API call

---

## 3. Architecture

```
┌─────────────────────────────────────────┐
│ Extension (MV3, Chrome)                 │
│  content script → MutationObserver      │
│  ├─ heuristics engine (rules.json)      │
│  ├─ blocklist lookup (local, in-memory) │
│  └─ report UI                           │
│  service worker → daily sync            │
└──────────────┬──────────────────────────┘
               │ HTTPS
   ┌───────────┴────────────┐
   │                        │
   ▼ (read, CDN)            ▼ (write, API)
┌──────────────┐    ┌───────────────────────┐
│ R2 + Cache   │    │ Cloudflare Worker     │
│ blocklist    │◄───│ /report  (rate-limit) │
│ rules.json   │    │ D1: reports, authors, │
│ (versioned)  │    │     installs          │
└──────────────┘    │ Cron: promotion job   │
                    └───────────────────────┘
```

**Key property:** the client never makes a network call per video. It downloads a snapshot once a day and does all lookups locally. Read path costs ~nothing at any scale.

**Stack:** Cloudflare Workers + D1 + R2. Snapshot published to R2, served via CDN with ETag.

---

## 4. Data model

**D1 — `authors`**
| field | notes |
|---|---|
| `channel_id` | PK. `UC...` form only. Never username/handle. |
| `status` | `candidate` \| `blocked` \| `cleared` |
| `distinct_reporters` | count of unique install_ids |
| `distinct_videos` | count of unique `video_hmac` |
| `first_reported`, `last_reported` | |
| `promoted_at`, `promoted_by` | `auto` \| `manual` |

**D1 — `reports`**
`id`, `channel_id`, `install_id`, `reason_code`, `comment_hash`, `video_hmac`, `rules_version`, `created_at`

**D1 — `installs`**
`install_id`, `first_seen`, `total_submissions`, `agreement_rate`, `banned`

> `agreement_rate` is written from day one but **not used for weighting in v1**. This makes reputation weighting a config flip in v2, not a schema migration.

**R2 — snapshots**
`blocklist/v{n}.json.gz` — flat array of channel IDs. ~24 bytes each; 50k entries ≈ 300KB gzipped. Plain JSON is fine until ~200k entries, then move to a Bloom filter.

---

## 5. Detection rules (v1)

Rules live in a **remote `rules.json`**, versioned and fetched with the blocklist. This lets a bad rule be fixed in an hour instead of a 3-day store review.

> **MV3 constraint:** `rules.json` must be **declarative data only** — pattern strings, weights, selectors. Never executable code. Remote code execution is a hard store rejection.

Each rule contributes a weight. Comment is hidden at total ≥ threshold (default 1.0).

### A. Engagement farming
- Year-bait patterns: `who('s| is) (still )?watching in \d{4}`, `who else is here in`, `am I the only one who`
- `like if you`, `who's listening in`
- Pure-emoji comments above N characters
- Comment text identical to a comment seen by this client on ≥3 unrelated videos (local rolling hash cache, 7-day TTL)

### B. Promo / link spam
- External links in comment body
- Obfuscated contact patterns: `wh4tsapp`, `t·me`, `dm me`, `+254...`, spaced-out digits
- Broker/handle mention + call-to-action in the same comment
- Repeated identical text across channels (as above)

### C. Financial/crypto scam chains — **structural, thread-level**
This is a separate pass over the whole thread, not per-comment. Single-comment scoring will miss it entirely.

Fires when **all** hold:
1. Seed comment matches a finance-gain lexicon (`trading`, `profit`, `broker`, `changed my life`, `expert`, `invest`)
2. ≥2 replies in the thread name the same entity as the seed
3. Reply authors appear nowhere else in this video's loaded comments
4. Replies posted within a tight window of each other

On fire: hide the **entire thread** and report **all** participating channel IDs.

### D. Off-topic / irrelevant — **report-only**
No client-side heuristic. Users can flag with `reason=offtopic`; reports accumulate in D1 for future LLM-based work. This category is semantic, and a heuristic here is a false-positive factory.

---

## 6. Reporting & promotion pipeline

**Submission payload** (this is the entire thing sent):
```json
{
  "channelId": "UCxxxxxxxxxxxxxxxxxxxxxx",
  "reasonCode": "finance_chain",
  "commentHash": "sha256(...)",
  "videoHmac": "hmac(videoId, rotating_server_salt)",
  "rulesVersion": 14
}
```

`videoHmac` gives the server a distinct-video signal without ever learning what was watched. Salt rotates monthly.

**Rate limits:** 50 submissions / install / day, 10 / video.

**Auto-promotion** — all must hold:
- ≥5 distinct `install_id`
- ≥3 distinct `video_hmac`
- reports span ≥2 distinct days

**Forced to manual queue** if:
- All reports trace to a narrow install cluster (same first-seen window)
- Any report comes from an install with `agreement_rate < 0.5` *(v2)*
- The channel has an open appeal

**Cron:** promotion job hourly, snapshot publish daily.

**Appeals:** GitHub issue template from day one. `cleared` status is permanent and immune to re-promotion.

---

## 7. Privacy

- No account, no sign-in, no PII
- `install_id` is a random UUID, generated locally, resettable from the options page
- **Never transmitted:** video IDs, watch history, search terms, comment bodies, user identity
- Public dumps contain **promoted channel IDs only** — never the `reports` or `installs` tables
- Channel IDs are personal data under GDPR and Kenya's DPA 2019 → erasure route must exist (the appeals channel doubles as this)
- Privacy policy: [`PRIVACY.md`](PRIVACY.md). It must be rewritten before any release that sends data

**Licensing:** code AGPL-3.0 ([`LICENSE`](LICENSE)); blocklist ODbL. Promotion algorithm published for auditability.

---

## 8. UX

**Comment section**
- Flagged comments vanish from the DOM
- Sticky pill at the top of comments: `14 hidden` → click to expand a list with reasons
- Hover menu on any comment → `Report as spam` → reason picker (4 codes)
- Report is optimistic: comment vanishes locally on click, queued for sync

**Popup**
- Master on/off
- Per-category toggles (3 + off-topic reporting)
- Scorched Earth toggle
- Stats: hidden this week, reports contributed, blocklist version

**Options**
- Channel allowlist
- Reset install ID
- Force blocklist refresh

**Scorched Earth mode**
Off by default. Enabling shows a one-time modal: *"This will hide legitimate comments. It blocks unverified candidate accounts, lowers the detection threshold, and removes entire reply chains."*

Does three things:
1. Blocks `candidate`-status channels, not just `blocked`
2. Drops the heuristic threshold from 1.0 → 0.6
3. Nukes whole reply chains on any single hit within them

---

## 9. Build order

| Phase | Deliverable | Ships? |
|---|---|---|
| 0 | MV3 scaffold, repo, CI | |
| 1 | DOM layer: observer, comment extraction, hide/reveal, counter pill | |
| 2 | Heuristics engine + bundled `rules.json` | |
| 3 | Report UI + **local-only** blocklist (fully offline) | ✅ **Store submission #1** |
| 4 | Worker + D1, `/report` endpoint, rate limits | |
| 5 | Promotion cron, R2 snapshots, client daily sync | ✅ **Store submission #2** |
| 6 | Manual review queue (admin page) | |
| 7 | Scorched Earth + thread-level pass | |
| 8 | Appeals flow, public dumps, published algorithm | |

> **Ship Phase 3 to the store first.** A zero-network extension clears review trivially and gets you real users and real false-positive data before you own a backend. Phase 5 is then an update to an approved listing, not a cold submission of a data-collecting extension.

---

## 10. Open risks

| Risk | Mitigation |
|---|---|
| YouTube DOM churn breaks selectors | Selectors live in remote `rules.json`, not in the bundle |
| Brigading / coordinated poisoning | Distinct-install + distinct-video + multi-day rule; reputation weighting in v2 |
| MV3 remote-code rejection | `rules.json` is declarative data, never evaluated |
| False-positived real creators | Manual queue, appeals, permanent `cleared` status |
| GDPR / Kenya DPA exposure | Erasure route, no PII, minimal payload |
| YouTube ToS ambiguity | DOM modification only; no scraping to a bulk store, no API abuse |
| Blocklist becomes a censorship tool | Published algorithm, public dumps, spam-only reason codes |

---

## 11. Success criteria for MVP

- 90%+ of finance-chain threads hidden on a manually-labelled 50-video sample
- <2% false-positive rate measured via the reveal-counter (reveals ÷ hidden)
- Blocklist reaches 1,000 promoted channels within 60 days of Phase 5
- Zero successful poisoning incidents reaching `blocked` status
