---
type: Reference
title: "no-slop: Microsoft procedures and instructions"
description: "How the Microsoft guide shapes step-by-step instructions and UI interactions, judged rule by rule against the no-slop register."
tags: [writing, style, house-style, procedures]
generated: { by: claude-code/claude-fable-5, at: 2026-08-08T00:00:00Z }
sources:
  - id: ms-proc-overview
    resource: https://learn.microsoft.com/en-us/style-guide/procedures-instructions/
    title: "Procedures and instructions"
  - id: ms-proc-steps
    resource: https://learn.microsoft.com/en-us/style-guide/procedures-instructions/writing-step-by-step-instructions
    title: "Writing step-by-step instructions"
  - id: ms-proc-ui
    resource: https://learn.microsoft.com/en-us/style-guide/procedures-instructions/describing-interactions-with-ui
    title: "Describing interactions with the UI"
  - id: ms-proc-input
    resource: https://learn.microsoft.com/en-us/style-guide/procedures-instructions/describing-alternative-input-methods
    title: "Describing alternative input methods"
  - id: ms-proc-format
    resource: https://learn.microsoft.com/en-us/style-guide/procedures-instructions/formatting-text-in-instructions
    title: "Formatting text in instructions"
---

# no-slop: Microsoft procedures and instructions

The Microsoft guide's procedure section is the strongest part of the guide for this skill. Almost all of it survives contact with the register. Each cluster below carries a verdict. **adopt** applies in every mode, **house** applies in house-style mode only, **reject** names the conflict.

## Already carried

- Steps as a numbered list, imperative, one action per item, never buried in descriptive prose. Carried by [ste.md](../ste.md) and the SKILL.md pass 1 table.
- Input-neutral verbs (select, choose, enter, not click, swipe, tap). Carried by [inclusive-and-accessible.md](../inclusive-and-accessible.md).[^ms-proc-ui]
- Sentence-case headings with no end punctuation. Carried by [formatting.md](../formatting.md).

## Write fewer procedures. Verdict, adopt

The guide opens with "the best procedure is the one you don't need". If the flow is already clear, write nothing.[^ms-proc-overview] An introductory sentence that only repeats the heading gets cut.[^ms-proc-steps] Both are the SKILL.md delete-first move applied to procedures, worked through in [structure.md](../structure.md).

## The shape of a procedure. Verdict, adopt

All from the step-writing page.[^ms-proc-steps]

- Each step is a complete sentence. Capitalize the first word, end with a period.
- State the location before the action. "On the **Design** tab, select **Header row**." This is the sibling of the [ste.md](../ste.md) condition-before-command rule.
- When the starting place is unclear, spend step 1 naming the app or screen.
- Short steps in the same place may merge into one step. A pragmatic softening of one-action-per-step, not a license for compound steps.
- Include the action that finishes the procedure, such as selecting **OK** or **Apply**.
- Keep the whole procedure on one screen. Too many steps means split the task.
- A single-step procedure takes a bullet, not the number 1.
- Headings over procedures say what the reader will accomplish, phrased in parallel.

## Verb-to-element mapping. Verdict, adopt

The input-neutral principle is carried. The finer mapping is new and any technical writer can use it.[^ms-proc-ui]

| Verb | Use for |
|---|---|
| select | a button, option, link, menu item, key, or keyboard shortcut |
| enter | typing or inserting a value |
| clear | removing the check from a checkbox |
| go to | a menu, tab, website, or place in the UI |
| open, close | apps, files, panes, dialogs |
| turn on, turn off | a toggle |
| choose | an option driven by the reader's own preference |
| select and hold (or right-click) | press-and-hold interactions |
| move, drag | relocating anything on screen |

Touch-specific verbs (tap, swipe, flick) only in content written for one input method.[^ms-proc-input]

## Sequence shorthand and branching

- **house.** The "Select **Accounts** > **Other accounts** > **Add an account**" shorthand. Only when the path is obvious and the interaction is the same at each step, spaces around the symbol, symbol not bold. Screen readers can flatten it, which is why it stays house rather than adopt.[^ms-proc-steps]
- **adopt.** Branching patterns. Put a step's alternative in parentheses or a following sentence. Give several choices inside one step as a bulleted "To X, do Y" list. Separate whole-procedure alternatives with a small table so the reader can pick a method.[^ms-proc-input]

## Formatting inside instructions

- **adopt.** Describe the action, not the widget. Drop the element type unless it disambiguates ("Select **Save as**", not "Select the **Save as** button"). Drop a label's trailing colon or ellipsis. Key combinations without spaces (Ctrl+Alt+Del). When the reader must type a slash, spell the word and give the symbol in parentheses.[^ms-proc-format]
- **house.** The bolding convention itself. Bold UI labels, bold user input, italic placeholders, code style for commands and flags, match-the-UI capitalization. Outside house mode the [formatting.md](../formatting.md) bold discipline governs, so set a label off by wording or quotation marks instead.[^ms-proc-format]
- **reject.** Nothing in this section conflicts with the register.

[^ms-proc-overview]: Procedures and instructions, overview.
[^ms-proc-steps]: Writing step-by-step instructions.
[^ms-proc-ui]: Describing interactions with the UI, the input-neutral verb table.
[^ms-proc-input]: Describing alternative input methods.
[^ms-proc-format]: Formatting text in instructions, the element conventions table.
