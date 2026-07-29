---
type: Reference
title: "no-slop: commit messages and PR descriptions"
description: "Both describe a change to someone reading it later."
tags: [writing, ai-slop, style, editing]
generated: { by: claude-code/unversioned, at: 2026-07-29T00:00:00Z }
---
# no-slop: commit messages and PR descriptions

Both describe a change to someone reading it later. The slop is text that restates the diff instead of the reason for it, or performs a convention the repo does not use. Match the repo's existing history.

Both take the flavored mode from [ste.md](ste.md). A commit subject is already close to an STE instruction, one action, imperative, under the cap, so the sentence rules cost nothing here.

## Commit messages

| Tell | Fix |
|---|---|
| "This commit adds..." third-person preamble | imperative subject ("Add retry to upload handler") |
| Subject restates the diff with no reason | the diff shows what; add why, or keep a one-line subject |
| Body that bullet-lists every file or hunk touched | summarize the change as one idea |
| Emoji or gitmoji prefix in a repo that has none | match the history, drop it |
| feat/fix/chore prefix bolted on, often the wrong type | use the repo's convention correctly, or none at all |

Before:

```
This commit adds a retry mechanism to the upload handler
- added retry loop
- added backoff
- updated the upload test
```

After:

```
Retry failed uploads before surfacing an error

Flaky network drops were failing the first attempt and showing
users a hard error. Retry three times with backoff.
```

The diff already lists the hunks. The message says why the change exists. Git subjects read as "if applied, this commit will <subject>", so write the imperative: "Retry failed uploads", not "This commit retries" or "Retried".

## PR descriptions

| Tell | Fix |
|---|---|
| Same Summary/Changes/Testing scaffold on every PR | lead with the problem and the user-visible effect |
| "Changes" section that rewords the file list | link the diff, do not narrate it |
| Filler opener ("This PR introduces a number of improvements") | start at the outcome |
| Pre-ticked checklist the author did not act on | remove it, or leave only boxes that are true |
| Marketing register ("robust, production-ready, seamless") on a small change | concrete and measured, quantify a claimed gain |

Before:

```
## Summary
This PR introduces changes to the authentication module.
## Changes
- Modified auth.ts
- Updated middleware.ts
## Testing
Tested to ensure everything works as expected.
```

After:

```
Fixes the session-fixation bug (#412) by rotating the session ID
on login. Verified by logging in twice and confirming the cookie
value changes.
```

A two-sentence PR does not need three H2 sections. Lead with the problem, name the user-visible effect, link the issue, and say how you checked it.

## Don't over-correct

A PR with many independent changes earns sections and a checklist that is actually true. A breaking change earns a prominent note. The target is the empty scaffold and the restated diff, not structure a reader needs.

## Not register, send elsewhere

A long, plausible PR body the author cannot defend is a contribution-quality problem, not a phrasing one. That belongs in review, not here.
