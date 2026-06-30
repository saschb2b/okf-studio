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
import { buildTokenIndex, conceptAppliesTo, conceptStatus } from "../odsf.ts";
import { ReaderPrefs } from "./ReaderPrefs.tsx";
import { TokenViz } from "./TokenViz.tsx";
import { ExamplePreview } from "./ExamplePreview.tsx";
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

  // Bundle-wide design-token index (empty for a plain OKF bundle); drives both
  // the body's `{ref}` resolution and the TokenViz below.
  const tokenIndex = buildTokenIndex(bundle);
  const bodyHtml = c ? renderMarkdown(c.body, tokenIndex) : "";

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
      } else if (/\.(html|css|svg)(#|$)/i.test(href)) {
        // A companion asset (an ODSF example/stylesheet) — not a broken concept
        // link; it renders as a live preview, so point the reader at it.
        a.dataset.link = "asset";
        a.setAttribute("title", "Jump to the rendered example");
      } else {
        a.dataset.link = "unresolved";
        a.setAttribute("aria-disabled", "true");
        a.setAttribute("title", "Unresolved link");
      }
    }

    const heads = Array.from(el.querySelectorAll("h2, h3"));
    const items: OutlineItem[] = heads.map((h) => {
      // Idempotent across StrictMode's double-invoke (and re-runs): drop any
      // anchor we appended on a prior pass before reading the heading text.
      h.querySelector(".heading-anchor")?.remove();
      const id = h.id; // baked into the HTML by renderMarkdown
      const text = h.textContent;
      // A hover permalink that scrolls to the section (never navigates the view).
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
      return { id, text, level: h.tagName === "H2" ? 2 : 3 };
    });
    setOutline(items);
    setActiveId(items[0]?.id ?? null);

    // A copy affordance on each fenced code block.
    for (const pre of Array.from(el.querySelectorAll("pre"))) {
      if (pre.querySelector(".code-copy")) continue;
      const text = pre.querySelector("code")?.textContent ?? pre.textContent;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "code-copy";
      btn.textContent = "Copy";
      btn.setAttribute("aria-label", "Copy code");
      btn.addEventListener("click", () => {
        // clipboard is undefined in insecure contexts despite the DOM lib type.
        const clipboard = navigator.clipboard as Clipboard | undefined;
        if (!clipboard) return;
        void clipboard.writeText(text).then(() => {
          btn.textContent = "Copied";
          window.setTimeout(() => {
            btn.textContent = "Copy";
          }, 1200);
        });
      });
      pre.appendChild(btn);
    }

    if (heads.length === 0) return;
    // Scroll-spy: highlight the section currently being read. A scroll handler
    // (rather than an IntersectionObserver "top band") so it stays correct at
    // the bottom of the page — short trailing sections can never scroll up into
    // a band, so there we force-activate the last heading instead.
    const scroller = el.closest(".pane");
    if (!scroller) return;
    let raf = 0;
    const sync = () => {
      raf = 0;
      // Query the *live* headings each time and map by index to the outline
      // `items`. The heading nodes captured above can be replaced after this
      // effect runs (React re-applies the dangerouslySetInnerHTML body), leaving
      // the captured nodes detached (zero rects) and the live ones without ids —
      // so we read positions from the live DOM but ids from `items`, which the
      // rail actually renders with. Index alignment holds: both are the h2/h3
      // sequence in document order.
      const live = scroller.querySelectorAll<HTMLElement>(
        ".body.markdown h2, .body.markdown h3",
      );
      if (live.length === 0 || live.length !== items.length) return;
      // Not scrollable (short doc, or jsdom) → keep the first heading active.
      if (scroller.scrollHeight <= scroller.clientHeight) return;
      // At the bottom, the last sections can't reach the top — activate the last.
      if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4) {
        setActiveId(items[items.length - 1].id);
        return;
      }
      // Otherwise: the last heading scrolled above a line just below the top.
      const top = scroller.getBoundingClientRect().top;
      let idx = 0;
      for (let i = 0; i < live.length; i++) {
        if (live[i].getBoundingClientRect().top - top <= 96) idx = i;
        else break;
      }
      setActiveId(items[idx].id);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(sync);
    };
    sync();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
    // `c` is tracked via c?.id; the effect only needs to re-run on concept change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  // Design-system (ODSF) extras, feature-detected — null/empty on plain OKF.
  const status = conceptStatus(c);
  const appliesTo = conceptAppliesTo(c);
  // Side rail in reader-only mode; otherwise (split / narrow) it falls below.
  const railSide = state.layout === "reader";
  // Breadcrumb: the concept's directory path (its place in the bundle).
  const crumbs = c.id.includes("/") ? c.id.split("/").slice(0, -1) : [];

  const select = (id: string) => actions.selectConcept(id);

  // Event delegation for body anchor clicks: route concept links in-app,
  // external links to the OS browser, and keep unresolved links inert.
  function onBodyClick(e: MouseEvent<HTMLDivElement>) {
    if (!c) return;
    const anchor = (e.target as HTMLElement).closest("a");
    if (!anchor) return;
    const href = anchor.getAttribute("href");
    if (!href) return;
    const resolved = resolveHref(href, c.id);
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
    // A companion-asset link scrolls to its rendered preview above the body.
    if (anchor.dataset.link === "asset") {
      e.preventDefault();
      bodyRef.current
        ?.closest(".reader-main")
        ?.querySelector(".examples")
        ?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
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
          {/* Top row: breadcrumb at the left, reading-preferences ("Aa") at the
              right — reading options live with the content, not the title bar. */}
          <div className="reader-header-top">
            {crumbs.length > 0 ? (
              <nav className="reader-crumbs" aria-label="Breadcrumb">
                {crumbs.map((seg, i) => (
                  <span key={i} className="crumb">
                    {humanize(seg)}
                  </span>
                ))}
              </nav>
            ) : (
              <span />
            )}
            <ReaderPrefs />
          </div>
          <div className="reader-labels">
            <span
              className="type-badge"
              style={{ color: typeColor, borderColor: typeColor }}
            >
              {c.type}
            </span>
            {status && (
              <span className="status-badge" data-status={status}>
                {status}
              </span>
            )}
            {appliesTo.length > 0 && (
              <span className="applies-badge">{appliesTo.join(" · ")}</span>
            )}
          </div>
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

        {/* Design-token visualizations (ODSF): swatches, specimens, scales —
            renders nothing for a concept without tokens. */}
        <TokenViz concept={c} index={tokenIndex} />

        {/* Live previews of the concept's example assets (ODSF) — renders
            nothing for a concept without example HTML. Keyed by id so each
            concept mounts fresh (no stale-preview flash on navigation). */}
        <ExamplePreview key={c.id} concept={c} bundle={bundle} />

        {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- delegated routing for in-body <a>s, which are natively keyboard-accessible (Enter fires a bubbling click) */}
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
                    onClick={() => {
                      if (c.resource) actions.openExternal(c.resource);
                    }}
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
