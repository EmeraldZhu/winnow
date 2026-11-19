# Winnow privacy policy

Last updated: 17 November 2026. Applies to version 0.1.0 of the extension.

## In short

Winnow sends nothing anywhere. It has no server, no account, no analytics and
no advertising. Everything it stores stays in your browser, and removing the
extension deletes all of it.

## What Winnow reads

Winnow runs on `www.youtube.com`. On a video page it reads the comments shown
on that page (the text, the commenter's @handle, and the "2 hours ago" style
time) so it can decide which ones to hide. It does this inside your browser.
The comments are not copied anywhere else.

It does not read your YouTube account, your watch history, your search terms,
or anything on other websites.

## What Winnow stores in your browser

All of this is kept in the extension's own storage (`chrome.storage.local`) on
your device.

| What | Why | Kept for |
|---|---|---|
| Your settings | To remember which filters are on | Until you change them |
| Counts (comments hidden this week, reports made, comments you revealed) | To show them in the popup | Until removed |
| A random install ID, and when it was created | Reserved for a future shared blocklist (see below). It is not derived from you or your device | Until you reset it on the options page |
| Your blocked and trusted lists: the @handles of commenters you reported or chose to always show | To hide or keep those accounts' comments | Until you remove them on the options page |
| A queue of your reports. Each holds the commenter's @handle, the reason you picked, a short fingerprint of the comment text (not the text itself), the ID of the video, the rules version, the install ID and the time | Reserved for a future shared blocklist. Today the queue is never sent | Until removed |
| A fingerprint of each comment of 40 characters or more that Winnow has scanned, with the IDs of the videos it appeared on | To spot the same comment pasted under several videos | 7 days after it was last seen |

Two of these, the report queue and the repeated-comment record, contain video
IDs. Together they are a partial record, on your device only, of videos whose
comments you loaded. Replacing those IDs with a form that cannot be read back
is tracked in [issue 14](https://github.com/EmeraldZhu/winnow/issues/14).

## What Winnow sends

Nothing. The extension makes no network requests of its own. The only thing it
loads is its own rules file, which is packaged inside the extension.

## Permissions

- **`storage`**: to keep the items in the table above.
- **`alarms`**: a once-a-day timer reserved for fetching a shared blocklist in
  a future version. Today it does nothing.
- **Access to `www.youtube.com`**: to read and hide comments on YouTube pages.

## Deleting your data

- Removing the extension deletes everything it stored.
- The options page lets you remove accounts from your blocked and trusted
  lists and reset the install ID.

## Other people's information

The blocked and trusted lists and the report queue contain the public @handles
of YouTube commenters. They stay on your device and are not shared with anyone,
including us.

## Planned changes

A later version is planned to let you contribute your reports to a shared,
public blocklist of spam accounts. That would mean sending reports to a
server. Before any version that sends data is released, this policy will be
rewritten to say exactly what is sent, and the change will be listed in
[`CHANGELOG.md`](CHANGELOG.md).

## Questions

Open an issue at <https://github.com/EmeraldZhu/winnow/issues>.
