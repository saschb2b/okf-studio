import { Dialog } from "@base-ui/react/dialog";
import { ScrollArea } from "@base-ui/react/scroll-area";
import { X } from "lucide-react";
import { useState } from "react";
import {
  explainedPathBetween,
  lineageSize,
  lineageTree,
  profileRelationFilterKey,
  unlinkedMentions,
} from "@/features/reader/lineage.ts";
import type {
  ExplainedLineageStep,
  LineageDirection,
  LineageNode,
  LineageRelation,
  LineageValidity,
} from "@/features/reader/lineage.ts";
import { conceptById, distinctTypes } from "@/shared/selectors.ts";
import { useActiveConcept, useApp } from "@/shared/store.tsx";
import { buildTypePalette, resolveDark } from "@/shared/theme.ts";
import type { Bundle } from "@/shared/types.ts";
import { useProfileReport } from "@/shared/useProfileReport.ts";
import "@/shared/styles/baseui.css";
import "@/shared/styles/chrome.css";
import "./LineagePanel.css";

const SESSION_DAY = new Date().toISOString().slice(0, 10);
type Palette = ReturnType<typeof buildTypePalette>;

function Dot({ type, palette }: { type: string; palette: Palette }) {
  return <span className="ln-dot" style={{ background: palette.color(type) }} aria-hidden="true" />;
}

function stateLabel(state: LineageNode["state"]): string {
  return {
    current: "Current",
    uncertain: "Uncertain",
    contradicted: "Contradicted",
    "review-overdue": "Review overdue",
    "not-yet-effective": "Not yet effective",
    expired: "Outside effective period",
    deprecated: "Deprecated",
    superseded: "Superseded",
    retired: "Retired",
    missing: "Missing target",
  }[state];
}

function relationLabel(relations: readonly LineageRelation[], direction: "up" | "down"): string {
  const labels = relations.map((relation) =>
    direction === "down" ? relation.inverse ?? relation.label : relation.label
  );
  if (labels.length === 0) return direction === "up" ? "Links to" : "Cited by";
  return [...new Set(labels)].join(" · ");
}

function truncationText(node: LineageNode): string | null {
  if (!node.truncated) return null;
  const omitted = node.omitted ?? 0;
  const suffix = omitted > 0 ? ` ${omitted} relationship${omitted === 1 ? "" : "s"} omitted.` : "";
  if (node.truncationReason === "hub") return `Hub limit reached.${suffix}`;
  if (node.truncationReason === "budget") return `Traversal budget reached.${suffix}`;
  return `Depth limit reached.${suffix}`;
}

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
  const concept = conceptById(bundle, id);
  return (
    <button type="button" className="ln-row" onClick={() => onSelect(id)}>
      <Dot type={concept?.type ?? ""} palette={palette} />
      <span className="ln-row-title">{concept?.title ?? id}</span>
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
  const limit = truncationText(node);
  const direction = node.direction ?? "up";
  return (
    <li>
      <button
        type="button"
        className="ln-row ln-row--lineage"
        disabled={node.state === "missing"}
        onClick={() => onSelect(node.id)}
      >
        <Dot type={node.type} palette={palette} />
        <span className="ln-row-copy">
          <span className="ln-row-title">{node.title}</span>
          <span className="ln-row-meta">
            {relationLabel(node.relations, direction)}
            {" · "}
            <span data-state={node.state}>{stateLabel(node.state)}</span>
          </span>
        </span>
        {node.reference === "cycle" ? (
          <span className="ln-state-flag" title="This relationship returns to an earlier path step">
            Cycle
          </span>
        ) : null}
        {node.reference === "seen" ? (
          <span className="ln-state-flag" title="This concept is expanded elsewhere in the tree">
            Shown
          </span>
        ) : null}
      </button>
      {node.children.length > 0 ? (
        <ul className="ln-tree">
          {node.children.map((child, index) => (
            <TreeNode
              key={`${child.id}:${child.direction ?? ""}:${index}`}
              node={child}
              palette={palette}
              onSelect={onSelect}
            />
          ))}
        </ul>
      ) : null}
      {limit ? <p className="ln-limit">{limit}</p> : null}
    </li>
  );
}

