// Markdown rendering, sanitization, and intra-bundle link resolution.
//
// Concept bodies and log entries are raw markdown authored inside a bundle. We
// render them with `marked`, then ALWAYS pass the result through DOMPurify so no
// untrusted HTML reaches the DOM. Links between concepts are plain markdown
// links (e.g. `../tables/x.md`); `resolveHref` turns such an href into either a
// concept id (a bundle path minus `.md`), an external URL, or a broken marker.
// See docs/features/concept-reader.md and docs/architecture/okf-parsing.md.

import { marked } from "marked";
import DOMPurify from "dompurify";

// GFM "alert" callouts: a blockquote whose first line is [!NOTE] / [!TIP] /
// [!IMPORTANT] / [!WARNING] / [!CAUTION] becomes a titled, themed callout.
const ALERT_LABELS: Record<string, string> = {
  note: "Note",
  tip: "Tip",
  important: "Important",
  warning: "Warning",
  caution: "Caution",
};
const ALERT_RE = /^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(<br\s*\/?>)?\s*/i;

/**
 * Promote GFM alert blockquotes into `<div class="callout callout-KIND">` with a
 * title row, operating on a detached DOM fragment (re-sanitized afterwards). A
 * no-op where `document` is unavailable.
 */
function transformCallouts(html: string): string {
  if (typeof document === "undefined") return html;
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  for (const bq of Array.from(tpl.content.querySelectorAll("blockquote"))) {
    const firstP = bq.querySelector("p");
    if (!firstP) continue;
    const m = ALERT_RE.exec(firstP.textContent || "");
    if (!m) continue;
    const kind = m[1].toLowerCase();
    firstP.innerHTML = firstP.innerHTML.replace(ALERT_RE, "");
    if (!firstP.textContent.trim() && !firstP.querySelector("*")) firstP.remove();

    const callout = document.createElement("div");
    callout.className = `callout callout-${kind}`;
    const title = document.createElement("p");
    title.className = "callout-title";
    title.textContent = ALERT_LABELS[kind];
    const body = document.createElement("div");
    body.className = "callout-body";
    while (bq.firstChild) body.appendChild(bq.firstChild);
    callout.append(title, body);
    bq.replaceWith(callout);
  }
  return tpl.innerHTML;
}

/** Slugify heading text into a stable id (matches the reader's outline). */
function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "section"
  );
}

/**
 * Assign deduped slug ids to body headings *in the HTML string*, so the ids are
 * inherent to the rendered DOM (scroll-spy, the outline, anchor permalinks, and
 * hash links all rely on them). Baking them here — rather than mutating the
 * injected DOM at mount — keeps them present no matter how React re-applies the
 * `dangerouslySetInnerHTML` body.
 */
function slugifyHeadings(html: string): string {
  if (typeof document === "undefined") return html;
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  const used = new Set<string>();
  for (const h of Array.from(tpl.content.querySelectorAll("h2, h3, h4, h5, h6"))) {
    const base = slugify(h.textContent);
    let id = base;
    let n = 2;
    while (used.has(id)) id = `${base}-${n++}`;
    used.add(id);
    h.id = id;
  }
  return tpl.innerHTML;
}

/** Render markdown to sanitized, safe-to-inject HTML. */
export function renderMarkdown(md: string): string {
  // `async: false` forces the synchronous overload (string, not Promise).
  // `gfm` enables tables/strikethrough; `breaks:false` keeps authored single
  // newlines from becoming spurious <br>.
  const html = marked.parse(md, {
    async: false,
    gfm: true,
    breaks: false,
  });
  return DOMPurify.sanitize(slugifyHeadings(transformCallouts(html)), {
    USE_PROFILES: { html: true },
  });
}

/** Outcome of resolving a markdown link href found inside a concept body. */
export type ResolvedHref =
  | { kind: "concept"; id: string }
  | { kind: "external"; url: string }
  | { kind: "broken"; href: string };

/** The directory portion of a concept id (path), or "" for a root-level id. */
function dirOf(conceptId: string): string {
  const slash = conceptId.lastIndexOf("/");
  return slash === -1 ? "" : conceptId.slice(0, slash);
}

/** Normalize a POSIX-style path, collapsing "." and ".." segments. */
function normalizePath(path: string): string {
  const out: string[] = [];
  for (const seg of path.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      // Pop a real segment if we have one; otherwise the "../" escapes the
      // bundle root and we keep it so the caller can treat it as broken.
      if (out.length && out[out.length - 1] !== "..") out.pop();
      else out.push("..");
    } else {
      out.push(seg);
    }
  }
  return out.join("/");
}

/**
 * Resolve a markdown link href, relative to the concept it was found in.
 *
 * - http(s):// and mailto: → external (opened in the system browser).
 * - bundle-absolute `/a/b.md` → resolved from the bundle root.
 * - relative `x.md` / `../d/x.md` → resolved from the linking concept's dir.
 * - trailing `#anchor` is stripped; a trailing `.md` is dropped to yield the id.
 *
 * Returns `kind: "concept"` with the resolved id; the caller verifies that id
 * exists in the bundle and renders unknown ids with broken styling. An href
 * that resolves to nothing usable (empty, or escaping the root) is "broken".
 */
export function resolveHref(href: string, fromConceptId: string): ResolvedHref {
  const raw = href.trim();
  if (!raw) return { kind: "broken", href };

  // External schemes and protocol-relative URLs open in the system browser.
  if (/^(https?:|mailto:|tel:)/i.test(raw) || raw.startsWith("//")) {
    return { kind: "external", url: raw };
  }

  // A pure in-page anchor has no concept target.
  if (raw.startsWith("#")) return { kind: "broken", href };

  // Strip any query/fragment; concept targets are file paths, not anchors.
  const path = raw.split("#")[0].split("?")[0];
  if (!path) return { kind: "broken", href };

  // Resolve against the bundle root (absolute) or the linking concept's dir.
  let combined: string;
  if (path.startsWith("/")) {
    combined = path.slice(1);
  } else {
    const dir = dirOf(fromConceptId);
    combined = dir ? `${dir}/${path}` : path;
  }

  const normalized = normalizePath(combined);
  // Escaped the bundle root, or normalized to nothing → unresolvable.
  if (!normalized || normalized.startsWith("..")) {
    return { kind: "broken", href };
  }

  // Drop the conventional .md extension to get the concept id.
  const id = normalized.endsWith(".md") ? normalized.slice(0, -3) : normalized;
  if (!id) return { kind: "broken", href };

  return { kind: "concept", id };
}

/**
 * Resolve a companion-asset href (an ODSF `*.example.html` or a `styles/*.css`
 * it links) to a normalized **bundle-relative path**, keeping the extension —
 * the form `read_asset` expects. Like {@link resolveHref} but for assets, not
 * concepts. Returns null for external/data hrefs or anything escaping the root.
 *
 * `fromId` is the path the href is relative to: a concept id for an `examples`
 * entry or a body link, or an asset's own bundle path when resolving the
 * stylesheets that asset links.
 */
export function resolveAssetHref(href: string, fromId: string): string | null {
  const raw = href.trim();
  if (!raw) return null;
  if (/^(https?:|mailto:|tel:|data:)/i.test(raw) || raw.startsWith("//")) return null;

  const path = raw.split("#")[0].split("?")[0];
  if (!path) return null;

  let combined: string;
  if (path.startsWith("/")) {
    combined = path.slice(1);
  } else {
    const dir = dirOf(fromId);
    combined = dir ? `${dir}/${path}` : path;
  }

  const normalized = normalizePath(combined);
  if (!normalized || normalized.startsWith("..")) return null;
  return normalized;
}
