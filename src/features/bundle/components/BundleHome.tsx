// Bundle Home: the working start page for an open bundle. Static identity and
// conformance live in Bundle details; this surface answers what changed, what
// needs attention, and where the user can resume. Every item opens the concept
// or workspace surface that can move the work forward.

import {
  ArrowRight,
  Check,
  GitBranch,
  History,
  TriangleAlert,
} from "lucide-react";
import type { MouseEvent, ReactNode } from "react";
import { useApp } from "@/shared/store.tsx";
import { orphanIds } from "@/shared/selectors.ts";
import { buildTypePalette, resolveDark } from "@/shared/theme.ts";
import type { Concept } from "@/shared/types.ts";
import { renderMarkdown } from "@/shared/render/markdown.ts";
import {
  classifyBodyLinks,
  classifyLink,
} from "@/features/reader/components/Reader.tsx";
import {
  changeLogBody,
  changeLogKind,
  newestLogEntries,
} from "@/features/bundle/changeLog.ts";
import { useGitRepository } from "@/features/git/gitRepositoryStore.ts";
import type { GitChange } from "@/features/git/types.ts";
import "./BundleHome.css";

const ACTIVITY_LIMIT = 10;
const RESUME_LIMIT = 5;
const ATTENTION_LIMIT = 3;
const CHANGE_LIMIT = 6;

function day(timestamp: string | null): string {
  return timestamp ? timestamp.slice(0, 10) : "";
}

function uniqueConcepts(ids: (string | null)[], concepts: Concept[]): Concept[] {
  const byId = new Map(concepts.map((concept) => [concept.id, concept]));
  const seen = new Set<string>();
  const result: Concept[] = [];
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    const concept = byId.get(id);
    if (!concept) continue;
    seen.add(id);
    result.push(concept);
  }
  return result;
}

function changeMeta(change: GitChange): string {
  const location = change.staged && change.unstaged
    ? "staged + working tree"
    : change.staged
      ? "staged"
      : "working tree";
  return `${change.kind} · ${location}`;
}

