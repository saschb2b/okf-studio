// Folder Home — the landing page for a directory's index.md. A bundle's index
// files are never concepts (OKF reserves them), so their authored prose used to
// vanish; this surfaces it. Renders the directory's title, its intro prose (the
// narrative the core keeps after stripping the H1 and the nav link-bullets), and
// its child entries as navigation cards. Reached by selecting a directory in the
// index tree, and the default landing for a freshly opened bundle. The synthetic
// selection id is "index" (root) or "<dir>/index"; see selectors.ts.

import { ChevronRight, Share2 } from "lucide-react";
import { useState, type MouseEvent } from "react";
import { useApp } from "@/shared/store.tsx";
import { conceptById, indexIdForDir } from "@/shared/selectors.ts";
import { renderMarkdown } from "@/shared/render/markdown.ts";
import { buildTokenIndex } from "@/shared/odsf.ts";
import { buildTypePalette, resolveDark } from "@/shared/theme.ts";
import { classifyBodyLinks, classifyLink } from "@/features/reader/components/Reader.tsx";
import { MetadataInspector } from "@/features/reader/components/MetadataInspector.tsx";
import { AdvisoryProfiles } from "./AdvisoryProfiles.tsx";
import { IgnoreRules } from "./IgnoreRules.tsx";
import { InteroperabilityLab } from "./InteroperabilityLab.tsx";
import { RecipientProjectionDialog } from "./RecipientProjectionDialog.tsx";
import type { IndexEntry, IndexNode } from "@/shared/types.ts";
import "./FolderHome.css";

