#!/usr/bin/env node
// build-apt-repo.mjs — assemble a signed APT repository from the `.deb` assets
// already attached to GitHub Releases, so `apt upgrade` becomes a real update
// path for the package the release matrix already builds.
//
// The repository is *derived*, never committed: releases stay the single source
// of truth, and a rerun rebuilds the whole tree from scratch. It is written into
// `site/public/apt`, which Astro copies verbatim into the Pages artifact, so the
// site and the repository deploy as one thing or not at all. Publishing them
// separately would let the download page advertise a suite that is not there
// yet, which is the failure mode worth designing out.
//
// `Filename:` in a Packages file is resolved against the repository base URL, so
// the packages have to be served from the same origin as the index. That is why
// the `.deb` files are copied into the Pages artifact rather than pointed at
// their release download URLs, and why only the most recent few are kept.
//
// Signing is not optional. apt refuses an unsigned repository unless the user
// writes `[trusted=yes]` in the source, which switches off the verification this
// whole exercise exists to provide. So a missing key skips the build loudly and
// leaves no tree behind, rather than shipping one that only works with checking
// disabled.
//
// See docs/architecture/build-and-release.md.

import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, copyFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, basename } from "node:path";
import { gzipSync } from "node:zlib";

const REPO = process.env.GH_REPO ?? "saschb2b/okf-studio";
const OUT = resolve(process.env.APT_OUT ?? "site/public/apt");
const KEEP = Number.parseInt(process.env.APT_KEEP ?? "5", 10);

// Suite/component/architecture are baked in rather than configured: they appear
// verbatim in the source line every user pastes, so changing one is a breaking
// change for every existing install, not a knob.
const ORIGIN = "OKF Studio";
const SUITE = "stable";
const COMPONENT = "main";
const ARCH = "amd64";
const PACKAGE = "okf-studio";

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...opts });

/** The signing key, or null when this run has no way to sign. */
function signingKey() {
  try {
    const listed = run("gpg", ["--list-secret-keys", "--with-colons"]);
    const line = listed.split("\n").find((l) => l.startsWith("sec:"));
    if (!line) return null;
    // The fingerprint on the `fpr` record after `sec` is the unambiguous handle;
    // a short key id can collide.
    const records = listed.split("\n");
    const secAt = records.indexOf(line);
    const fpr = records.slice(secAt).find((l) => l.startsWith("fpr:"));
    return fpr ? fpr.split(":")[9] : null;
  } catch {
    return null;
  }
}

/** gpg arguments that keep it non-interactive in CI. */
function gpgBatch(key) {
  const args = ["--batch", "--yes", "--local-user", key];
  if (process.env.APT_GPG_PASSPHRASE) {
    args.push("--pinentry-mode", "loopback", "--passphrase", process.env.APT_GPG_PASSPHRASE);
  }
  return args;
}

/** The published releases to carry, newest first, drafts and prereleases dropped. */
function releasesToCarry() {
  const listed = run("gh", [
    "release", "list",
    "--repo", REPO,
    "--limit", String(Math.max(KEEP * 2, 10)),
    "--json", "tagName,isDraft,isPrerelease",
  ]);
  return JSON.parse(listed)
    .filter((r) => !r.isDraft && !r.isPrerelease)
    .slice(0, KEEP)
    .map((r) => r.tagName);
}

const key = signingKey();
if (!key) {
  console.warn(
    "build-apt-repo: no GPG secret key in this environment, skipping the APT repository.\n" +
      "  An unsigned repository is worse than none: apt rejects it unless the user disables\n" +
      "  verification. Set the APT_GPG_PRIVATE_KEY secret to publish one.",
  );
  // Leave nothing behind, so a signed tree from a previous run in a dirty
  // workspace cannot be mistaken for this run's output.
  rmSync(OUT, { recursive: true, force: true });
  process.exit(0);
}

const staging = mkdtempSync(join(tmpdir(), "okf-apt-"));
const poolDir = join(staging, "pool", COMPONENT, PACKAGE[0], PACKAGE);
const distDir = join(staging, "dists", SUITE);
const binDir = join(distDir, COMPONENT, `binary-${ARCH}`);
mkdirSync(poolDir, { recursive: true });
mkdirSync(binDir, { recursive: true });

