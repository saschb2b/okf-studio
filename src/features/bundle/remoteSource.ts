// Parse a pasted URL into a RemoteSource — network-free, so the Open-from-URL
// dialog can preview what it will fetch as you type. The backend does the actual
// fetch into a local cache dir (see docs/architecture/ipc-and-security.md).
//
// Recognized shapes:
//   - GitHub web URLs, including a subpath:
//       github.com/owner/repo
//       github.com/owner/repo/tree/<ref>/<subpath…>
//       github.com/owner/repo/blob/<ref>/<subpath…>   (blob → its containing dir)
//     (a github.com/owner/repo.git URL is accepted too — the .git is stripped)
//   - Direct archive URLs (.tar.gz / .tgz / .tar / .zip)
// Cloning arbitrary git hosts is out of scope (see RemoteKind). Anything else
// returns null, so the dialog can flag it before any fetch.

import type { RemoteKind, RemoteSource } from "@/shared/types.ts";

const ARCHIVE_RE = /\.(tar\.gz|tgz|tar|zip)$/i;

/** Trim, strip a trailing slash, and require an http(s) URL. */
function normalize(input: string): URL | null {
  const raw = input.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

/** Build the compact "owner/repo · ref · /subpath" label for a source. */
function labelFor(s: Omit<RemoteSource, "label">): string {
  if (s.kind === "archive") {
    const file = s.input.split("/").filter(Boolean).pop() ?? s.host;
    return `${s.host} · ${file}`;
  }
  const repo = s.owner && s.repo ? `${s.owner}/${s.repo}` : s.host;
  const parts = [repo];
  if (s.ref) parts.push(s.ref);
  if (s.subpath) parts.push(`/${s.subpath}`);
  return parts.join(" · ");
}

function make(partial: Omit<RemoteSource, "label">): RemoteSource {
  return { ...partial, label: labelFor(partial) };
}

/**
 * Parse `input` into a RemoteSource, or null if it isn't a URL we can fetch.
 * Pure and synchronous — safe to call on every keystroke.
 */
export function parseRemoteSource(input: string): RemoteSource | null {
  const url = normalize(input);
  if (!url) return null;
  const host = url.host.toLowerCase();

  // GitHub web URL → owner/repo (+ optional ref/subpath from tree|blob).
  if (host === "github.com" || host === "www.github.com") {
    const segs = url.pathname.split("/").filter(Boolean);
    if (segs.length < 2) return null;
    const [owner, repoRaw, kindSeg, ref, ...rest] = segs;
    const repo = repoRaw.replace(/\.git$/i, "");
    let subpath: string | undefined;
    let branch: string | undefined = ref;
    if (kindSeg === "tree" || kindSeg === "blob") {
      // blob points at a file; scope to its containing directory.
      const restPath = kindSeg === "blob" ? rest.slice(0, -1) : rest;
      subpath = restPath.length ? restPath.join("/") : undefined;
    } else {
      branch = undefined; // bare repo URL — backend uses the default branch
    }
    return make({ input: input.trim(), kind: "github", host: "github.com", owner, repo, ref: branch, subpath });
  }

  // Direct archive download (any host).
  if (ARCHIVE_RE.test(url.pathname)) {
    return make({ input: input.trim(), kind: "archive", host });
  }

  return null;
}

/** A one-word source-kind tag for the preview chip. */
export function remoteKindLabel(kind: RemoteKind): string {
  return kind === "github" ? "GitHub" : "Archive";
}

/**
 * Curated one-click examples for the first-run empty state, so a brand-new user
 * with no local bundle can see the viewer do something immediately. Each must be
 * a real, public OKF bundle. The app's own docs/ folder is a dogfooded bundle.
 */
export interface RemoteExample {
  title: string;
  blurb: string;
  url: string;
}

export const REMOTE_EXAMPLES: RemoteExample[] = [
  {
    title: "OKF Studio docs",
    blurb: "This app's own knowledge, as an OKF bundle",
    url: "https://github.com/saschb2b/okf-studio/tree/main/docs",
  },
];
