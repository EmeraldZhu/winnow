# Winnow

Crowd-sourced YouTube comment spam filter with a public blocklist. See
[`winnow-mvp-spec.md`](winnow-mvp-spec.md) for the full design.

## Status: Phase 3 complete (store submission #1 candidate)

The `extension/` directory is a working, fully-offline MV3 Chrome extension —
no network calls other than fetching its own bundled `rules.json`. Per the
spec's build order (§9), this is the milestone meant to ship to the store
first, since a zero-network extension clears review easily and lets real
false-positive data accumulate before a backend exists.

Implemented:
- DOM layer: `MutationObserver`-driven comment extraction, hide/reveal,
  sticky "N hidden" pill with an expandable reveal list
- Heuristics engine reading a declarative, versioned `rules.json` (pattern
  strings + weights only — no executable rule content, per the MV3
  remote-code constraint in spec §5)
  - Category A: engagement farming (year-bait, "like if you", pure-emoji, cross-video repeats)
  - Category B: promo/link spam (links, obfuscated contact info, broker CTAs)
  - Category C: financial/crypto scam chains — thread-level structural pass
  - Category D: off-topic — report-only, no auto-hide, by design
- Report UI: hover "Report as spam" button, 4-code reason picker, optimistic
  local hide, reports queued locally
- Local-only blocklist/allowlist, install ID, and stats via `chrome.storage.local`
- Popup: master toggle, per-category toggles, Scorched Earth toggle + one-time
  warning modal, live stats
- Options page: channel allowlist, install ID reset, "force refresh" placeholder
- Scorched Earth mode: lowers the hide threshold, blocks by local blocklist,
  and nukes whole reply chains on any hit within them

Not yet built (Phases 4-8 — require provisioning real Cloudflare
infrastructure and a domain, so intentionally left for a deliberate follow-up
rather than deployed silently):
- Cloudflare Worker `/report` endpoint, D1 schema, rate limiting
- Promotion cron + R2 blocklist/rules snapshot publishing
- Client daily sync (the service worker alarm exists as a stub — see the
  `TODO(Phase 5)` in `extension/src/background.js`)
- Manual review queue, appeals flow, public dumps

### Known deviation from the spec

The spec's data model keys authors by `channel_id` in `UC…` form. Current
YouTube comment DOM only exposes the commenter's `@handle`, not their
underlying channel ID — so the client-side identity key used for local
allow/blocklisting and dedup is the handle string. Resolving handle → `UC…`
id is deferred to whenever the backend (Phase 4) is wired up, since that's a
one-time-per-author lookup rather than a per-video API call, and is easier to
reason about server-side.

## Load it locally

1. `chrome://extensions` → enable Developer mode → "Load unpacked" → select
   the `extension/` folder.
2. Open any `youtube.com/watch?v=...` video and scroll to comments.

## Tests

```
node --test tests/*.test.js
```

Covers the scoring engine and the storage layer (no browser needed).

## Repo layout

```
extension/
  manifest.json
  icons/
  src/
    background.js       service worker (alarm stub for future daily sync)
    content.js           orchestrator: wires rules+storage+DOM+report together
    heuristics.js        scoring engine (declarative rule interpreter)
    dom.js               comment extraction, hide/reveal, sticky pill
    storage.js           chrome.storage.local wrapper
    report.js            report button, reason picker, local report queue
    rules.json           bundled declarative ruleset (categories A-D)
    popup.html/js        toolbar popup UI
    options.html/js      options page
    content.css
```
