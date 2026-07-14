import {
  Archive,
  Bot,
  CircleAlert,
  FileText,
  History,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  User,
  Wrench,
} from "lucide-react";
import { useState, type CSSProperties, type ReactNode } from "react";
import "./AgentPanelStateGallery.css";

const SCENARIOS = [
  { id: "first-use", label: "First use" },
  { id: "saved-work", label: "Saved work" },
  { id: "stale-history", label: "Stale history" },
  { id: "no-history", label: "No history" },
  { id: "limited-agent", label: "Limited agent" },
  { id: "active-queue", label: "Active turn and queue" },
  { id: "permission", label: "Permission request" },
  { id: "staged", label: "Staged changes" },
  { id: "disconnected", label: "Disconnected process" },
] as const;

type ScenarioId = (typeof SCENARIOS)[number]["id"];
type GalleryWidth = 360 | 440 | 560;
type HierarchyMode = "stacked" | "merged";

function initialScenario(): ScenarioId {
  const requested = new URLSearchParams(window.location.search).get("agent-gallery");
  return SCENARIOS.some((scenario) => scenario.id === requested)
    ? requested as ScenarioId
    : "first-use";
}

function initialWidth(): GalleryWidth {
  const requested = Number(new URLSearchParams(window.location.search).get("width"));
  return requested === 360 || requested === 560 ? requested : 440;
}

