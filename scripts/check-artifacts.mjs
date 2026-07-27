#!/usr/bin/env node
// Report the size of the local build caches, and fail when they run away.
//
// Rust's dev profile is called `debug` for a reason: it emits debug info per
// crate per target kind, and keeps an incremental-compilation cache that grows
// with every recompile. Nothing prunes either. This workspace's `target/` reached
// 68 GB across one working session — 35 GB of incremental cache, 30 GB of
// artifacts — and filled the disk mid-build, which surfaces as a linker error
// (`no space on device`) rather than as anything that looks like a disk problem.
//
// So this is a local hygiene check, not a CI gate: a CI runner starts empty and
// has nothing to report. It runs on demand and as part of `pnpm check:local`.
//
//   pnpm check:artifacts        report, and fail past the ceiling
//   pnpm clean:rust             reclaim it all (a full rebuild follows)

import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

// Generous enough for a release build beside a debug one, low enough that the
// runaway case is caught while it is still minutes to fix rather than a full day
// of accumulated cache.
const CEILING_GB = 25;

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

/** Directories worth naming separately, because the fix differs for each. */
const TRACKED = [
  ["target/debug/incremental", "Rust incremental cache — pruned by `cargo clean`, nothing else"],
  ["target/debug/deps", "Compiled crates, one copy per target kind"],
  ["target/debug/build", "Build-script output"],
  ["target/release", "Release artifacts"],
  ["node_modules/.cache", "Vite and Storybook caches"],
];

async function directorySize(path) {
  let total = 0;
  const walk = async (dir) => {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const child = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(child);
      } else if (entry.isFile()) {
        try {
          total += (await stat(child)).size;
        } catch {
          // A file compiled away mid-walk is not an error worth failing on.
        }
      }
    }
  };
  await walk(path);
  return total;
}

const gb = (bytes) => bytes / 1024 ** 3;

const rows = [];
for (const [relative, note] of TRACKED) {
  const size = await directorySize(join(ROOT, relative));
  if (size > 0) rows.push({ relative, note, size });
}

const target = await directorySize(join(ROOT, "target"));
const width = Math.max(...rows.map((row) => row.relative.length), 8);

for (const row of rows) {
  console.log(`${row.relative.padEnd(width)}  ${gb(row.size).toFixed(2).padStart(7)} GB  ${row.note}`);
}
console.log(`${"target".padEnd(width)}  ${gb(target).toFixed(2).padStart(7)} GB  total`);

if (gb(target) > CEILING_GB) {
  console.error(
    `\ntarget/ is ${gb(target).toFixed(1)} GB, past the ${CEILING_GB} GB ceiling.` +
      `\nRun \`pnpm clean:rust\` — it is all regenerable cache, and a full rebuild follows.`,
  );
  process.exit(1);
}
console.log(`\nWithin the ${CEILING_GB} GB ceiling.`);