function TreeSection({
  title,
  description,
  node,
  palette,
  onSelect,
}: {
  title: string;
  description: string;
  node: LineageNode | null;
  palette: Palette;
  onSelect: (id: string) => void;
}) {
  const children = node?.children ?? [];
  const count = node ? lineageSize(node) - 1 : 0;
  const rootLimit = node ? truncationText(node) : null;
  return (
    <section className="ln-section">
      <div>
        <h3 className="ln-head">
          {title}
          {count > 0 ? <span className="ln-count">{count}</span> : null}
        </h3>
        <p className="ln-section-description">{description}</p>
      </div>
      {children.length > 0 ? (
        <ul className="ln-tree ln-tree-root">
          {children.map((child, index) => (
            <TreeNode
              key={`${child.id}:${child.direction ?? ""}:${index}`}
              node={child}
              palette={palette}
              onSelect={onSelect}
            />
          ))}
        </ul>
      ) : (
        <p className="ln-none muted">No relationships match the current filters.</p>
      )}
      {rootLimit ? <p className="ln-limit">{rootLimit}</p> : null}
    </section>
  );
}

function pathStepLabel(step: ExplainedLineageStep): string {
  const label = relationLabel(step.relations, step.direction);
  return step.direction === "up" ? `Outgoing · ${label}` : `Incoming · ${label}`;
}

