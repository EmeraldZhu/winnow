# Contribution workflow

- **Issue:** #3
- **Status:** Implemented
- **Date:** 2026-11-16

## Problem

Changes so far went straight to a branch with no issue, no fixed pull request
shape and no record of the plan. Most future changes will be AI-assisted, so
structure that depends on each session remembering the rules will drift.

## Proposal

1. Every change is a pull request with a companion issue.
2. Fixed templates: two issue forms (bug, improvement), one pull request
   template, one proposal template.
3. A proposal doc in `docs/proposals/`, named by issue number, is written
   before non-trivial work and marked `Implemented` in the pull request that
   does the work. That pull request also updates the docs it makes stale and
   the changelog.
4. Enforcement in two layers:
   - `AGENTS.md` (imported by `CLAUDE.md`) tells AI assistants to follow
     `CONTRIBUTING.md`.
   - A GitHub Actions check fails any pull request whose description lacks a
     linked issue or a filled-in template section, and runs the tests. It
     applies to everyone, so it does not depend on an assistant reading its
     instructions.

## Alternatives considered

- **Instructions only, no CI check.** Cheaper, but nothing catches a session
  or collaborator that skips them.
- **A proposal for every change.** Too heavy for one-line fixes; the issue
  already states the plan. Proposals are required only for changes to
  behaviour, data, permissions or this workflow.
- **A PR-linting marketplace action.** Avoided: a 60-line script in the repo
  has no third-party dependency and can be run locally.

## Risks and open questions

- The check reads the description, not the diff: it cannot tell whether the
  docs listed under "Docs updated" were really changed. Review still matters.
- The check only blocks merging once `master` has a branch protection rule
  requiring it. That is a repository setting, not something in this change.

## Done when

- Templates, `CONTRIBUTING.md`, `AGENTS.md` and `CLAUDE.md` exist.
- The check passes on a conforming description and fails on a non-conforming
  one.

## What changed from the plan

Nothing.
