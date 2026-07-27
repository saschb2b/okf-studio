---
type: Proposal
title: Jarvis Mode
description: An opt-in cinematic staging of an agent turn, where every panel that appears corresponds to something the agent actually used.
tags: [proposal, ux, agents, motion, spectacle]
generated: { by: claude/unrecorded, at: 2026-07-27T00:00:00Z }
---

# Status

Proposed, off by default, and honest about being a spectacle. It is a party trick first. The by-product described under [What it accidentally is](#what-it-accidentally-is) is real but is not the reason to build it, and this proposal should not be justified on that basis after the fact.

# What it is

One setting: **Jarvis Mode**, disabled by default.

With it on, sending a prompt turns the window into a staging area. Every piece of context the agent actually reaches for — a concept page, a retrieved excerpt, a matched line, a code block, an attestation verdict — arrives as its own panel, one after another, in the order the agent used it. The turn plays out as a sequence rather than resolving silently into an answer.

When the answer lands, the stage collapses to it.

# Why bother

Because the request was for the experience, and that is a legitimate thing to want from software. Most of what Studio does during a turn is invisible: retrieval ranks candidates, tools read concepts, evidence is compiled and bounded, checks pass or fail. All of it is currently either hidden or folded into a summary strip.

There is no productivity argument here and this proposal does not attempt one.

# What Hollywood actually does

Fictional interfaces are a real craft discipline — **FUI**, variously fantasy, fictional, or film user interfaces — with practitioners like [Territory Studio](https://territorystudio.com/sci-fi-interfaces-and-emerging-technology-4/) (*Blade Runner 2049*, *The Martian*, *Ex Machina*) and [Jayse Hansen](https://www.pushing-pixels.org/2012/06/01/the-craft-of-screen-graphics-and-movie-user-interfaces-conversation-with-jayse-hansen.html), who designed the Iron Man and Avengers HUDs. Their working rules are more useful here than the visual style, because the style is easy and the rules are what make it read as thought rather than as noise.

**Pattern at a glance, not raw data.** Hansen's stated aim for the Mark VII HUD was that Stark could "read the patterns at a glance, rather than just raw information". The viewer is never meant to read the text. They are meant to read the *shape* of the activity: how dense it is, how fast, where it converges.

**Everything on screen has a referent.** Stereoscopic filming removed the ability to hide filler behind depth-of-field — "everything is in focus, so everything is readable" — which forced every element to serve the scene. This is the principle that separates a good FUI from a screensaver, and it is the one that matters most for us: no decorative panels, ever.

**Grounded in something true.** Hansen consulted an F-18 pilot about real HUD information architecture before designing a fictional one. The credibility of the fiction came from the accuracy underneath it. Fiction that is not grounded reads as arbitrarily cool.

**It responds to the actual input.** The Iron Man HUD was built to react to Downey's unscripted gestures rather than run a canned animation. A sequence that plays identically regardless of what happened is a loading screen with ambition.

**Tempo is expressive.** Spielberg briefed the *Minority Report* interface as "conducting an orchestra", which is what [John Underkoffler](https://www.smashingmagazine.com/2013/03/sci-fi-interaction-designers-gestural-interfaces/) built toward. Rhythm carries meaning: rests, accelerations, and a convergence beat at the end. A uniform drip of panels is not a performance.

**The counter-evidence is worth keeping.** The *Minority Report* interface [did not survive contact with real use](https://www.technologyreview.com/2011/04/22/195179/the-struggle-to-spread-the-minority-report-interface/) — gestural arm fatigue is real, and a decade of designers copying its look produced worse products. The lesson is not "don't do it". It is that spectacle is a mode, not a default, and it must not tax the person using it. Hence: off unless asked for, and never in the way of typing.

# The grammar, mapped to what Studio already emits

The staging does not need invented data. A turn already produces a rich, ordered, true event stream:

| Beat | Real source |
| --- | --- |
| The question is classified, a route is chosen | `RetrievalReceipt.queryClass`, `route`, `routeReason` |
| Candidates rank, some win | `receipt.candidates` with per-stage `ScoreComponents` |
| Excerpts are selected and bounded | `evidence.items`, each with concept, heading path, source range |
| Some things are deliberately left out | `receipt.omissions`, each with a stable reason |
| Warnings attach to what was kept | `evidence.caveats` — stale, deprecated, conflicting, unattributed |
| The agent reaches into the bundle | tool calls, already tracked for the live-work shelf |
| A claim gets checked | `AttestationReport.verdict` |
| The answer resolves | the assistant message |

Every panel is one of these. Nothing is fabricated to fill a gap, and a quiet turn is allowed to look quiet — that is the honest rendering of a quiet turn.

# Staging: in-app, not OS windows

The obvious reading of "separate windows" is real OS windows. It should not be, and the reason is functional rather than aesthetic.

**Jarvis is conversational.** A window that appears takes focus. Focus theft mid-sentence breaks the exact interaction the mode exists to dramatize — you would be typing to Jarvis and have the keystrokes land somewhere else. Add a dozen taskbar entries, per-webview memory, and window creation latency, and the cinematic version is also the unusable one.

So: **an in-app stage** — a full-window overlay hosting floating panels, one webview, GPU-composited, with complete control over layout and timing. It can look like scattered windows without being them.

[Multi-View](multi-view.md) already proposes undocking a tab into a real OS window for deliberate, user-initiated screen real estate. That is the correct use of a real window: the user asked for it and expects the focus change. Jarvis Mode is the opposite case — many short-lived panels nobody asked to interact with — and the two should not share a mechanism.

A later phase could spill the stage across a second monitor as a genuinely separate always-on-top, non-activating window. That is a nice-to-have, not the first version.

# Choreography of one turn

1. **Ignition.** On send, the reader dims and recedes. One beat, not a wipe.
2. **The question.** The prompt takes centre, with the classified route named beneath it. This is the establishing shot and it earns its beat because everything after is a consequence of it.
3. **The sweep.** Candidates flicker in as compact cards, ranked, faster than they can be read — deliberately. This is the pattern-at-a-glance beat: density carries "it looked at a lot", not the text.
4. **Selection.** Winning candidates enlarge into readable excerpts with their concept title and heading path; losing candidates fade with their omission reason. The contrast between kept and dropped is the most legible moment in the sequence and should be given room.
5. **Annotation.** Caveats attach to the panels they belong to — stale, deprecated, unattributed. Colour and icon, per the existing state tokens.
6. **Work.** Tool calls appear as they happen, each naming what it touched. This is the only beat whose length is unpredictable, so it must tolerate being long or absent.
7. **Convergence.** Everything collapses toward the answer, which resolves in place. The detective-scene beat: many threads, one conclusion.
8. **Rest.** The stage clears to the ordinary conversation view, which now holds the answer. Nothing persists except what would have been there anyway.

Panels should carry the same type colours and chrome the app already uses. The spectacle is Studio behaving theatrically, not a skin pretending to be another product.

# Constraints that are not negotiable

- **Off by default.** One setting, and the mode does nothing until it is on.
- **`prefers-reduced-motion` and the existing `reduceMotion` setting disable the animation**, not the feature. Panels still appear and still say what was used; they simply cut instead of fly. Vestibular safety is not a style preference, and a full-window motion sequence is exactly the category that triggers it.
- **Never takes focus.** The composer keeps the caret throughout. If you can't keep typing, it has failed.
- **Never invents a panel.** Every panel maps to a real event. A turn that used three things shows three things. Padding it would break the one Hollywood rule that actually matters here, and would quietly make Studio lie about what the agent read — which is the opposite of everything the retrieval receipt and the attestation gate exist to do.
- **Interruptible.** Escape, or clicking anywhere, drops straight to the answer. Never trap someone in a cutscene.
- **Bounded.** A turn touching 200 sections cannot open 200 panels. Cap the stage, aggregate the tail, and say so on screen rather than silently truncating.
- **Costs nothing when off.** Code-split; a user who never enables it should not pay for it in bundle size or per-turn work.

# What it accidentally is

Stated last, and deliberately not used as the justification.

Studio already computes everything above and mostly hides it behind an Inspect action. Because the FUI rule "everything on screen has a referent" is *satisfiable* here — film has to fake it, we don't — the spectacle happens to be the most visceral answer available to "what did the agent actually look at?".

That is the same question the retrieval receipt, the evidence packet, and the attestation gate all answer soberly. If the mode turns out to be useful rather than fun, the useful thing will be that people finally *see* the omissions and caveats they currently never open a panel to read.

That would be a pleasant surprise. It is not a reason to build it, and if the spectacle is dull the by-product will not save it.

# Scope

**First cut.** The setting, the in-app stage, and beats 1–4 and 7 driven by the retrieval receipt alone. The receipt is the richest true source and needs no new plumbing.

**Second.** Tool calls and caveats — beats 5 and 6 — which need the live-work stream routed to the stage.

**Later, if it earns it.** A second-monitor stage, per-beat tuning, and an attestation beat for a gated number.

# Open questions

- Does the sweep read as thinking or as a loading screen? This is the whole bet, and it cannot be settled on paper — it needs a prototype of beat 3 with real receipts from a real bundle.
- Does anyone leave it on after the first day? If not, that is fine; it was a party trick. But it should be measured rather than assumed either way.
- Is the reader dimmed or replaced? Dimming keeps context and is less disorienting; replacing is more cinematic. Probably dim, but worth trying both.