/** Humanize a path segment for the breadcrumb (e.g. "data-model" → "Data Model"). */
function humanize(seg: string): string {
  return seg.replace(/[-_]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

export function FolderHome({ node }: { node: IndexNode }) {
  const { state, actions } = useApp();
  const [projectionOpen, setProjectionOpen] = useState(false);
  const bundle = state.bundle;
  const dark = resolveDark(state.settings.theme);
  const palette = buildTypePalette(bundle?.concepts.map((c) => c.type) ?? [], dark);

  // Resolve the intro's markdown, routing its links against this folder's own
  // position (fromId = the folder-home id) so relative hrefs anchor correctly.
  const fromId = indexIdForDir(node.dir);
  const tokenIndex = buildTokenIndex(bundle);
  const introHtml = node.intro
    ? classifyBodyLinks(renderMarkdown(node.intro, tokenIndex), fromId, bundle)
    : "";

  // The directory path as breadcrumb segments; each opens that ancestor's home.
  const segments = node.dir ? node.dir.split("/") : [];

  /** Open a child entry: a concept selects it; a directory opens its home. */
  function openEntry(entry: IndexEntry, e?: MouseEvent<HTMLElement>) {
    const id = entry.kind === "directory" ? indexIdForDir(entry.target) : entry.target;
    if (e && (e.ctrlKey || e.metaKey)) {
      actions.openInNewTab(id, { background: !e.shiftKey });
    } else {
      actions.selectConcept(id);
    }
  }

  // Route intro-body link clicks like the reader does: concepts select, section
  // links open that folder's home, external links go to the OS browser.
  function onIntroClick(e: MouseEvent<HTMLDivElement>) {
    const anchor = (e.target as HTMLElement).closest("a");
    const href = anchor?.getAttribute("href");
    if (!href) return;
    const link = classifyLink(href, fromId, bundle);
    if (link.kind === "unresolved" || link.kind === "asset") return;
    e.preventDefault();
    if (link.kind === "external") actions.openExternal(link.url);
    else if (link.kind === "concept") actions.selectConcept(link.id);
    else if (link.kind === "directory") actions.selectConcept(indexIdForDir(link.dir));
    // "anchor" has no target within a home; ignore.
  }

  return (
    <article className="folder-home" aria-label={`${node.title} folder home`}>
      <header className="fh-header">
        <nav className="fh-crumbs" aria-label="Breadcrumb">
          <button
            type="button"
            className="fh-crumb"
            onClick={() => actions.selectConcept(indexIdForDir(""))}
          >
            {bundle?.name ?? "Home"}
          </button>
          {segments.map((seg, i) => (
            <button
              key={i}
              type="button"
              className="fh-crumb"
              onClick={() =>
                actions.selectConcept(indexIdForDir(segments.slice(0, i + 1).join("/")))
              }
            >
              {humanize(seg)}
            </button>
          ))}
        </nav>
        <div className="fh-title-row">
          <h1 className="fh-title">
            {node.title}
            {node.synthesized && (
              <span className="fh-synth" title="No index.md in this folder; this listing is synthesized">
                auto
              </span>
            )}
          </h1>
          {node.dir === "" && bundle ? (
            <button
              type="button"
              className="btn ghost fh-project"
              onClick={() => setProjectionOpen(true)}
            >
              <Share2 size={15} />
              Project bundle
            </button>
          ) : null}
        </div>
      </header>

      {node.dir === "" && bundle ? (
        <RecipientProjectionDialog
          open={projectionOpen}
          bundle={bundle}
          onOpenChange={setProjectionOpen}
        />
      ) : null}

      {introHtml && (
        // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- delegated routing for in-body <a>s, which are natively keyboard-accessible
        <div
          className="fh-intro markdown"
          onClick={onIntroClick}
          dangerouslySetInnerHTML={{ __html: introHtml }}
        />
      )}

      {node.dir === "" && bundle ? (
        <>
          {Object.hasOwn(bundle.extra, "profiles") ? (
            <AdvisoryProfiles
              bundleRoot={bundle.root}
              onOpenConcept={(conceptId) => actions.selectConcept(conceptId)}
              onReviewMigration={(diagnostic, focusId) => {
                actions.openOkfTaskLauncher({
                  kind: "profile-finding",
                  id: `${diagnostic.namespace}:${diagnostic.ruleId}:${diagnostic.file}`,
                  title: diagnostic.message,
                  conceptId: diagnostic.conceptId,
                  diagnostic,
                }, {
                  preferredTaskId: "okf-migrate",
                  returnFocusId: focusId,
                });
              }}
            />
          ) : null}
          <IgnoreRules bundleRoot={bundle.root} />
          <InteroperabilityLab
            key={bundle.root}
            bundleRoot={bundle.root}
            onOpenConcept={(conceptId) => actions.selectConcept(conceptId)}
            onReviewExternal={(url) => actions.setRemoteOpen(true, url)}
          />
          <div className="fh-metadata">
            <MetadataInspector
              title="Bundle metadata"
              source="index.md"
              values={bundle.extra}
            />
          </div>
        </>
      ) : null}

      {node.sections.length > 0 ? (
        node.sections.map((sec, si) => (
          <section className="fh-section" key={si}>
            {sec.heading && <h2 className="fh-section-title">{sec.heading}</h2>}
            <ul className="fh-list">
              {sec.entries.map((entry, ei) => {
                const isDir = entry.kind === "directory";
                const concept = isDir ? null : conceptById(bundle, entry.target);
                // The index entry's own description wins; fall back to the
                // concept's when the entry left it blank.
                const desc =
                  entry.description !== "" ? entry.description : (concept?.description ?? "");
                return (
                  <li key={ei}>
                    <button
                      type="button"
                      className={`fh-row${isDir ? " is-dir" : ""}`}
                      onClick={(e) => openEntry(entry, e)}
                    >
                      <span className="fh-mark" aria-hidden="true">
                        {isDir ? (
                          <ChevronRight size={15} />
                        ) : (
                          <span
                            className="fh-dot"
                            style={{ background: palette.color(concept?.type ?? "") }}
                          />
                        )}
                      </span>
                      <span className="fh-row-text">
                        <span className="fh-row-title">{entry.title}</span>
                        {desc && <span className="fh-row-desc">{desc}</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      ) : (
        <p className="fh-empty muted">This folder holds no concepts.</p>
      )}
    </article>
  );
}
