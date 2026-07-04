// Lineage panel — traces relationships far from the active concept, the third
// deep-diving step. A right-docked, non-modal peer panel (like Validation): for
// the selected concept it shows what depends on it and what it depends on
// (transitive, cycle-safe trees), a shortest path to any other concept, and
// unlinked mentions (titles named in its text but not linked). Every row selects
// its concept. See docs/proposals/lineage-and-traversal.md.

import { useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { ScrollArea } from "@base-ui/react/scroll-area";
import { useApp, useActiveConcept } from "../store.tsx";
import { distinctTypes, conceptById } from "../selectors.ts";
import { buildTypePalette, resolveDark } from "../theme.ts";
import {
  lineageTree,
  lineageSize,
  pathBetween,
  unlinkedMentions,
  type LineageNode,
} from "../lineage.ts";
import type { Bundle } from "../types.ts";
import "./chrome.css";
import "./baseui.css";
import "./LineagePanel.css";

type Palette = ReturnType<typeof buildTypePalette>;

function Dot({ type, palette }: { type: string; palette: Palette }) {
  return <span className="ln-dot" style={{ background: palette.color(type) }} aria-hidden="true" />;
}

/** A leaf row for an id (path steps, mentions), resolving title/type from the bundle. */
function RefRow({
  id,
  bundle,
  palette,
  onSelect,
}: {
  id: string;
  bundle: Bundle | null;
  palette: Palette;
  onSelect: (id: string) => void;
}) {
  const c = conceptById(bundle, id);
  return (
    <button type="button" className="ln-row" onClick={() => onSelect(id)}>
      <Dot type={c?.type ?? ""} palette={palette} />
      <span className="ln-row-title">{c?.title ?? id}</span>
    </button>
  );
}

function TreeNode({
  node,
  palette,
  onSelect,
}: {
  node: LineageNode;
  palette: Palette;
  onSelect: (id: string) => void;
}) {
  return (
    <li>
      <button type="button" className="ln-row" onClick={() => onSelect(node.id)}>
        <Dot type={node.type} palette={palette} />
        <span className="ln-row-title">{node.title}</span>
        {node.truncated && <span className="ln-trunc muted" title="More beyond here">…</span>}
      </button>
      {node.children.length > 0 && (
        <ul className="ln-tree">
          {node.children.map((ch) => (
            <TreeNode key={ch.id} node={ch} palette={palette} onSelect={onSelect} />
          ))}
        </ul>
      )}
    </li>
  );
}

function TreeSection({
  title,
  node,
  palette,
  onSelect,
}: {
  title: string;
  node: LineageNode | null;
  palette: Palette;
  onSelect: (id: string) => void;
}) {
  const children = node?.children ?? [];
  const count = node ? lineageSize(node) - 1 : 0; // exclude the root concept
  return (
    <section className="ln-section">
      <h3 className="ln-head">
        {title}
        {count > 0 && <span className="ln-count">{count}</span>}
      </h3>
      {children.length ? (
        <ul className="ln-tree ln-tree-root">
          {children.map((ch) => (
            <TreeNode key={ch.id} node={ch} palette={palette} onSelect={onSelect} />
          ))}
        </ul>
      ) : (
        <p className="ln-none muted">None.</p>
      )}
    </section>
  );
}

export function LineagePanel() {
  const { state, actions } = useApp();
  const active = useActiveConcept();
  const [target, setTarget] = useState("");
  const bundle = state.bundle;

  const palette = buildTypePalette(distinctTypes(bundle), resolveDark(state.settings.theme));
  const select = (id: string) => actions.selectConcept(id);

  const upstream = lineageTree(bundle, active?.id ?? null, "up");
  const downstream = lineageTree(bundle, active?.id ?? null, "down");
  const mentions = active ? unlinkedMentions(bundle, active) : [];
  const path = active && target ? pathBetween(bundle, active.id, target) : null;
  const others =
    bundle && active
      ? bundle.concepts
          .filter((c) => c.id !== active.id)
          .sort((a, b) => a.title.localeCompare(b.title))
      : [];

  return (
    <Dialog.Root
      modal={false}
      open={state.panels.lineage}
      onOpenChange={(open) => actions.togglePanel("lineage", open)}
      disablePointerDismissal
    >
      <Dialog.Portal>
        <Dialog.Popup className="panel lineage" aria-label="Lineage">
          <header className="panel-head">
            <Dialog.Title render={<b />}>Lineage</Dialog.Title>
            <Dialog.Close className="btn ghost icon" aria-label="Close lineage panel">
              <span aria-hidden="true">×</span>
            </Dialog.Close>
          </header>

          {!active ? (
            <p className="ln-empty muted">
              Select a concept to trace what depends on it, what it depends on, and
              how it connects to anything else.
            </p>
          ) : (
            <ScrollArea.Root className="ui-scrollarea ln-scroll">
              <ScrollArea.Viewport className="ui-scrollarea-viewport">
                <div className="ln-body">
                  <p className="ln-context">
                    Tracing <strong>{active.title}</strong>
                  </p>

                  <TreeSection
                    title="What depends on this"
                    node={downstream}
                    palette={palette}
                    onSelect={select}
                  />
                  <TreeSection
                    title="What this depends on"
                    node={upstream}
                    palette={palette}
                    onSelect={select}
                  />

                  <section className="ln-section">
                    <h3 className="ln-head">Trace a path to…</h3>
                    <select
                      className="ln-select"
                      value={target}
                      onChange={(e) => setTarget(e.target.value)}
                      aria-label="Path target concept"
                    >
                      <option value="">Choose a concept…</option>
                      {others.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title}
                        </option>
                      ))}
                    </select>
                    {target &&
                      (path && path.length > 1 ? (
                        <ol className="ln-path">
                          {path.map((id) => (
                            <li key={id}>
                              <RefRow id={id} bundle={bundle} palette={palette} onSelect={select} />
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p className="ln-none muted">No path connects these two.</p>
                      ))}
                  </section>

                  <section className="ln-section">
                    <h3 className="ln-head">
                      Unlinked mentions
                      {mentions.length > 0 && <span className="ln-count">{mentions.length}</span>}
                    </h3>
                    {mentions.length ? (
                      <ul className="ln-list">
                        {mentions.map((id) => (
                          <li key={id}>
                            <RefRow id={id} bundle={bundle} palette={palette} onSelect={select} />
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="ln-none muted">
                        None — every concept named in the text is already linked.
                      </p>
                    )}
                  </section>
                </div>
              </ScrollArea.Viewport>
              <ScrollArea.Scrollbar className="ui-scrollarea-scrollbar" orientation="vertical">
                <ScrollArea.Thumb className="ui-scrollarea-thumb" />
              </ScrollArea.Scrollbar>
            </ScrollArea.Root>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
