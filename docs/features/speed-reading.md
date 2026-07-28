---
type: Feature
title: Speed Reading
description: Pace a concept word by word from the reader's Aa control, with rereading, non-prose stops, and an honest rate limit.
tags: [feature, reader, reading, accessibility, pace]
generated: { by: claude/unrecorded, at: 2026-07-28T02:10:00+02:00 }
---

# User job

A reader working through a bundle wants to get through a concept faster than scrolling allows, without trading away the understanding that made reading it worthwhile. The [Concept Reader](concept-reader.md)'s **Aa** control already owns reading comfort — size, measure, leading, font, [reading aids](../ux/accessibility.md). It gained a second half: reading *pace*.

Two modes, one engine, started only by hand:

- **Focus** clears the screen and shows one word at a time.
- **Guided** leaves the concept where it is and sweeps a marker through the real text.

# Why it is built this way

Serial presentation is not a trick; it removes a real cost. Ordinary reading spends a large fraction of its time on the saccades between words, and showing words in a fixed position removes those jumps. Each word is also positioned so that the letter the eye recognizes it by — the **optimal recognition point**, slightly left of centre, further right the longer the word — sits at the same horizontal position in every frame. That is the whole mechanism, and it is why the pivot letter must never drift.

**What that mechanism also destroys is the reason this feature is shaped the way it is.** A substantial share of eye movements in normal reading go *backwards*, and most of those regressions exist to repair a sentence that was parsed wrongly the first time. Reviews of the evidence ([Rayner, Schotter, Masson, Potter & Treiman, *So Much to Read, So Little Time*](https://journals.sagepub.com/doi/10.1177/1529100615623267)) attribute the measured comprehension deficit of one-word-at-a-time presentation to exactly this: a forward-only player takes the repair mechanism away along with the wasted travel, so misreadings are carried rather than corrected.

Studio's answer is not to promise the deficit away. It is to put rereading back inside the mode:

- The sentence being read stays printed beneath the frame, whole and legible. A word that failed to land is recovered with a glance.
- The arrow keys step a word (left/right) and a sentence (up/down), and each of those **pauses the player** — a deliberate move backwards should not be racing a clock.
- Resuming rewinds a few words rather than restarting where attention lapsed.

The second refusal is about what a word frame cannot hold. A table, a fenced code block, an equation, or a diagram means nothing shredded into a word stream, so the player **stops** at each one, renders the block as itself, and waits. Sentence jumps stop there too rather than sailing past.

**A stop is fully keyboard-operable, because it is the point where the player hands control back.** Focus moves to *Continue reading* as the block appears, so `Space` or `Enter` resumes without reaching for a mouse; the button prints the key rather than leaving it to be discovered. The block itself is a named, focusable scroll region, so a long code fence can be read to the bottom with the arrows or `Space` — the same treatment the reader gives its own wide tables and code blocks. Continuing hands focus to the transport rather than dropping it with the button that just unmounted.

# Pace, and saying what it costs

The rate defaults to **300 wpm** and ranges from 100 to 800. Comprehension generally holds through roughly 400–600 wpm and falls away above that band, with the deficit growing as the rate climbs ([PLOS One on reading-rate limits](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0153786), [CHI 2020 on RSVP workload](https://dl.acm.org/doi/10.1145/3313831.3376766)). Past 500 the player says so in a quiet line rather than letting the number climb silently. The rate stays the reader's to choose; the cost above it is not a secret.

Each frame's time on screen is not the flat rate. It is the base rate stretched by three things reading actually does: a longer word gets more of a look, a clause or sentence boundary is where comprehension is assembled, and the first word of a block is where the eye has just been thrown somewhere new.

A **phrase** frame (two short words at once) is offered beside the single-word default. Pairs never form across a sentence or clause boundary — a chunk that spans a full stop hides the boundary the reader needs.

# Word-start emphasis, offered without a claim

An optional cue bolds the opening letters of each word. It is **off by default and makes no speed claim**, because the controlled evidence does not support one: a 2024 replication ([*No, Bionic Reading does not work*](https://www.sciencedirect.com/science/article/pii/S0001691824001811)) and a 2,000-reader field test found no reading-speed or comprehension effect for typical readers. The signal is more consistent among ADHD and dyslexic readers, and some people simply find it easier to look at, so it is offered as comfort in the same spirit as the reader's existing [reading aids](concept-reader.md) — labelled for what it is.

# Moving text, and the right to stop it

Auto-advancing text is auto-updating content under [WCAG 2.2.2 Pause, Stop, Hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html), so:

- **No pacing mode is persisted.** Rate, frame size, and the word-start cue are saved in [settings](../ux/settings.md); the *mode* is not. Every session starts from a press, and opening another concept ends it.
- Pause is always one press or one space bar away, and every control is a real labelled button.
- With **Reduce motion** on, the player opens paused and never animates between frames; the guided marker's scroll follows suit.
- The ticking frame is hidden from the accessibility tree — a live region firing several times a second is unusable — and the player names what it is doing instead. The full prose is never removed: in focus mode it is in the reader behind, and in guided mode it is on screen the whole time.

# Where it lives

A **Speed read** action sits in the reader header beside Retire, Move, and Work with agent, and starts the focus player. That visibility is the point: a mode reachable only by a key and a control folded inside a popover is a mode nobody discovers. The **Aa** popover keeps the rest — guided mode, the pace stepper, the frame size, and the word-start cue — with the other reading preferences.

`S` starts focus reading on the active concept ([keyboard shortcuts](../ux/keyboard-shortcuts.md)); inside the player, space plays and pauses, the arrows move, `+`/`-` change pace, and `Esc` leaves. Closing the focus player scrolls the prose to the block reading reached, so the mode hands back a position rather than a scroll to the top.

**The word does not move.** The frame is anchored to the middle of the stage and the sentence hangs off that anchor, rather than the two being stacked and centred together. Stacked, a three-line sentence following a one-line sentence re-centres the pair and shifts the word — by 9px in the first build, in both axes — which defeats the fixed fixation point the whole layout exists for. A story measures the pivot's centre across sixty frames and several sentence boundaries and asserts it never changes.

Guided mode draws its marker *over* the prose and never inside it. The reader bakes its body HTML and re-applies it wholesale, so a highlight inserted into the text would be erased on the next render — the marker is positioned from a range's geometry, changing no markup at all.