export function AgentPanelStateGallery() {
  const [scenario, setScenario] = useState<ScenarioId>(initialScenario);
  const [width, setWidth] = useState<GalleryWidth>(initialWidth);
  const [hierarchy, setHierarchy] = useState<HierarchyMode>(() =>
    new URLSearchParams(window.location.search).get("hierarchy") === "merged"
      ? "merged"
      : "stacked"
  );

  function updateLocation(
    nextScenario: ScenarioId,
    nextWidth: GalleryWidth,
    nextHierarchy: HierarchyMode,
  ) {
    const url = new URL(window.location.href);
    url.searchParams.set("agent-gallery", nextScenario);
    url.searchParams.set("width", String(nextWidth));
    url.searchParams.set("hierarchy", nextHierarchy);
    window.history.replaceState(null, "", url);
  }

  function selectScenario(nextScenario: ScenarioId) {
    setScenario(nextScenario);
    updateLocation(nextScenario, width, hierarchy);
  }

  function selectWidth(nextWidth: GalleryWidth) {
    setWidth(nextWidth);
    updateLocation(scenario, nextWidth, hierarchy);
  }

  function selectHierarchy(nextHierarchy: HierarchyMode) {
    setHierarchy(nextHierarchy);
    updateLocation(scenario, width, nextHierarchy);
  }

  return (
    <main className="agent-gallery">
      <header className="agent-gallery__controls">
        <div>
          <strong>Agent Panel state gallery</strong>
          <span>Browser-development fixture. No agent or network action runs.</span>
        </div>
        <label>
          State
          <select
            aria-label="Gallery state"
            value={scenario}
            onChange={(event) => selectScenario(event.target.value as ScenarioId)}
          >
            {SCENARIOS.map((entry) => (
              <option key={entry.id} value={entry.id}>{entry.label}</option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend>Panel width</legend>
          {[360, 440, 560].map((value) => (
            <button
              key={value}
              type="button"
              className="btn ghost"
              aria-pressed={width === value}
              onClick={() => selectWidth(value as GalleryWidth)}
            >
              {value}px
            </button>
          ))}
        </fieldset>
        <fieldset>
          <legend>Hierarchy prototype</legend>
          {(["stacked", "merged"] as const).map((value) => (
            <button
              key={value}
              type="button"
              className="btn ghost"
              aria-pressed={hierarchy === value}
              onClick={() => selectHierarchy(value)}
            >
              {value === "stacked" ? "Stacked" : "Merged"}
            </button>
          ))}
        </fieldset>
      </header>
      <div className="agent-gallery__stage">
        <GalleryPanel
          scenario={scenario}
          hierarchy={hierarchy}
          style={{ "--agent-gallery-width": `${width}px` } as CSSProperties}
        />
      </div>
    </main>
  );
}

function GalleryPanel({
  scenario,
  hierarchy,
  style,
}: {
  scenario: ScenarioId;
  hierarchy: HierarchyMode;
  style: CSSProperties;
}) {
  if (scenario === "first-use") {
    return (
      <section className="agent-panel agent-gallery__panel" aria-label="Agent panel fixture" style={style}>
        <PanelHeader />
        <div className="agent-panel__empty">
          <span className="agent-panel__mark" aria-hidden="true"><Sparkles size={24} /></span>
          <h2>Connect an agent</h2>
          <p>Choose a subscription agent, Studio Agent, or a local ACP command.</p>
          <button type="button" className="btn primary">Connect an agent</button>
        </div>
      </section>
    );
  }

  if (scenario === "disconnected") {
    return (
      <section className="agent-panel agent-gallery__panel" aria-label="Agent panel fixture" style={style}>
        <PanelHeader />
        <div className="agent-panel__connection-failure" role="alert">
          <CircleAlert size={16} aria-hidden="true" />
          <div>
            <strong>Research agent with a deliberately long connection name stopped</strong>
            <p title="The external process exited while Studio was receiving a response. This deliberately long diagnostic verifies bounded wrapping without hiding recovery controls.">
              The external process exited while Studio was receiving a response. This deliberately long diagnostic verifies bounded wrapping without hiding recovery controls.
            </p>
          </div>
          <div className="agent-panel__connection-failure-actions">
            <button type="button" className="btn">Review connections</button>
            <button type="button" className="btn ghost">Dismiss</button>
          </div>
        </div>
        <div className="agent-panel__empty">
          <h2>Your bundle is still open</h2>
          <p>Agent activity stopped. Browsing and reading are unaffected.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="agent-panel agent-gallery__panel" aria-label="Agent panel fixture" style={style}>
      <PanelHeader />
      {hierarchy === "stacked" ? <StackedHierarchy /> : <MergedHierarchy />}
      <div className="agent-conversation">
        <ThreadToolbar />
        <ScenarioBody scenario={scenario} />
      </div>
    </section>
  );
}

function StackedHierarchy() {
  return (
    <>
      <nav className="agent-panel__connections" aria-label="Agent connections">
        <button type="button" className="btn ghost agent-panel__connection" aria-pressed="true">
          <span className="agent-panel__connection-label">Research agent with a deliberately long connection name</span>
        </button>
        <button type="button" className="btn ghost agent-panel__connection agent-panel__connection--add" aria-label="Connect another agent"><Plus size={16} aria-hidden="true" /></button>
      </nav>
      <nav className="agent-panel__threads" aria-label="Research agent threads">
        <button type="button" className="btn ghost agent-panel__thread" aria-pressed="true">
          <span className="agent-panel__thread-number">1</span>
          <span className="agent-panel__thread-label">Quarterly source reconciliation with a long title</span>
        </button>
        <button type="button" className="btn ghost agent-panel__thread agent-panel__thread--add" aria-label="Start another thread"><Plus size={16} aria-hidden="true" /></button>
      </nav>
    </>
  );
}

function MergedHierarchy() {
  return (
    <nav className="agent-gallery__merged-nav" aria-label="Agent and thread prototype">
      <button type="button" className="btn ghost agent-panel__connection" aria-pressed="true">
        <span className="agent-panel__connection-label">Research agent with a deliberately long connection name</span>
      </button>
      <button type="button" className="btn ghost agent-panel__connection agent-panel__connection--add" aria-label="Connect another agent"><Plus size={16} aria-hidden="true" /></button>
      <span className="agent-gallery__merged-divider" aria-hidden="true" />
      <button type="button" className="btn ghost agent-panel__thread" aria-pressed="true">
        <span className="agent-panel__thread-number">1</span>
        <span className="agent-panel__thread-label">Quarterly source reconciliation with a long title</span>
      </button>
      <button type="button" className="btn ghost agent-panel__thread agent-panel__thread--add" aria-label="Start another thread"><Plus size={16} aria-hidden="true" /></button>
    </nav>
  );
}

function PanelHeader() {
  return (
    <header className="agent-panel__head">
      <span className="agent-panel__title"><Sparkles size={16} aria-hidden="true" />Agent</span>
      <button type="button" className="btn ghost agent-panel__close">Workspace</button>
    </header>
  );
}

function ThreadToolbar() {
  return (
    <header className="agent-conversation__toolbar">
      <h2 className="sr-only">Quarterly source reconciliation</h2>
      <div className="agent-conversation__toolbar-actions">
        <button type="button" className="btn ghost" aria-label="Rename thread"><Pencil size={14} aria-hidden="true" /></button>
        <button type="button" className="btn ghost"><ShieldCheck size={14} aria-hidden="true" /><span className="agent-conversation__action-label">Security</span></button>
        <button type="button" className="btn ghost" aria-label="More thread actions"><MoreHorizontal size={14} aria-hidden="true" /></button>
      </div>
    </header>
  );
}

function ScenarioBody({ scenario }: { scenario: Exclude<ScenarioId, "first-use" | "disconnected"> }) {
  if (scenario === "saved-work") return <SavedWork />;
  if (scenario === "stale-history") return <StaleHistory />;
  if (scenario === "no-history") return <NoHistory />;
  if (scenario === "limited-agent") return <LimitedAgent />;
  if (scenario === "active-queue") return <ActiveQueue />;
  if (scenario === "permission") return <PermissionRequest />;
  return <StagedChanges />;
}

function ConversationLayout({ children, composer }: { children: ReactNode; composer?: ReactNode }) {
  return (
    <>
      <div className="agent-conversation__messages">{children}</div>
      {composer ?? <Composer />}
    </>
  );
}

function SavedWork() {
  return (
    <ConversationLayout>
      <div className="agent-conversation__welcome">
        <History size={24} aria-hidden="true" />
        <h3>Pick up where you left off</h3>
        <p>Resume saved work, or start a new thread.</p>
        <div className="agent-saved-threads">
          <section className="agent-saved-thread">
            <History size={16} aria-hidden="true" />
            <div><h4>Continue previous thread</h4><span>Reconcile customer source records</span><small>Updated Jul 14, 2026, 10:20 AM</small></div>
            <div className="agent-saved-thread__actions"><button type="button" className="btn primary">Resume</button><button type="button" className="btn ghost">Dismiss</button></div>
          </section>
          <section className="agent-saved-thread">
            <Archive size={16} aria-hidden="true" />
            <div><h4>Archived thread</h4><span>Earlier evidence review</span><small>Updated Jul 13, 2026, 4:40 PM</small></div>
            <div className="agent-saved-thread__actions"><button type="button" className="btn">Resume</button><button type="button" className="btn ghost">Forget</button></div>
          </section>
        </div>
        <button type="button" className="btn ghost agent-saved-thread__start-new">Start new thread</button>
      </div>
    </ConversationLayout>
  );
}

function StaleHistory() {
  return (
    <ConversationLayout>
      <div className="agent-conversation__welcome">
        <CircleAlert size={24} aria-hidden="true" />
        <h3>Saved thread unavailable</h3>
        <p role="alert">The agent no longer reports this session for the active bundle.</p>
        <div className="agent-saved-thread__recovery">
          <button type="button" className="btn primary">Retry</button>
          <button type="button" className="btn ghost">Start new thread</button>
          <button type="button" className="btn ghost">Dismiss</button>
        </div>
      </div>
    </ConversationLayout>
  );
}

function NoHistory() {
  return (
    <div className="agent-history">
      <header><div><h3>Agent history</h3><p>Sessions reported for this bundle.</p></div><button type="button" className="btn ghost">Back</button></header>
      <div className="agent-history__state"><History size={20} aria-hidden="true" /><strong>No previous sessions</strong><p>This agent has no history for the active bundle.</p><button type="button" className="btn ghost">Refresh</button></div>
    </div>
  );
}

function LimitedAgent() {
  return (
    <ConversationLayout>
      <div className="agent-conversation__welcome">
        <Bot size={24} aria-hidden="true" />
        <h3>Ask about this bundle</h3>
        <p>This agent accepts text only. History, images, and embedded context are not advertised, so those controls stay absent.</p>
      </div>
    </ConversationLayout>
  );
}

function ActiveQueue() {
  return (
    <ConversationLayout composer={(
      <Composer active queued>
        <section className="agent-queue" aria-label="Queued follow-up">
          <div><strong>Next message</strong><span>1 attachment</span></div>
          <p>Compare the remaining source notes after this turn finishes.</p>
          <div className="agent-queue__actions"><button type="button" className="btn ghost">Edit</button><button type="button" className="btn ghost">Remove</button></div>
        </section>
      </Composer>
    )}>
      <Message label="You">Trace the conflicting source claims.</Message>
      <article className="agent-tool agent-tool--in-progress" aria-label="Tool: Search bundle sources">
        <span className="agent-tool__icon"><Wrench size={15} aria-hidden="true" /></span>
        <div><strong>Search bundle sources</strong><small>Search</small></div><small className="agent-tool__status">Running</small>
      </article>
      <Message label="Agent">I found two records and am tracing their source references.</Message>
    </ConversationLayout>
  );
}

function PermissionRequest() {
  return (
    <ConversationLayout>
      <Message label="You">Inspect the generated dataset report.</Message>
      <section className="agent-permission" aria-label="Permission request">
        <ShieldCheck size={18} aria-hidden="true" />
        <div className="agent-permission__body">
          <h3>Allow Read generated report?</h3>
          <p>The agent is waiting for your decision.</p>
          <p className="agent-permission__error" role="alert">The response could not be delivered. The request is still active.</p>
          <div className="agent-permission__actions"><button type="button" className="btn primary">Allow once</button><button type="button" className="btn ghost">Reject</button></div>
          <label className="agent-permission__remember"><input type="checkbox" />Remember this exact request for this thread</label>
        </div>
      </section>
    </ConversationLayout>
  );
}

function StagedChanges() {
  return (
    <ConversationLayout composer={(
      <>
        <section className="agent-staged" aria-label="Staged changes">
          <header><strong>Enhancement draft</strong><span>3 files · not applied to the bundle</span><div className="agent-staged__actions"><button type="button" className="btn ghost">Validate</button><button type="button" className="btn ghost">Discard all</button></div></header>
          <div className="agent-staged__operation-error"><p role="alert" title="The staging service returned a deliberately long diagnostic. The draft remains unchanged and safe to retry.">Staging action failed. The staging service returned a deliberately long diagnostic. The draft remains unchanged and safe to retry.</p><button type="button" className="btn ghost"><RotateCcw size={14} aria-hidden="true" />Retry discard</button></div>
          <ul>
            <StagedFile path="product/customer-evidence-and-source-reconciliation.md" kind="Modified" />
            <StagedFile path="architecture/agent-system.md" kind="Modified" />
            <StagedFile path="index.md" kind="New file" />
          </ul>
          <p>Review or reject staged files, then validate the selected result.</p>
        </section>
        <Composer />
      </>
    )}>
      <Message label="Agent">The proposed additions are staged for your review.</Message>
    </ConversationLayout>
  );
}

function StagedFile({ path, kind }: { path: string; kind: string }) {
  return (
    <li><div className="agent-staged__file-row"><FileText size={14} aria-hidden="true" /><span title={path}>{path}</span><small>{kind} · 2 KB</small><div className="agent-staged__file-actions"><button type="button" className="btn ghost">Review</button><button type="button" className="btn ghost">Reject</button></div></div></li>
  );
}

function Message({ label, children }: { label: string; children: ReactNode }) {
  const isUser = label === "You";
  return (
    <article className={`agent-message agent-message--${isUser ? "user" : "agent"}`}>
      <span className="agent-message__icon">
        {isUser ? <User size={16} aria-hidden="true" /> : <Bot size={16} aria-hidden="true" />}
      </span>
      <div><strong>{label}</strong><p>{children}</p></div>
    </article>
  );
}

function Composer({
  children,
  active = false,
  queued = false,
}: {
  children?: ReactNode;
  active?: boolean;
  queued?: boolean;
}) {
  return (
    <div className="agent-composer">
      {children}
      <div className="agent-composer__input-shell">
        <label className="sr-only" htmlFor="gallery-composer">Message the agent</label>
        <textarea
          id="gallery-composer"
          rows={3}
          placeholder="Ask about this bundle..."
          readOnly
          disabled={queued}
        />
        <div className="agent-composer__actions">
          <button type="button" className="btn ghost" aria-label="Add context or sources"><Plus size={16} aria-hidden="true" /></button>
          <span className="agent-composer__status">Scoped tools</span>
          {active ? (
            <div className="agent-composer__turn-actions">
              <button type="button" className="btn primary" disabled={queued}>
                <Send size={14} aria-hidden="true" />{queued ? "Queued" : "Queue"}
              </button>
              <button type="button" className="btn"><Square size={14} aria-hidden="true" />Stop</button>
            </div>
          ) : (
            <button type="button" className="btn primary"><Send size={14} aria-hidden="true" />Send</button>
          )}
        </div>
      </div>
    </div>
  );
}