const tags = releasesToCarry();
let carried = 0;
for (const tag of tags) {
  const scratch = mkdtempSync(join(tmpdir(), "okf-deb-"));
  try {
    run("gh", ["release", "download", tag, "--repo", REPO, "--pattern", "*.deb", "--dir", scratch], {
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    // A release with no .deb (an early tag, or a build that failed that lane)
    // is skipped rather than fatal: one gap must not cost every other version.
    console.warn(`build-apt-repo: ${tag} has no .deb asset, skipping it.`);
    rmSync(scratch, { recursive: true, force: true });
    continue;
  }
  for (const file of readdirSync(scratch).filter((f) => f.endsWith(".deb"))) {
    copyFileSync(join(scratch, file), join(poolDir, basename(file)));
    carried += 1;
  }
  rmSync(scratch, { recursive: true, force: true });
}

if (carried === 0) {
  console.warn("build-apt-repo: no .deb assets found across the carried releases, skipping.");
  rmSync(staging, { recursive: true, force: true });
  rmSync(OUT, { recursive: true, force: true });
  process.exit(0);
}

// `dpkg-scanpackages` writes `Filename:` relative to its working directory, so
// it has to run at the repository root for the paths to resolve under the
// published base URL.
// `--multiversion` indexes every version in the pool rather than only the
// newest. Without it the older `.deb` files ship in the artifact but appear in
// no index, which is pure weight, and a user who needs to pin back after a bad
// release has nothing to pin to.
const packages = run("dpkg-scanpackages", ["--multiversion", "--arch", ARCH, "pool"], {
  cwd: staging,
  stdio: ["ignore", "pipe", "inherit"],
});
writeFileSync(join(binDir, "Packages"), packages);
writeFileSync(join(binDir, "Packages.gz"), gzipSync(Buffer.from(packages), { level: 9 }));

const release = run(
  "apt-ftparchive",
  [
    "-o", `APT::FTPArchive::Release::Origin=${ORIGIN}`,
    "-o", `APT::FTPArchive::Release::Label=${ORIGIN}`,
    "-o", `APT::FTPArchive::Release::Suite=${SUITE}`,
    "-o", `APT::FTPArchive::Release::Codename=${SUITE}`,
    "-o", `APT::FTPArchive::Release::Architectures=${ARCH}`,
    "-o", `APT::FTPArchive::Release::Components=${COMPONENT}`,
    "-o", `APT::FTPArchive::Release::Description=${ORIGIN} desktop releases`,
    "release", join("dists", SUITE),
  ],
  { cwd: staging, stdio: ["ignore", "pipe", "inherit"] },
);
writeFileSync(join(distDir, "Release"), release);

// Both signatures: `InRelease` is what modern apt fetches, `Release.gpg` keeps
// older clients working, and shipping one without the other is a silent failure
// on whichever half is missing.
run("gpg", [...gpgBatch(key), "--clearsign", "-o", join(distDir, "InRelease"), join(distDir, "Release")]);
run("gpg", [...gpgBatch(key), "--detach-sign", "--armor", "-o", join(distDir, "Release.gpg"), join(distDir, "Release")]);

// The armored public key, served next to the repository. Modern apt reads an
// armored key straight from `Signed-By`, so the user needs no `gpg --dearmor`
// step and no key in the deprecated trusted.gpg.d pile.
writeFileSync(join(staging, `${PACKAGE}.asc`), run("gpg", ["--armor", "--export", key]));

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
for (const entry of readdirSync(staging)) {
  run("cp", ["-R", join(staging, entry), OUT]);
}
rmSync(staging, { recursive: true, force: true });

for (const required of [join("dists", SUITE, "InRelease"), join("dists", SUITE, "Release.gpg"), `${PACKAGE}.asc`]) {
  if (!existsSync(join(OUT, required))) {
    console.error(`build-apt-repo: ${required} missing after copy, refusing to call this a repository.`);
    process.exit(1);
  }
}

const versions = [...packages.matchAll(/^Version: (.+)$/gm)].map((m) => m[1]);
console.log(
  `build-apt-repo: ${carried} package(s) from ${tags.length} release(s) ` +
    `(${versions.join(", ")}), signed by ${key}.`,
);
