// Concept Reader: a reading-first pane. A centered, measure-capped prose column
// (frontmatter header + sanitized markdown body with live intra-bundle links)
// beside a quiet right context rail — On this page (scroll-spy outline), Cited
// by, Links to, Related by tag, Details, Broken links. The rail sits to the
// side in reader-only mode and falls below the article when space is tight (the
// split layout, or a narrow pane). See docs/features/concept-reader.md.

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { useActiveConcept, useApp } from "../store.tsx";
import { titleOf, conceptById } from "../selectors.ts";
import { buildTypePalette, resolveDark } from "../theme.ts";
import { renderMarkdown, resolveHref } from "../markdown.ts";
import type { Bundle, Concept } from "../types.ts";
import "./Reader.css";

interface OutlineItem {
  id: string;
  text: string;
  level: number;
}

/** True when an id is a real concept in the bundle. */
function conceptExists(bundle: Bundle | null, id: string): boolean {
  return conceptById(bundle, id) !== null;
}

/** Humanize a path segment for the breadcrumb (e.g. "data-model" → "Data Model"). */
function humanize(seg: string): string {
  return seg.replace(/[-_]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

/** A url-safe slug for a heading's text, used as its anchor id. */
function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "section"
  );
}

/** Concepts sharing a tag with `c`, excluding itself and its direct relations. */
function relatedByTag(bundle: Bundle | null, c: Concept): string[] {
  if (!bundle || c.tags.length === 0) return [];
  const exclude = new Set([c.id, ...c.links, ...c.citedBy]);
  const tags = new Set(c.tags);
  const out: string[] = [];
  for (const other of bundle.concepts) {
    if (exclude.has(other.id)) continue;
    if (other.tags.some((t) => tags.has(t))) out.push(other.id);
    if (out.length >= 6) break;
  }
  return out;
}

