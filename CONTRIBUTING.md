# Contributing to Winnow

Every change follows the same path, whether a person or an AI assistant
writes it. CI enforces the parts marked **(checked)**.

## The path

1. **Issue.** Open one from a template (bug, or improvement). It says what is
   wrong or wanted and what "done" means. No issue, no pull request.
2. **Proposal** (when needed, see below). Add
   `docs/proposals/<issue-number>-<slug>.md` from
   [`docs/proposals/TEMPLATE.md`](docs/proposals/TEMPLATE.md) with status
   `Proposed`. It describes the plan before the work is done.
3. **Branch.** Cut from `dev`, named `<type>/<issue-number>-<slug>`, where
   type is `fix`, `feat`, `docs` or `chore`. Example: `fix/12-reveal-rehides`.
4. **Pull request, into `dev`.** Fill in every section of the PR template
   **(checked)** and link the issue with `Closes #N` **(checked)**. Tests must
   pass and the extension's files must be valid **(checked)**.
5. **Docs, in the same pull request.** Set the proposal's status to
   `Implemented` and record anything that turned out differently from the
   plan. Update every doc the change makes stale (see the table below) and add
   a line to [`CHANGELOG.md`](CHANGELOG.md).
6. **Merge** by squash, so `dev` has one commit per pull request.

## Branches and releases

| Branch | Holds | Receives | Merged by |
|---|---|---|---|
| `dev` | Work that is finished but not yet released | Feature branches | Squash |
| `master` | What is released | Only `dev` **(checked)** | Merge commit |

A release is a pull request from `dev` into `master`. Its description needs
only a `## Summary` saying what it ships **(checked)**; the changes in it
were each checked on their way into `dev`. Merge it with a merge commit, not a
squash: squashing would make `dev` and `master` diverge after every release.

Never commit directly to `dev` or `master`.

## When a proposal is needed

| Change | Proposal? |
|---|---|
| Bug fix that restores intended behaviour | No. The issue is the plan. |
| Typo, comment, dependency bump, test-only change | No |
| New feature or new detection rule | Yes |
| Change to what gets hidden, reported, stored or sent | Yes |
| New permission, new network call, new service | Yes |
| Change to this workflow | Yes |

If no proposal is needed, write `Not needed: <reason>` in the PR's Proposal
section.

A proposal may ship in the same pull request as its implementation. Open it as
its own pull request first when the plan itself needs a decision.

## Which docs to update

| If you change… | Update… |
|---|---|
| What the extension does or how to run it | `README.md` |
| Scope, architecture, data model, detection rules, privacy | `winnow-mvp-spec.md` |
| Anything a user or contributor would notice | `CHANGELOG.md` |
| The plan in a proposal | That proposal (status, and a "What changed from the plan" note) |
| This workflow | `CONTRIBUTING.md`, `AGENTS.md` |

## Proposal statuses

`Proposed` → `Accepted` → `Implemented`, or `Rejected` / `Superseded by #N`.
Proposals are never deleted; they are the record of why things are the way
they are.

## Tests

```
node --test tests/*.test.js
```

Changes to the scoring engine or storage layer need a test. Changes that only
show up in the browser need the manual check written down in the PR's Testing
section: what was loaded, on which page, and what was observed.

## AI-assisted changes

AI assistants read [`AGENTS.md`](AGENTS.md) (Claude Code reads it through
`CLAUDE.md`). It tells them to follow this file. The CI check applies to their
pull requests exactly as it does to anyone else's. Keep the assistant's
attribution lines in commits and pull requests.
