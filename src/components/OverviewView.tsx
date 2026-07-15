// Bundle Overview & Health — the orientation landing for the open bundle.
// Summarizes what's inside (composition, hubs, loose ends, health, freshness)
// where every number is a *door*: a link that selects the concept, or a type
// chip that filters to it. All derived from the already-parsed bundle — no new
// backend. Takes over the content area when state.overview is on; selecting any
// concept dismisses it (you've oriented, now you dive). See
// docs/proposals/bundle-overview.md.

import type { ReactNode } from "react";
import { useApp } from "@/store.tsx";
import { distinctTypes, orphanIds } from "@/selectors.ts";
import { buildTypePalette, resolveDark } from "@/theme.ts";
import type { Concept } from "@/types.ts";
import "./OverviewView.css";

const HUB_LIMIT = 6;
const ORPHAN_LIMIT = 8;
const BROKEN_LIMIT = 6;
const RECENT_LIMIT = 6;

/** The date portion of an ISO timestamp, for a compact freshness label. */
function day(ts: string | null): string {
  return ts ? ts.slice(0, 10) : "";
}

export function OverviewView() {
  const { state, actions } = useApp();
  const bundle = state.bundle;
  if (!bundle) return null;

  const concepts = bundle.concepts;
  const types = distinctTypes(bundle);
  const dark = resolveDark(state.settings.theme);
  const palette = buildTypePalette(types, dark);
  const dot = (type: string) => (
    <span className="ov-dot" style={{ background: palette.color(type) }} aria-hidden="true" />
  );

  const typeCounts = new Map<string, number>();
  for (const c of concepts) typeCounts.set(c.type, (typeCounts.get(c.type) ?? 0) + 1);
  const maxTypeCount = Math.max(1, ...typeCounts.values());

  const tags = new Set<string>();
  for (const c of concepts) for (const t of c.tags) tags.add(t);

  const hubs = [...concepts]
    .filter((c) => c.degree > 0)
    .sort((a, b) => b.degree - a.degree || a.title.localeCompare(b.title))
    .slice(0, HUB_LIMIT);

  const orphanSet = new Set(orphanIds(bundle));
  const orphans = concepts.filter((c) => orphanSet.has(c.id));

  const broken = concepts.filter((c) => c.brokenLinks.length > 0);
  const brokenTotal = broken.reduce((n, c) => n + c.brokenLinks.length, 0);

  const errors = bundle.issues.filter((i) => i.level === "error").length;
  const warnings = bundle.issues.filter((i) => i.level === "warning").length;

  // ISO timestamps sort lexically = chronologically; treat null as "" (oldest).
  const ts = (c: Concept) => c.timestamp ?? "";
  const dated = concepts.filter((c) => c.timestamp);
  const newest = dated.length
    ? dated.reduce((a, c) => (ts(c) > ts(a) ? c : a))
    : null;
  const recent = [...dated].sort((a, b) => (ts(a) < ts(b) ? 1 : -1)).slice(0, RECENT_LIMIT);

  const open = (id: string) => actions.selectConcept(id);

  return (
    <div className="overview" role="region" aria-label="Bundle overview">
      <header className="ov-head">
        <h1 className="ov-title">{bundle.name}</h1>
        <p className="ov-stats muted">
          <span>{concepts.length} concepts</span>
          <span>{types.length} types</span>
          <span>{tags.size} tags</span>
          {bundle.okfVersion && <span>OKF {bundle.okfVersion}</span>}
          <span>{bundle.confidence === "confident" ? "conformant" : "candidate"}</span>
          {newest && <span>updated {day(newest.timestamp)}</span>}
        </p>
      </header>

      <div className="ov-grid">
        <Card title="Composition" hint="Concepts by type — click to filter">
          <ul className="ov-bars">
            {types.map((t) => {
              const n = typeCounts.get(t) ?? 0;
              return (
                <li key={t}>
                  <button
                    type="button"
                    className="ov-bar-row"
                    onClick={() => actions.showOnlyType(t)}
                    title={`Show only ${t}`}
                  >
                    {dot(t)}
                    <span className="ov-bar-label">{t}</span>
                    <span className="ov-bar-track" aria-hidden="true">
                      <span
                        className="ov-bar-fill"
                        style={{
                          width: `${(n / maxTypeCount) * 100}%`,
                          background: palette.color(t),
                        }}
                      />
                    </span>
                    <span className="ov-bar-count">{n}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card title="Hubs" hint="The most-connected concepts — natural entry points">
          {hubs.length ? (
            <ConceptList items={hubs} dot={dot} onOpen={open} meta={(c) => `${c.degree} links`} />
          ) : (
            <p className="ov-empty muted">No cross-links yet.</p>
          )}
        </Card>

        <Card
          title="Loose ends"
          hint="Concepts with no links in or out — the graph buries these"
          count={orphans.length}
        >
          {orphans.length ? (
            <>
              <ConceptList
                items={orphans.slice(0, ORPHAN_LIMIT)}
                dot={dot}
                onOpen={open}
                meta={() => "orphan"}
              />
              {orphans.length > ORPHAN_LIMIT && (
                <p className="ov-more muted">+{orphans.length - ORPHAN_LIMIT} more</p>
              )}
            </>
          ) : (
            <p className="ov-empty muted">Every concept is connected.</p>
          )}
        </Card>

        <Card title="Health" hint="Rough edges to know about before you trust it">
          <ul className="ov-health">
            <li className={errors ? "is-error" : "is-ok"}>
              <span className="ov-health-n">{errors}</span> validation error
              {errors === 1 ? "" : "s"}
            </li>
            <li className={warnings ? "is-warn" : "is-ok"}>
              <span className="ov-health-n">{warnings}</span> warning
              {warnings === 1 ? "" : "s"}
            </li>
            <li className={brokenTotal ? "is-warn" : "is-ok"}>
              <span className="ov-health-n">{brokenTotal}</span> broken link
              {brokenTotal === 1 ? "" : "s"}
              {broken.length > 0 && ` across ${broken.length}`}
            </li>
          </ul>
          {broken.length > 0 && (
            <ConceptList
              items={broken.slice(0, BROKEN_LIMIT)}
              dot={dot}
              onOpen={open}
              meta={(c) => `${c.brokenLinks.length} broken`}
            />
          )}
        </Card>

        {dated.length > 0 && (
          <Card title="Recently changed" hint="Newest concepts by timestamp">
            <ConceptList
              items={recent}
              dot={dot}
              onOpen={open}
              meta={(c) => day(c.timestamp)}
            />
          </Card>
        )}
      </div>
    </div>
  );
}

function Card({
  title,
  hint,
  count,
  children,
}: {
  title: string;
  hint: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section className="ov-card">
      <header className="ov-card-head">
        <h2 className="ov-card-title">
          {title}
          {count !== undefined && <span className="ov-card-count">{count}</span>}
        </h2>
        <p className="ov-card-hint muted">{hint}</p>
      </header>
      {children}
    </section>
  );
}

function ConceptList({
  items,
  dot,
  onOpen,
  meta,
}: {
  items: Concept[];
  dot: (type: string) => ReactNode;
  onOpen: (id: string) => void;
  meta: (c: Concept) => string;
}) {
  return (
    <ul className="ov-list">
      {items.map((c) => (
        <li key={c.id}>
          <button type="button" className="ov-row" onClick={() => onOpen(c.id)}>
            {dot(c.type)}
            <span className="ov-row-title">{c.title}</span>
            <span className="ov-row-meta muted">{meta(c)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