export function BundleHome() {
  const { state, actions } = useApp();
  const repository = useGitRepository(state.activeRoot);
  const bundle = state.bundle;
  if (!bundle) return null;

  const concepts = bundle.concepts;
  const palette = buildTypePalette(
    [...new Set(concepts.map((concept) => concept.type))].sort(),
    resolveDark(state.settings.theme),
  );
  const dot = (type: string) => (
    <span
      className="ov-dot"
      style={{ background: palette.color(type) }}
      aria-hidden="true"
    />
  );

  const dated = concepts
    .filter((concept) => concept.timestamp)
    .sort((a, b) => (day(a.timestamp) < day(b.timestamp) ? 1 : -1));
  const resumeIds = [
    state.activeConceptId,
    ...state.tabs.map((tab) => tab.conceptId),
    ...[...state.back].reverse(),
  ];
  const sessionConcepts = uniqueConcepts(resumeIds, concepts);
  const resume = (sessionConcepts.length > 0 ? sessionConcepts : dated)
    .slice(0, RESUME_LIMIT);

  const activity = newestLogEntries(bundle.log)
    .flatMap((group) =>
      group.entries.map((entry, index) => ({
        id: `${group.date}:${index}:${entry}`,
        date: group.date,
        kind: changeLogKind(entry),
        html: classifyBodyLinks(renderMarkdown(changeLogBody(entry)), "", bundle),
      })),
    )
    .slice(0, ACTIVITY_LIMIT);

  const errors = bundle.issues.filter((issue) => issue.level === "error").length;
  const warnings = bundle.issues.filter((issue) => issue.level === "warning").length;
  const broken = concepts.filter((concept) => concept.brokenLinks.length > 0);
  const brokenIds = new Set(broken.map((concept) => concept.id));
  const orphanSet = new Set(orphanIds(bundle));
  const disconnected = concepts.filter(
    (concept) =>
      orphanSet.has(concept.id) && !brokenIds.has(concept.id),
  );
  const hasAttention =
    errors > 0 ||
    warnings > 0 ||
    broken.length > 0 ||
    disconnected.length > 0;

  const git = repository.snapshot?.availability === "ready"
    ? repository.snapshot
    : null;

  function openConcept(id: string) {
    actions.selectConcept(id);
  }

  function onActivityClick(event: MouseEvent<HTMLOListElement>) {
    const anchor = (event.target as HTMLElement).closest("a");
    if (!anchor) return;
    const href = anchor.getAttribute("href");
    if (!href) return;
    event.preventDefault();
    const link = classifyLink(href, "", bundle);
    if (link.kind === "external") {
      actions.openExternal(link.url);
    } else if (link.kind === "concept") {
      actions.selectConcept(link.id);
    } else if (link.kind === "directory") {
      const first = concepts.find((concept) =>
        concept.id.startsWith(`${link.dir}/`),
      );
      if (first) actions.selectConcept(first.id);
    }
  }

  return (
    <div className="overview" role="region" aria-label="Bundle home">
      <div className="ov-shell">
        <div className="ov-head">
          <p className="ov-eyebrow">Bundle home</p>
          <h1 className="ov-title">{bundle.name}</h1>
          <p className="ov-subtitle">
            Resume your work, review what changed, and handle the next useful
            maintenance step.
          </p>
        </div>

        <div className="ov-dashboard">
          <Card
            className="ov-activity-card"
            title="Activity"
            hint="Bundle-authored changes from log.md"
            action={
              bundle.log.length > 0 ? (
                <button
                  type="button"
                  className="ov-card-action"
                  onClick={() => actions.togglePanel("log", true)}
                >
                  Full log <ArrowRight size={14} aria-hidden="true" />
                </button>
              ) : null
            }
          >
            {activity.length > 0 ? (
              // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events -- delegated routing for rendered links; anchors keep native keyboard behavior
              <ol className="ov-activity" onClick={onActivityClick}>
                {activity.map((entry) => (
                  <li key={entry.id} className="ov-activity-item">
                    <div className="ov-activity-marker" aria-hidden="true">
                      <span data-kind={entry.kind} />
                    </div>
                    <div className="ov-activity-content">
                      <div className="ov-activity-meta">
                        <time dateTime={entry.date}>{entry.date}</time>
                        {entry.kind ? <span>{entry.kind}</span> : null}
                      </div>
                      <div
                        className="ov-activity-body markdown"
                        // Sanitized by renderMarkdown before link classification.
                        dangerouslySetInnerHTML={{ __html: entry.html }}
                      />
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState
                title="No activity recorded yet"
                detail="Dated entries in log.md will appear here as the bundle evolves."
              />
            )}
          </Card>

          <div className="ov-side">
            <Card
              title="Continue working"
              hint={
                sessionConcepts.length > 0
                  ? "Concepts active in this session"
                  : "Most recently updated concepts"
              }
            >
              {resume.length > 0 ? (
                <ConceptList
                  items={resume}
                  dot={dot}
                  onOpen={openConcept}
                  meta={(concept) =>
                    concept.timestamp
                      ? `${concept.type} · ${day(concept.timestamp)}`
                      : concept.type
                  }
                />
              ) : (
                <EmptyState
                  title="Nothing to resume yet"
                  detail="Open a concept and it will be waiting here when you return Home."
                />
              )}
            </Card>

            <Card
              title="Needs attention"
              hint="Deterministic issues with a direct next step"
            >
              {hasAttention ? (
                <div className="ov-attention">
                  {errors > 0 || warnings > 0 ? (
                    <button
                      type="button"
                      className="ov-attention-summary"
                      data-kind={errors > 0 ? "error" : "warning"}
                      onClick={() => actions.togglePanel("validation", true)}
                    >
                      <TriangleAlert size={16} aria-hidden="true" />
                      <span>
                        <strong>
                          {errors > 0
                            ? `${errors} validation error${errors === 1 ? "" : "s"}`
                            : `${warnings} validation warning${warnings === 1 ? "" : "s"}`}
                        </strong>
                        <small>Open the validation report</small>
                      </span>
                      <ArrowRight size={14} aria-hidden="true" />
                    </button>
                  ) : null}

                  {broken.length > 0 ? (
                    <AttentionGroup
                      title={`${broken.length} concept${broken.length === 1 ? "" : "s"} with broken links`}
                    >
                      <ConceptList
                        items={broken.slice(0, ATTENTION_LIMIT)}
                        dot={dot}
                        onOpen={openConcept}
                        meta={(concept) =>
                          `${concept.brokenLinks.length} broken`
                        }
                      />
                    </AttentionGroup>
                  ) : null}

                  {disconnected.length > 0 ? (
                    <AttentionGroup
                      title={`${disconnected.length} unlinked concept${disconnected.length === 1 ? "" : "s"}`}
                    >
                      <ConceptList
                        items={disconnected.slice(0, ATTENTION_LIMIT)}
                        dot={dot}
                        onOpen={openConcept}
                        meta={() => "unlinked"}
                      />
                      {disconnected.length > ATTENTION_LIMIT ? (
                        <button
                          type="button"
                          className="ov-inline-action"
                          onClick={() => {
                            actions.setOverview(false);
                            actions.setLayout("graph");
                          }}
                        >
                          Explore all {disconnected.length} in the graph
                        </button>
                      ) : null}
                    </AttentionGroup>
                  ) : null}

                </div>
              ) : (
                <div className="ov-clear">
                  <Check size={16} aria-hidden="true" />
                  <span>
                    <strong>No immediate maintenance</strong>
                    <small>No validation or link issues need attention.</small>
                  </span>
                </div>
              )}
            </Card>

            {repository.loading && !repository.snapshot ? (
              <Card title="Work in progress" hint="Repository">
                <div className="ov-empty" role="status">
                  <GitBranch size={16} aria-hidden="true" />
                  <span>
                    <strong>Reading repository</strong>
                    <small>Checking the current branch and working tree.</small>
                  </span>
                </div>
              </Card>
            ) : null}

            {repository.error && !repository.snapshot ? (
              <Card
                title="Work in progress"
                hint="Repository status unavailable"
                action={
                  <button
                    type="button"
                    className="ov-card-action"
                    onClick={() => actions.togglePanel("git", true)}
                  >
                    Open Git <ArrowRight size={14} aria-hidden="true" />
                  </button>
                }
              >
                <div className="ov-empty" role="alert">
                  <GitBranch size={16} aria-hidden="true" />
                  <span>
                    <strong>Could not read repository status</strong>
                    <small>{repository.error}</small>
                  </span>
                </div>
              </Card>
            ) : null}

            {git ? (
              <Card
                title="Work in progress"
                hint={git.branch ?? "Detached HEAD"}
                action={
                  <button
                    type="button"
                    className="ov-card-action"
                    onClick={() => actions.togglePanel("git", true)}
                  >
                    Changes <ArrowRight size={14} aria-hidden="true" />
                  </button>
                }
              >
                {git.changes.length > 0 ? (
                  <>
                    <ul className="ov-changes">
                      {git.changes.slice(0, CHANGE_LIMIT).map((change) => (
                        <li key={change.path}>
                          <button
                            type="button"
                            onClick={() => actions.togglePanel("git", true)}
                          >
                            <span>{change.path}</span>
                            <small>{changeMeta(change)}</small>
                          </button>
                        </li>
                      ))}
                    </ul>
                    {git.changes.length > CHANGE_LIMIT ? (
                      <p className="ov-more">
                        +{git.changes.length - CHANGE_LIMIT} more changed files
                      </p>
                    ) : null}
                  </>
                ) : (
                  <div className="ov-clear">
                    <GitBranch size={16} aria-hidden="true" />
                    <span>
                      <strong>Working tree is clean</strong>
                      <small>No uncommitted repository changes.</small>
                    </span>
                  </div>
                )}
              </Card>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function Card({
  title,
  hint,
  action,
  className,
  children,
}: {
  title: string;
  hint: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`ov-card${className ? ` ${className}` : ""}`}>
      <header className="ov-card-head">
        <div>
          <h2 className="ov-card-title">{title}</h2>
          <p className="ov-card-hint">{hint}</p>
        </div>
        {action}
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
  meta: (concept: Concept) => string;
}) {
  return (
    <ul className="ov-list">
      {items.map((concept) => (
        <li key={concept.id}>
          <button
            type="button"
            className="ov-row"
            onClick={() => onOpen(concept.id)}
          >
            {dot(concept.type)}
            <span className="ov-row-copy">
              <span className="ov-row-title">{concept.title}</span>
              <span className="ov-row-meta">{meta(concept)}</span>
            </span>
            <ArrowRight size={14} aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}

function AttentionGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="ov-attention-group">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="ov-empty">
      <History size={16} aria-hidden="true" />
      <span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
    </div>
  );
}
