// Concept Reader: the reading pane. Renders a concept's frontmatter as a
// structured header, its markdown body as sanitized HTML with live
// intra-bundle links, and its relationship lists (links-to / cited-by /
// broken). See docs/features/concept-reader.md.

import type { CSSProperties, MouseEvent } from "react";
import { useActiveConcept, useApp } from "../store.tsx";
import { titleOf, conceptById } from "../selectors.ts";
import { buildTypePalette, resolveDark } from "../theme.ts";
import { renderMarkdown, resolveHref } from "../markdown.ts";
import type { Bundle } from "../types.ts";
import "./Reader.css";

/** True when an id is a real concept in the bundle. */
function conceptExists(bundle: Bundle | null, id: string): boolean {
  return conceptById(bundle, id) !== null;
}

export function Reader() {
  const c = useActiveConcept();
  const { state, actions } = useApp();
  const readerScale = state.settings.readerScale;

  if (!c) {
    return (
      <div className="reader-empty">
        <p>No concept selected.</p>
        <p className="muted">Pick a node in the graph or the sidebar to read it here.</p>
      </div>
    );
  }

  const bundle = state.bundle;
  const palette = buildTypePalette(
    bundle?.concepts.map((x) => x.type) ?? [],
    resolveDark(state.settings.theme),
  );
  const typeColor = palette.color(c.type);

  const bodyHtml = renderMarkdown(c.body);

  // Event delegation: one handler on the rendered container intercepts anchor
  // clicks. We never inject handlers into the sanitized HTML — we only read the
  // clicked anchor's href and decide how to navigate. Concept links that exist
  // in the bundle navigate in-app; external links open in the system browser;
  // unresolved links are inert (they were marked "unresolved" at render time).
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
    // Broken / unresolved concept link: keep it inert so it can't navigate the
    // webview away from the app.
    e.preventDefault();
  }

  // Tag links/anchors inside the body so CSS can dim unresolved ones. We work on
  // the already-sanitized HTML string via the DOM to avoid re-parsing concerns:
  // simplest is to let the click handler resolve, and mark dim ones with a ref
  // callback that walks anchors once mounted.
  function markAnchors(el: HTMLDivElement | null) {
    if (!el) return;
    for (const a of Array.from(el.querySelectorAll("a"))) {
      const href = a.getAttribute("href");
      if (!href) continue;
      const r = resolveHref(href, c!.id);
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
  }

  const hasRels =
    c.links.length > 0 || c.citedBy.length > 0 || c.brokenLinks.length > 0;

  return (
    <article
      className="reader-inner concept-reader"
      // Reader-scoped text-size scale (the native replacement for page-zoom).
      // Reader.css multiplies the body/prose font sizes by this var.
      style={{ "--reader-scale": readerScale } as CSSProperties}
    >
      <header className="reader-header">
        <span className="type-badge" style={{ color: typeColor, borderColor: typeColor }}>
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
      </header>

      <div
        ref={markAnchors}
        className="body markdown"
        onClick={onBodyClick}
        // Sanitized in renderMarkdown via DOMPurify before injection.
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />

      {hasRels && (
        <section className="rels relationships" aria-label="Relationships">
          {c.links.length > 0 && (
            <div className="rel-group">
              <h3>Links to</h3>
              <ul>
                {c.links.map((id) => (
                  <li key={id}>
                    <button
                      type="button"
                      className="rel-link"
                      onClick={() => actions.selectConcept(id)}
                    >
                      {titleOf(bundle, id)}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {c.citedBy.length > 0 && (
            <div className="rel-group">
              <h3>Cited by</h3>
              <ul>
                {c.citedBy.map((id) => (
                  <li key={id}>
                    <button
                      type="button"
                      className="rel-link"
                      onClick={() => actions.selectConcept(id)}
                    >
                      {titleOf(bundle, id)}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {c.brokenLinks.length > 0 && (
            <div className="rel-group">
              <h3>Broken links</h3>
              <ul className="broken-list">
                {c.brokenLinks.map((href) => (
                  <li key={href} className="broken-link" title="Unresolved link">
                    {href}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </article>
  );
}
