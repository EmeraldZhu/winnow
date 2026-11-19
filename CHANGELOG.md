# Changelog

One line per merged pull request, newest first.

## Unreleased

- Fix the repeat-comment rule hiding short common phrases such as "Great video!": it now only counts comments of 40 characters or more (#9)
- Labelled test set of 976 real comments, an accuracy report (`node eval/accuracy.js`) and a label review page (`node eval/review.js`); first baseline recorded in `eval/README.md` (#5)
- Licence (AGPL-3.0) and privacy policy added (#17)
- Branch flow: work lands on `dev`, `master` only accepts `dev`; CI runs on both and validates the extension's files (#23)
- Contribution workflow: issue forms, pull request template, proposal docs, CI check on pull request descriptions (#3)
- Fix seven extension defects found in the audit; add tests (#2)
