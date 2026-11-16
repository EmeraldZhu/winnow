# Instructions for AI assistants

Winnow is a Chrome (MV3) extension that hides spam in YouTube comments. The
design is in `winnow-mvp-spec.md`; the code is in `extension/`.

## Workflow: required for every change

Follow [`CONTRIBUTING.md`](CONTRIBUTING.md). In short:

1. Find or open the companion issue before changing anything. Use the issue
   templates' sections.
2. If the change needs a proposal (table in `CONTRIBUTING.md`), write
   `docs/proposals/<issue-number>-<slug>.md` from the template first.
3. Work on a branch cut from `dev`, named `<type>/<issue-number>-<slug>`.
   Never commit to `dev` or `master`.
4. Open a pull request into `dev` (not `master`; CI rejects anything but
   `dev` there) using `.github/PULL_REQUEST_TEMPLATE.md`: keep every
   heading, fill every section, and include `Closes #N`. CI fails otherwise.
5. In the same pull request, mark the proposal `Implemented`, update the docs
   the change makes stale, and add a `CHANGELOG.md` line.

Squash-merge pull requests into `dev`. A release is a pull request from
`dev` into `master`, merged with a merge commit; only make one when asked.

If asked to make a change without an issue, open the issue as part of the
work rather than skipping it. Pushing and opening issues or pull requests
still needs the user's go-ahead unless they have already given it.

## Commands

- Tests: `node --test tests/*.test.js`
- Check a PR body locally: `node .github/scripts/check-pr.js <file-with-body>`
- Run the extension: load `extension/` unpacked at `chrome://extensions`.

## Things to know

- `extension/src/rules.json` is data only (patterns, weights, selectors).
  Never put executable code in it; that is a Chrome Web Store rejection.
- The extension makes no network calls. Adding one needs a proposal.
- `PRIVACY.md` lists everything the extension stores. A change to what is
  stored, read or sent must update it in the same pull request.
- Behaviour that depends on YouTube's DOM must be checked on a live page, not
  only in unit tests. Say in the PR what was checked and how.
- Report what was not verified as plainly as what was.