export function Reader() {
  const c = useActiveConcept();
  const { state, actions } = useApp();
  const bundle = state.bundle;
  const readerScale = state.settings.readerScale;
  const reduceMotion = state.settings.reduceMotion;

  const bodyRef = useRef<HTMLDivElement>(null);
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const bodyHtml = c ? renderMarkdown(c.body) : "";

  // After the body renders: tag anchors for link routing/styling, assign stable
  // heading ids, build the outline, and wire scroll-spy to the scrolling pane.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el || !c) {
      setOutline([]);
      return;
    }

    for (const a of Array.from(el.querySelectorAll("a"))) {
      const href = a.getAttribute("href");
      if (!href) continue;
      const r = resolveHref(href, c.id);
      if (r.kind === "external") {
        a.dataset.link = "external";
        a.setAttribute("rel", "noopener noreferrer");
      } else if (r.kind === "concept" && conceptExists(bundle, r.id)) {
        a.dataset.link = "concept";
      } else {
        a.dataset.link = "unresolved";
        a.setAttribute("aria-disabled", "true");
        a.setAttribute("title", "Unresolved link");
      }
    }

    const heads = Array.from(el.querySelectorAll("h2, h3")) as HTMLElement[];
    const used = new Set<string>();
    const items: OutlineItem[] = heads.map((h) => {
      // Idempotent across StrictMode's double-invoke (and re-runs): drop any
      // anchor we appended on a prior pass before reading the heading text.
      h.querySelector(".heading-anchor")?.remove();
      const text = h.textContent || "";
      const base = slugify(text);
      let id = base;
      let n = 2;
      while (used.has(id)) id = `${base}-${n++}`;
      used.add(id);
      h.id = id;
      // A hover permalink that scrolls to the section (never navigates the view).
      if (!h.querySelector(".heading-anchor")) {
        const a = document.createElement("a");
        a.className = "heading-anchor";
        a.href = `#${id}`;
        a.textContent = "#";
        a.setAttribute("aria-label", `Link to section: ${text}`);
        a.addEventListener("click", (ev) => {
          ev.preventDefault();
          h.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
        });
        h.appendChild(a);
      }
      return { id, text, level: h.tagName === "H2" ? 2 : 3 };
    });
    setOutline(items);
    setActiveId(items[0]?.id ?? null);

    // A copy affordance on each fenced code block.
    for (const pre of Array.from(el.querySelectorAll("pre"))) {
      if (pre.querySelector(".code-copy")) continue;
      const text = pre.querySelector("code")?.textContent ?? pre.textContent ?? "";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "code-copy";
      btn.textContent = "Copy";
      btn.setAttribute("aria-label", "Copy code");
      btn.addEventListener("click", () => {
        if (!navigator.clipboard) return;
        void navigator.clipboard.writeText(text).then(() => {
          btn.textContent = "Copied";
          window.setTimeout(() => {
            btn.textContent = "Copy";
          }, 1200);
        });
      });
      pre.appendChild(btn);
    }

    if (heads.length === 0 || typeof IntersectionObserver === "undefined") return;
    const root = el.closest(".pane") as HTMLElement | null;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActiveId((e.target as HTMLElement).id);
        }
      },
      { root, rootMargin: "0px 0px -70% 0px", threshold: 0 },
    );
    heads.forEach((h) => obs.observe(h));
    return () => obs.disconnect();
  }, [c?.id, bodyHtml, bundle, reduceMotion]);

  if (!c) {
    return (
      <div className="reader-empty">
        <p>No concept selected.</p>
        <p className="muted">Pick a node in the graph or the sidebar to read it here.</p>
      </div>
    );
  }

  const palette = buildTypePalette(
    bundle?.concepts.map((x) => x.type) ?? [],
    resolveDark(state.settings.theme),
  );
  const typeColor = palette.color(c.type);
  const related = relatedByTag(bundle, c);
  // Side rail in reader-only mode; otherwise (split / narrow) it falls below.
  const railSide = state.layout === "reader";
  // Breadcrumb: the concept's directory path (its place in the bundle).
  const crumbs = c.id.includes("/") ? c.id.split("/").slice(0, -1) : [];

  const select = (id: string) => actions.selectConcept(id);

  // Event delegation for body anchor clicks: route concept links in-app,
  // external links to the OS browser, and keep unresolved links inert.
  function onBodyClick(e: MouseEvent<HTMLDivElement>) {
    const anchor = (e.target as HTMLElement).closest("a");
    if (!anchor) return;
    const href = anchor.getAttribute("href");
    if (!href) return;
    const resolved = resolveHref(href, c!.id);
    if (resolved.kind === "external") {
      e.preventDefault();
      actions.openExternal(resolved.url);
      return;
    }
    if (resolved.kind === "concept" && conceptExists(bundle, resolved.id)) {
      e.preventDefault();
      actions.selectConcept(resolved.id);
      return;
    }
    e.preventDefault();
  }

  function jumpTo(id: string) {
    const el = bodyRef.current?.querySelector(`#${CSS.escape(id)}`) as HTMLElement | null;
    el?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    setActiveId(id);
  }

  return (
    <div className="reader-shell" data-rail={railSide ? "side" : "below"}>
      <article
        className="reader-main concept-reader"
        // Reader-scoped reading layer (the content-scoped replacement for page
        // zoom), driven by the "Aa" preferences and persisted in settings.
        data-aids={state.settings.readerAids ? "on" : undefined}
        style={
          {
            "--reader-scale": readerScale,
            "--reader-measure": `${state.settings.readerMeasure}ch`,
            "--reader-leading": state.settings.readerLeading,
            "--reader-font":
              state.settings.readerFont === "serif" ? "var(--serif)" : "var(--ui)",
          } as CSSProperties
        }
      >
        <header className="reader-header">
          {crumbs.length > 0 && (
            <nav className="reader-crumbs" aria-label="Breadcrumb">
              {crumbs.map((seg, i) => (
                <span key={i} className="crumb">
                  {humanize(seg)}
                </span>
              ))}
            </nav>
          )}
          <span
            className="type-badge"
            style={{ color: typeColor, borderColor: typeColor }}
          >
            {c.type}
          </span>
          <h1>{c.title}</h1>
          {c.description && <p className="desc">{c.description}</p>}

          {c.tags.length > 0 && (
            <ul className="tag-chips" aria-label="Tags">
              {c.tags.map((t) => (
                <li key={t} className="tag-chip">
                  {t}
                </li>
              ))}
            </ul>
          )}
        </header>

        <div
          ref={bodyRef}
          className="body markdown"
          onClick={onBodyClick}
          // Sanitized in renderMarkdown via DOMPurify before injection.
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />
      </article>

      <aside className="reader-rail" aria-label="Concept context">
        {outline.length > 1 && (
          <nav className="rail-module rail-outline" aria-label="On this page">
            <h3 className="rail-title">On this page</h3>
            <ul className="outline-list">
              {outline.map((o) => (
                <li
                  key={o.id}
                  className={`outline-item lvl-${o.level}${
                    activeId === o.id ? " is-active" : ""
                  }`}
                >
                  <button
                    type="button"
                    className="outline-link"
                    onClick={() => jumpTo(o.id)}
                  >
                    {o.text}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}

        {c.citedBy.length > 0 && (
          <RailModule title="Cited by" count={c.citedBy.length}>
            <RelRows bundle={bundle} ids={c.citedBy} onSelect={select} />
          </RailModule>
        )}

        {c.links.length > 0 && (
          <RailModule title="Links to" count={c.links.length}>
            <RelRows bundle={bundle} ids={c.links} onSelect={select} />
          </RailModule>
        )}

        {related.length > 0 && (
          <RailModule title="Related" count={related.length}>
            <RelRows bundle={bundle} ids={related} onSelect={select} />
          </RailModule>
        )}

        <RailModule title="Details">
          <dl className="reader-meta">
            {c.timestamp && (
              <div className="meta-row">
                <dt>Updated</dt>
                <dd>
                  <time dateTime={c.timestamp}>{c.timestamp}</time>
                </dd>
              </div>
            )}
            {c.resource && (
              <div className="meta-row">
                <dt>Resource</dt>
                <dd>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => actions.openExternal(c.resource!)}
                  >
                    {c.resource}
                  </button>
                </dd>
              </div>
            )}
            <div className="meta-row">
              <dt>Concept ID</dt>
              <dd>
                <code className="concept-id">{c.id}</code>
              </dd>
            </div>
          </dl>
        </RailModule>

        {c.brokenLinks.length > 0 && (
          <RailModule title="Broken links" count={c.brokenLinks.length}>
            <ul className="broken-list">
              {c.brokenLinks.map((href) => (
                <li key={href} className="broken-link" title="Unresolved link">
                  {href}
                </li>
              ))}
            </ul>
          </RailModule>
        )}
      </aside>
    </div>
  );
}

/** A titled context module in the rail, with an optional count badge. */
function RailModule({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section className="rail-module">
      <h3 className="rail-title">
        {title}
        {count != null && <span className="rail-count">{count}</span>}
      </h3>
      {children}
    </section>
  );
}

/** A list of concept rows that navigate on click. */
function RelRows({
  bundle,
  ids,
  onSelect,
}: {
  bundle: Bundle | null;
  ids: string[];
  onSelect: (id: string) => void;
}) {
  return (
    <ul className="rel-list">
      {ids.map((id) => (
        <li key={id}>
          <button type="button" className="rel-link" onClick={() => onSelect(id)}>
            {titleOf(bundle, id)}
          </button>
        </li>
      ))}
    </ul>
  );
}
