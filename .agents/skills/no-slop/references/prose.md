---
type: Reference
title: "no-slop: prose before and after"
description: "Concrete rewrites for each tell."
tags: [writing, ai-slop, style, editing]
generated: { by: claude-code/unversioned, at: 2026-07-29T00:00:00Z }
---
# no-slop: prose before and after

Concrete rewrites for each tell. The "after" is shorter in almost every case. That is the signal you are doing it right.

These are repairs. The construction rules that stop most of them from being written in the first place are in [ste.md](ste.md), and reaching for this page instead of that one is the expensive order to work in.

## Em dashes

Before: The migration is simple — you change one config value — and everything else follows.
After: The migration is simple. You change one config value and everything else follows.

## not X, but Y

Before: This isn't just a refactor, it's a rethink of how the module is structured.
After: This refactor rethinks how the module is structured.

## Rule of three

Before: The API is fast, flexible, and powerful.
After: The API returns in under 10ms. (Name the property that matters, drop the decorative triple.)

## Throat-clearing opener

Before: In today's fast-moving development landscape, choosing the right database matters.
After: The database choice locks in your query patterns for years. Choose for the reads you do most.

## Self-summarizing close

Before: In conclusion, by following these steps you'll have a working setup that's robust and maintainable.
After: (Delete the paragraph. The last real instruction is the ending.)

## Transition filler

Before: Moreover, it's worth noting that the cache also reduces load on the primary.
After: The cache also takes load off the primary.

## Reflexive hedging

Before: It's important to note that this approach may potentially introduce some latency.
After: This approach adds latency, roughly 20ms per call. (Cut the hedge, then quantify if you can.)

## Validation

Before: Great question! You're absolutely right to think about error handling here.
After: Error handling is the gap here.

## Forced enumeration

Before: There are three main benefits to this approach. First, it's faster. Second, it's cleaner. Third, it scales.
After: The approach is faster and cleaner, and it holds up as the data grows. (Drop the announced count. Three short connected points read better as a sentence than as a numbered list.)

## List-itis (prose belongs here)

Before:

> The cache helps in several ways:
> - Reduces database load
> - Improves response time
> - Lowers cost

After:

> The cache takes read load off the database, which cuts response time and the bill that comes with it.

The three items are not independent. They are one causal chain (less load leads to faster reads leads to lower cost), so a sentence carries the logic that bullets flatten. Use the list when the items are genuinely parallel, like install steps or config options.

## Padding to a round number

Before: Five tips for faster builds: cache dependencies, parallelize tests, prune dead code, use a faster runner, and "consider your overall strategy".
After: Three things move build time most: cache dependencies, parallelize tests, switch to a faster runner. (The fourth and fifth were filler to reach five. Ship the real ones.)

## Slop vocabulary

Before: We leverage a robust, seamless pipeline to foster collaboration across teams.
After: The pipeline runs the same way in CI and locally, so teams share one build.

## Significance inflation

Before: The library stands as a testament to the town's enduring commitment to education and marks a pivotal moment in its development.
After: The town opened the library in 1974.

The tell is a claim shape, not a single word: an ordinary subject is declared important, historic, or pivotal. Cut "stands as", "serves as a testament", "marks a pivotal moment", "underscores the importance of", "enduring legacy". State the fact and let it carry its own weight.

## Inflated copula

Before: The building serves as the company's headquarters and boasts six floors.
After: The building is the company's headquarters and has six floors.

Models dodge plain "is" and "has" for "serves as", "boasts", "features", "offers". When the inflated verb does nothing but avoid "is" or "has", put the plain verb back.

## Vague authority

Before: Experts agree this is one of the most influential techniques, and studies show it improves outcomes.
After: A 2021 trial found a 12% improvement. (Or cut the claim if you cannot source it.)

"Studies show", "experts agree", "it is widely regarded" assert backing that is not there. Name the source or drop the sentence. This differs from hedging: hedging softens a claim, this invents support for it.

## Participle-chain tail

Before: The population reached 56,998, further cementing the region's significance.
After: The population reached 56,998.

A trailing "-ing" clause glued to a finished fact to fake analysis. Cut tails that start with "further cementing", "highlighting", "underscoring", "reflecting", "showcasing", "contributing to".

## False inclusivity

Before: Whether you're a seasoned developer or just getting started, this tool has something for you.
After: This tool parses config files into typed objects.

"Whether you're A or B" pretends to address everyone and says nothing. State who the thing is actually for, or just say what it does.

## Chatbot scaffolding

Before: Now that we understand the basics, let's dive into the configuration. As you can see, it's straightforward! And there you have it. Happy coding!
After: (Delete all of it. Lead with the configuration, end on the last real instruction.)

Tutorial framing that narrates the document to the reader: "Let's dive in", "As you can see", "Without further ado", and the cheerful send-off "And there you have it", "Happy coding!", "I hope this helps!". None of it carries information.

## Negative-space hype

Before: Say goodbye to messy configs. Gone are the days of manual setup.
After: Configs are generated automatically.

A canned marketing reversal that invents an exaggerated old pain. Cut "Say goodbye to", "No more", "Gone are the days", "Forget about".

## Elegant variation

Before: The company shipped the update. The firm had tested it for weeks, and the organization stood behind the release.
After: The company shipped the update. It had tested the release for weeks and stood behind it.

Swapping synonyms for the same thing ("company", then "firm", then "organization") to dodge repetition reads as stilted. Repeat the plain noun, or use a pronoun.

## Rhythm

Before: three back-to-back sentences of roughly equal length and identical cadence, each opening with "The".
After: vary it. Add a short sentence. It resets the ear.

LLM prose clusters around long, even sentences that all start the same way. A run of equal-length sentences is its own tell. Mix lengths and vary how sentences open.

## A full paragraph

Before:

> In today's rapidly evolving tech landscape, it's crucial to leverage robust tooling. Our new CLI doesn't just speed things up, it fundamentally transforms your workflow. By delving into the intricate details of your config, it seamlessly handles edge cases. Moreover, it's worth noting that setup is a breeze. Ultimately, this is a game-changer for developer productivity.

After:

> The new CLI reads your existing config and handles the edge cases that used to need manual flags. Setup is one command. In our own repo it cut the release step from nine manual actions to one.

The after is shorter, says something checkable, and drops every slop tell. Note the central move: vague praise ("game-changer", "transforms your workflow") becomes a concrete number ("nine manual actions to one"). When you cut a slop phrase, replace it with a fact, not a quieter adjective.
