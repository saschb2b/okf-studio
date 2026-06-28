# Maintaining the javascript-ecosystem skill

This skill is a dated snapshot of a fast-moving ecosystem. It is technical debt by design: useful only as long as it is refreshed. This is the upkeep process.

The `date` field in `SKILL.md` frontmatter is the snapshot date (last full review). Each notes file carries its own `**Verified YYYY-MM-DD**` line.

## When to refresh
- A tool ships a new major version or a notable paradigm shift.
- A notes file's `Verified` date is more than roughly 3 to 6 months old. Run the freshness report:
  ```sh
  node scripts/check-freshness.mjs                              # oldest entries first
  node scripts/check-freshness.mjs --max-age-days=120 --fail    # non-zero exit if any are stale (for CI)
  ```
- A user reports a version newer than a file documents, or a tool that is not in the index.

## How to refresh an entry (official docs are the source of record)
1. Read the tool's OFFICIAL docs: release notes, migration guide, and the relevant API pages. Do not refresh from memory or from secondary blogs.
2. Update `Current stable`, the `Stop / Start` table (the durable part), and the gotchas with the current API names and config.
3. Bump the file's `**Verified YYYY-MM-DD**` line to today.
4. If the headline shift changed, update that tool's one-line row in the `SKILL.md` index.
5. Run the checks:
   ```sh
   node scripts/check-skills.mjs       # frontmatter, links, registration
   node scripts/check-freshness.mjs    # date report
   ```
6. After a full pass, bump the snapshot date: the `date` in `SKILL.md` frontmatter and the "Snapshot date" line in the freshness section.

## Adding a tool
Copy [_template.md](./_template.md) into the right `references/<category>/` folder, fill the `Stop / Start` table, and add one row to the matching `SKILL.md` index table. The notes under `references/` are a conformant OKF bundle, so keep the template's frontmatter (a non-empty `type`); `node scripts/check-skills.mjs` validates it. The template documents the conventions (notably: teachable artifacts live inside this skill, and cross-skill references are optional).

## Efficient bulk refresh
A category re-verify is cheap with parallel research: one agent per tool, each reading the official docs and returning the current config plus the "what LLMs get wrong" deltas, then fold the results into the notes files. Prioritize the categories whose freshness dates are oldest.

## Source
The skill is distilled in part from posts on saschb2b.com/blog; the per-tool data is grounded in each tool's official documentation.