export function LineagePanel() {
  const { state, actions } = useApp();
  const active = useActiveConcept();
  const [target, setTarget] = useState("");
  const [direction, setDirection] = useState<LineageDirection>("both");
  const [relation, setRelation] = useState("all");
  const [validity, setValidity] = useState<LineageValidity>("all");
  const bundle = state.bundle;
  const profile = useProfileReport(bundle);
  const report = profile.status === "ready" ? profile.report : null;

  const relationOptions = report
    ? [...new Map(report.edges.map((edge) => [
        profileRelationFilterKey(edge),
        {
          value: profileRelationFilterKey(edge),
          label: edge.recognized
            ? edge.label
            : `${edge.label} · ${edge.namespace} (unknown)`,
        },
      ])).values()].sort((left, right) => left.label.localeCompare(right.label))
    : [];
  const effectiveRelation = relation === "all"
    || relation === "portable"
    || relationOptions.some((option) => option.value === relation)
    ? relation
    : "all";
  const effectiveTarget = active
    && bundle?.concepts.some((concept) => concept.id === target && concept.id !== active.id)
    ? target
    : "";
  const traversalOptions = {
    report,
    relation: effectiveRelation,
    validity,
    asOfDay: SESSION_DAY,
  };
  const palette = buildTypePalette(distinctTypes(bundle), resolveDark(state.settings.theme));
  const select = (id: string) => actions.selectConcept(id);
  const upstream = direction === "down"
    ? null
    : lineageTree(bundle, active?.id ?? null, "up", undefined, traversalOptions);
  const downstream = direction === "up"
    ? null
    : lineageTree(bundle, active?.id ?? null, "down", undefined, traversalOptions);
  const mentions = active ? unlinkedMentions(bundle, active) : [];
  const path = active && effectiveTarget
    ? explainedPathBetween(
        bundle,
        active.id,
        effectiveTarget,
        direction,
        traversalOptions,
      )
    : null;
  const others = bundle && active
    ? bundle.concepts
        .filter((concept) => concept.id !== active.id)
        .sort((left, right) => left.title.localeCompare(right.title))
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
              <X size={16} aria-hidden="true" />
            </Dialog.Close>
          </header>

          {!active ? (
            <p className="ln-empty muted">
              Select a concept to trace its dependencies, impact, and path to other knowledge.
            </p>
          ) : (
            <ScrollArea.Root className="ui-scrollarea ln-scroll">
              <ScrollArea.Viewport className="ui-scrollarea-viewport">
                <div className="ln-body">
                  <div className="ln-context">
                    <span>Tracing</span>
                    <strong>{active.title}</strong>
                  </div>

                  <section className="ln-controls" aria-label="Lineage filters">
                    <fieldset>
                      <legend>Direction</legend>
                      <div className="ln-segmented">
                        {([
                          ["both", "Both"],
                          ["up", "Upstream"],
                          ["down", "Downstream"],
                        ] as const).map(([value, label]) => (
                          <label key={value}>
                            <input
                              type="radio"
                              name="lineage-direction"
                              value={value}
                              checked={direction === value}
                              onChange={() => setDirection(value)}
                            />
                            <span>{label}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <label>
                      <span>Relationship</span>
                      <select
                        value={effectiveRelation}
                        onChange={(event) => setRelation(event.target.value)}
                      >
                        <option value="all">All relationships</option>
                        <option value="portable">Portable links</option>
                        {relationOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Reliability</span>
                      <select
                        value={validity}
                        onChange={(event) => setValidity(event.target.value as LineageValidity)}
                      >
                        <option value="all">All states</option>
                        <option value="current">Current only</option>
                        <option value="caution">Needs caution</option>
                      </select>
                    </label>
                    {profile.status === "loading" ? (
                      <p className="ln-profile-state">Loading typed relationships…</p>
                    ) : null}
                    {profile.status === "error" ? (
                      <p className="ln-profile-state is-warning">
                        Typed relationships are unavailable. Portable links still work.
                      </p>
                    ) : null}
                  </section>

                  {direction !== "up" ? (
                    <TreeSection
                      title="Downstream impact"
                      description="Concepts that depend on this one."
                      node={downstream}
                      palette={palette}
                      onSelect={select}
                    />
                  ) : null}
                  {direction !== "down" ? (
                    <TreeSection
                      title="Upstream dependencies"
                      description="Concepts this one depends on."
                      node={upstream}
                      palette={palette}
                      onSelect={select}
                    />
                  ) : null}

                  <section className="ln-section">
                    <div>
                      <h3 className="ln-head">Explain a path</h3>
                      <p className="ln-section-description">
                        Uses the direction, relationship, and reliability filters above.
                      </p>
                    </div>
                    <select
                      className="ln-select"
                      value={effectiveTarget}
                      onChange={(event) => setTarget(event.target.value)}
                      aria-label="Path target concept"
                    >
                      <option value="">Choose a concept…</option>
                      {others.map((concept) => (
                        <option key={concept.id} value={concept.id}>
                          {concept.title}
                        </option>
                      ))}
                    </select>
                    {effectiveTarget && path?.ids.length ? (
                      <ol className="ln-path">
                        {path.ids.map((id, index) => (
                          <li key={id}>
                            <RefRow id={id} bundle={bundle} palette={palette} onSelect={select} />
                            {path.steps[index] ? (
                              <p className="ln-path-explanation">
                                {pathStepLabel(path.steps[index])}
                              </p>
                            ) : null}
                          </li>
                        ))}
                      </ol>
                    ) : null}
                    {effectiveTarget && path?.truncated && path.ids.length === 0 ? (
                      <p className="ln-limit">
                        Path search stopped after {path.visited} concepts. Narrow the filters or
                        choose a closer target.
                      </p>
                    ) : null}
                    {effectiveTarget && path === null ? (
                      <p className="ln-none muted">No path matches the current filters.</p>
                    ) : null}
                  </section>

                  <section className="ln-section">
                    <h3 className="ln-head">
                      Unlinked mentions
                      {mentions.length > 0 ? <span className="ln-count">{mentions.length}</span> : null}
                    </h3>
                    {mentions.length > 0 ? (
                      <ul className="ln-list">
                        {mentions.map((id) => (
                          <li key={id}>
                            <RefRow id={id} bundle={bundle} palette={palette} onSelect={select} />
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="ln-none muted">
                        None. Every concept named in the text is already linked.
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
