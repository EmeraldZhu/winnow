# Adopt a dev → master branch flow

- **Issue:** #23
- **Status:** Implemented
- **Date:** 2026-11-17

## Problem

Every pull request goes straight into `master`. There is no place where
several changes sit together and get tried before they become the version
people would install, so `master` cannot be relied on to be shippable.

Pull request #22 introduced a `dev` branch and CI for it, but could not be
merged:

- Its branch filter was written `branches: [master dev]`. Without a comma,
  YAML reads that as one branch named "master dev", so CI never ran on `dev`,
  on `master`, or on #22 itself.
- It carried its own copy of #4, which conflicted with `master` once #4 was
  merged.
- The "master only accepts dev" rule was not written into `CONTRIBUTING.md`,
  and release pull requests could not have passed the description check.

## Proposal

Two long-lived branches:

- `dev`: where work lands. Feature branches are cut from it and opened against
  it. Merged by squash, one commit per pull request.
- `master`: what is released. It receives only pull requests from `dev`
  (a "release"). Merged with a merge commit, so the two histories stay joined
  and `dev` never has to be reset afterwards.

CI (`.github/workflows/ci.yml`):

- Runs on pull requests into `master` and `dev`, and on pushes to both.
- New job **Validate extension**: `manifest.json` and `rules.json` parse, and
  every file in `extension/src/` passes `node --check`. From #22.
- New job **Master only accepts dev**: fails a pull request into `master`
  unless its source is this repository's `dev` branch. From #22, changed to
  read the branch name through an environment variable rather than inline in
  the shell command, and to reject a fork's branch that happens to be called
  `dev`.

Description check (`.github/scripts/check-pr.js`):

- A release pull request needs only a non-empty `## Summary`. Each change in
  it already passed the full check on its way into `dev`, and a release has no
  single issue to close.
- Everything else is checked as before.

Repository settings, not part of the pull request:

- Make `dev` the default branch. New pull requests then target it without
  anyone choosing, and `Closes #N` closes the issue when the change lands on
  `dev` instead of waiting for the next release.
- Protect `master` and `dev`: require the CI checks, and no direct pushes.

## Alternatives considered

- **Keep pull requests going straight to `master`.** Simplest, and enough for
  one contributor. Rejected because there are now two, and because the
  extension will be published from `master`.
- **Release tags on `master` instead of a second branch.** Gives the same
  "known good" points with less ceremony. Not chosen because it does not give
  a place to try changes together before release. Tags can still be added on
  top of this flow.
- **Squash releases into `master`.** Keeps `master` to one commit per
  release, but `dev` and `master` then diverge after every release and `dev`
  has to be rebuilt each time.

## Risks and open questions

- The "Master only accepts dev" job lives in the workflow file, and the
  workflow for a pull request is read from that pull request. A pull request
  into `master` could delete the job. Only branch protection enforces the
  rule.
- Until `dev` is the default branch, issues linked from pull requests into
  `dev` stay open until the next release.
- With one or two contributors a release step may turn out to be more
  ceremony than it is worth. Revisit if releases become a formality.
- How often to release is not decided.

## Done when

- CI runs on pull requests into `dev` and `master` and on pushes to both.
- A pull request into `master` from any branch other than `dev` fails a check.
- A `dev` → `master` pull request passes the description check with only a
  summary.
- `CONTRIBUTING.md` and `AGENTS.md` describe the flow and the merge method for
  each step.

## What changed from the plan

Written alongside the implementation, so nothing diverged. Relative to #22,
which this replaces: the branch filter is fixed, the source-branch job is
hardened as described above, the description check gained the release rule,
and `dev` was recreated from `master` rather than merged.
