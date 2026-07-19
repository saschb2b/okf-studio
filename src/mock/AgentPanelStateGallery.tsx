import {
  Archive,
  Bot,
  Check,
  Circle,
  CircleAlert,
  CircleDot,
  FileText,
  History,
  ListChecks,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Search as SearchIcon,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
} from "lucide-react";
import { useState, type CSSProperties, type ReactNode } from "react";
import type { AgentSessionConfigOption } from "@/features/agent/connection.ts";
import { AgentLiveWorkShelf } from "@/features/agent/components/AgentLiveWorkShelf.tsx";
import { AgentSessionControls } from "@/features/agent/components/AgentSessionControls.tsx";
import { ConversationToolbar } from "@/features/agent/components/conversation/ConversationToolbar.tsx";
import { ThreadSwitcher } from "@/features/agent/components/conversation/ThreadSwitcher.tsx";
import { RetrievalEvidenceSummary } from "@/features/agent/components/retrieval/RetrievalEvidenceSummary.tsx";
import { RetrievalInspector } from "@/features/agent/components/retrieval/RetrievalInspector.tsx";
import { RetrievalLab } from "@/features/agent/components/retrieval/RetrievalLab.tsx";
import { mockRetrieval } from "@/features/agent/retrieval/mockRetrieval.ts";
import { MOCK_BUNDLE, MOCK_FOLDER } from "@/mock/fixture.ts";
import "./AgentPanelStateGallery.css";

const GALLERY_RETRIEVAL = mockRetrieval(MOCK_BUNDLE, {
  query: "How does the concept reader connect to the data model?",
  route: "lexical-graph",
  contextBudgetTokens: 4096,
});

const SCENARIOS = [
  { id: "first-use", label: "First use" },
  { id: "saved-work", label: "Saved work" },
  { id: "stale-history", label: "Stale history" },
  { id: "no-history", label: "No history" },
  { id: "limited-agent", label: "Limited agent" },
  { id: "session-controls", label: "Session controls" },
  { id: "session-one-option", label: "One session option" },
  { id: "session-dynamic", label: "Dynamic option removal" },
  { id: "session-pending", label: "Session change pending" },
  { id: "session-failure", label: "Session change failure" },
  { id: "live-work-max", label: "All live work" },
  { id: "active-queue", label: "Active turn and queue" },
  { id: "permission", label: "Permission request" },
  { id: "staged", label: "Staged changes" },
  { id: "retrieval-turn", label: "Retrieval turn" },
  { id: "retrieval-inspector", label: "Retrieval inspector" },
  { id: "retrieval-lab", label: "Evidence Lab" },
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
        <ThreadToolbar includeThreadNavigation={hierarchy === "stacked"} />
        <ScenarioBody scenario={scenario} />
      </div>
    </section>
  );
}

function StackedHierarchy() {
  return (
    <nav className="agent-panel__connections" aria-label="Agent connections">
      <button type="button" className="btn ghost agent-panel__connection" aria-pressed="true">
        <span className="agent-panel__connection-label">Research agent with a deliberately long connection name</span>
      </button>
      <button type="button" className="btn ghost agent-panel__connection agent-panel__connection--add" aria-label="Connect another agent"><Plus size={16} aria-hidden="true" /></button>
    </nav>
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

function ThreadToolbar({ includeThreadNavigation }: { includeThreadNavigation: boolean }) {
  return (
    <ConversationToolbar
      titleId="agent-gallery-thread-title"
      title="Quarterly source reconciliation"
      navigation={includeThreadNavigation ? (
        <ThreadSwitcher
          agentName="Research agent"
          threads={[{
            id: "quarterly",
            ordinal: 1,
            title: "Quarterly source reconciliation with a long title",
            status: "staged",
          }]}
          selectedThreadId="quarterly"
          maxReached={false}
          onSelect={() => undefined}
          onAdd={() => undefined}
        />
      ) : undefined}
    >
      <button type="button" className="btn ghost" aria-label="Rename thread"><Pencil size={14} aria-hidden="true" /></button>
      <button type="button" className="btn ghost"><ShieldCheck size={14} aria-hidden="true" /><span className="agent-conversation__action-label">Security</span></button>
      <button type="button" className="btn ghost" aria-label="More thread actions"><MoreHorizontal size={14} aria-hidden="true" /></button>
    </ConversationToolbar>
  );
}

function ScenarioBody({ scenario }: { scenario: Exclude<ScenarioId, "first-use" | "disconnected"> }) {
  if (scenario === "saved-work") return <SavedWork />;
  if (scenario === "stale-history") return <StaleHistory />;
  if (scenario === "no-history") return <NoHistory />;
  if (scenario === "limited-agent") return <LimitedAgent />;
  if (scenario === "session-controls") return <SessionControls />;
  if (scenario === "session-one-option") {
    const model = GALLERY_CONFIG_OPTIONS.find((option) => option.id === "model");
    const oneOption = model?.type === "select" ? [{
      ...model,
      groups: [{
        id: "available",
        name: "Available model",
        options: [model.groups[0].options[0]],
      }],
    }] : [];
    return <SessionControls title="One advertised choice" options={oneOption} />;
  }
  if (scenario === "session-dynamic") {
    return (
      <SessionControls
        title="Reasoning option removed"
        options={GALLERY_CONFIG_OPTIONS.filter((option) => option.id !== "reasoning")}
      />
    );
  }
  if (scenario === "session-pending") {
    return <SessionControls title="Model change pending" configState="pending" />;
  }
  if (scenario === "session-failure") {
    return <SessionControls title="Model change failed" configState="failure" />;
  }
  if (scenario === "live-work-max") return <AllLiveWork />;
  if (scenario === "active-queue") return <ActiveQueue />;
  if (scenario === "permission") return <PermissionRequest />;
  if (scenario === "retrieval-turn") return <RetrievalTurn />;
  if (scenario === "retrieval-inspector") return <RetrievalInspectorFixture />;
  if (scenario === "retrieval-lab") return <RetrievalLabFixture />;
  return <StagedChanges />;
}

function RetrievalTurn() {
  return (
    <ConversationLayout>
      <article className="agent-message agent-message--user">
        <p>How does the concept reader connect to the data model?</p>
      </article>
      <article className="agent-message agent-message--agent">
        <p>The reader renders parsed concepts while the shared data model preserves their identities, links, and backlinks.</p>
      </article>
      <RetrievalEvidenceSummary result={GALLERY_RETRIEVAL} onInspect={() => undefined} />
    </ConversationLayout>
  );
}

function RetrievalInspectorFixture() {
  return (
    <>
      <RetrievalInspector
        result={GALLERY_RETRIEVAL}
        onClose={() => undefined}
        onOpenConcept={() => undefined}
        onRerun={() => undefined}
      />
      <Composer />
    </>
  );
}

function RetrievalLabFixture() {
  return (
    <RetrievalLab
      bundleRoot={MOCK_FOLDER}
      bundleName={MOCK_BUNDLE.name}
      initialResult={GALLERY_RETRIEVAL}
      onClose={() => undefined}
      onOpenConcept={() => undefined}
      onReviewRepair={() => undefined}
    />
  );
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
    <ConversationLayout composer={<Composer configState="none" />}>
      <div className="agent-conversation__welcome">
        <Bot size={24} aria-hidden="true" />
        <h3>Ask about this bundle</h3>
        <p>This agent accepts text only. History, images, and embedded context are not advertised, so those controls stay absent.</p>
      </div>
    </ConversationLayout>
  );
}

const GALLERY_CONFIG_OPTIONS: readonly AgentSessionConfigOption[] = [
  {
    id: "mode",
    name: "Mode",
    description: "How the agent approaches the next turn.",
    category: "mode",
    type: "select",
    currentValue: "agent",
    groups: [{
      id: null,
      name: null,
      options: [
        { value: "agent", name: "Agent", description: "Use tools and make changes." },
        { value: "plan", name: "Plan", description: "Prepare a plan before acting." },
      ],
    }],
  },
  {
    id: "model",
    name: "Model",
    description: "The model selected for this session.",
    category: "model",
    type: "select",
    currentValue: "sol",
    groups: [
      {
        id: "recommended",
        name: "Recommended",
        options: [
          { value: "sol", name: "GPT-5.6-Sol", description: "Balanced agent model." },
          { value: "terra", name: "GPT-5.6-Terra", description: "Detailed agent model." },
        ],
      },
      {
        id: "other",
        name: "Other models",
        options: [
          { value: "luna", name: "GPT-5.6-Luna", description: "Fast agent model." },
          { value: "gpt-5.5", name: "GPT-5.5", description: "Previous generation." },
          { value: "gpt-5.4", name: "GPT-5.4", description: null },
          { value: "gpt-5.4-mini", name: "GPT-5.4-Mini", description: null },
        ],
      },
    ],
  },
  {
    id: "reasoning",
    name: "Reasoning",
    description: "Reasoning depth for the next turn.",
    category: "thought-level",
    type: "select",
    currentValue: "high",
    groups: [{
      id: null,
      name: null,
      options: ["low", "medium", "high", "xhigh", "max"].map((value) => ({
        value,
        name: value === "xhigh" ? "Extra high" : `${value[0].toUpperCase()}${value.slice(1)}`,
        description: value === "high" ? "Greater depth for complex work." : null,
      })),
    }],
  },
  {
    id: "concise",
    name: "Concise responses",
    description: "Prefer shorter responses when supported.",
    category: "_response_style",
    type: "boolean",
    currentValue: false,
  },
];

function SessionControls({
  title = "Configure the next turn",
  options = GALLERY_CONFIG_OPTIONS,
  configState = "ready",
}: {
  title?: string;
  options?: readonly AgentSessionConfigOption[];
  configState?: "ready" | "pending" | "failure";
}) {
  return (
    <ConversationLayout composer={<Composer configState={configState} configOptions={options} />}>
      <div className="agent-conversation__welcome">
        <Bot size={24} aria-hidden="true" />
        <h3>{title}</h3>
        <p>Every visible choice is advertised by this fixture session.</p>
      </div>
    </ConversationLayout>
  );
}

function ActiveQueue() {
  return (
    <ConversationLayout composer={(
      <>
        <AgentLiveWorkShelf summary="1 of 3 complete · 1 queued message">
          <LivePlanFixture />
          <QueuedPromptFixture />
        </AgentLiveWorkShelf>
        <Composer active queued />
      </>
    )}>
      <Message label="You">Trace the conflicting source claims.</Message>
      <article className="agent-tool agent-tool--row agent-tool--in-progress" aria-label="Tool: Search bundle sources">
        <span className="agent-tool__icon" aria-hidden="true"><SearchIcon size={14} /></span>
        <span className="agent-tool__title">Search bundle sources</span>
      </article>
      <Message label="Agent">I found two records and am tracing their source references.</Message>
    </ConversationLayout>
  );
}

function PermissionRequest() {
  return (
    <ConversationLayout composer={(
      <>
        <AgentLiveWorkShelf
          summary="1 decision"
          collapsible={false}
          blockingContent={<PermissionFixture />}
        />
        <Composer />
      </>
    )}>
      <Message label="You">Inspect the generated dataset report.</Message>
    </ConversationLayout>
  );
}

function StagedChanges() {
  return (
    <ConversationLayout composer={(
      <>
        <AgentLiveWorkShelf summary="3 staged files">
          <StagedChangesFixture showFailure />
        </AgentLiveWorkShelf>
        <Composer />
      </>
    )}>
      <Message label="Agent">The proposed additions are staged for your review.</Message>
    </ConversationLayout>
  );
}

function AllLiveWork() {
  return (
    <ConversationLayout composer={(
      <>
        <AgentLiveWorkShelf
          summary="1 decision · 1 of 3 complete · 3 staged files · 1 queued message"
          blockingContent={<PermissionFixture />}
        >
          <LivePlanFixture />
          <StagedChangesFixture />
          <QueuedPromptFixture />
        </AgentLiveWorkShelf>
        <Composer active queued />
      </>
    )}>
      <Message label="You">Reconcile the source claims and prepare reviewed updates.</Message>
      <article className="agent-tool agent-tool--row agent-tool--in-progress" aria-label="Tool: Search bundle sources">
        <span className="agent-tool__icon" aria-hidden="true"><SearchIcon size={14} /></span>
        <span className="agent-tool__title">Search bundle sources</span>
      </article>
      <Message label="Agent">I need one decision before I can finish the staged update.</Message>
    </ConversationLayout>
  );
}

function PermissionFixture() {
  return (
    <section className="agent-permission" aria-label="Permission request">
      <ShieldCheck size={18} aria-hidden="true" />
      <div className="agent-permission__body">
        <h3>Allow Read generated report?</h3>
        <p>The agent is waiting for your decision.</p>
        <p className="agent-permission__error" role="alert">
          The response could not be delivered. The request is still active.
        </p>
        <div className="agent-permission__actions">
          <button type="button" className="btn primary">Allow once</button>
          <button type="button" className="btn ghost">Reject</button>
        </div>
        <label className="agent-permission__remember">
          <input type="checkbox" />Remember this exact request for this thread
        </label>
      </div>
    </section>
  );
}

function LivePlanFixture() {
  return (
    <details className="agent-live-plan" open>
      <summary>
        <span className="agent-plan__icon"><ListChecks size={15} aria-hidden="true" /></span>
        <span><strong>Plan</strong><span>Trace source references</span></span>
        <small>1 complete · 2 remaining</small>
      </summary>
      <ol>
        <li className="agent-plan__entry agent-plan__entry--completed"><Check size={14} aria-hidden="true" /><span>Find conflicting claims</span><small>Completed</small></li>
        <li className="agent-plan__entry agent-plan__entry--in-progress"><CircleDot size={14} aria-hidden="true" /><span>Trace source references</span><small>In progress</small></li>
        <li className="agent-plan__entry agent-plan__entry--pending"><Circle size={14} aria-hidden="true" /><span>Prepare a cited summary</span><small>Pending</small></li>
      </ol>
    </details>
  );
}

function StagedChangesFixture({ showFailure = false }: { showFailure?: boolean }) {
  return (
    <section className="agent-staged" aria-label="Staged changes">
      <header><strong>Enhancement draft</strong><span>3 files · not applied to the bundle</span><div className="agent-staged__actions"><button type="button" className="btn ghost">Validate</button><button type="button" className="btn ghost">Discard all</button></div></header>
      {showFailure && (
        <div className="agent-staged__operation-error"><p role="alert" title="The staging service returned a deliberately long diagnostic. The draft remains unchanged and safe to retry.">Staging action failed. The staging service returned a deliberately long diagnostic. The draft remains unchanged and safe to retry.</p><button type="button" className="btn ghost"><RotateCcw size={14} aria-hidden="true" />Retry discard</button></div>
      )}
      <ul>
        <StagedFile path="product/customer-evidence-and-source-reconciliation.md" kind="Modified" />
        <StagedFile path="architecture/agent-system.md" kind="Modified" />
        <StagedFile path="index.md" kind="New file" />
      </ul>
      <p>Review or reject staged files, then validate the selected result.</p>
    </section>
  );
}

function QueuedPromptFixture() {
  return (
    <section className="agent-queue" aria-label="Next message">
      <div><strong>Next message</strong><span>1 attachment</span></div>
      <p>Compare the remaining source notes after this turn finishes.</p>
      <div className="agent-queue__actions"><button type="button" className="btn ghost">Edit</button><button type="button" className="btn ghost">Remove</button></div>
    </section>
  );
}

function StagedFile({ path, kind }: { path: string; kind: string }) {
  return (
    <li><div className="agent-staged__file-row"><FileText size={14} aria-hidden="true" /><span title={path}>{path}</span><small>{kind} · 2 KB</small><div className="agent-staged__file-actions"><button type="button" className="btn ghost">Review</button><button type="button" className="btn ghost">Reject</button></div></div></li>
  );
}

// Mirrors conversation/items.tsx Message: Zed-style document flow — the
// user's message is a bordered block, agent prose flows as plain text.
function Message({ label, children }: { label: string; children: ReactNode }) {
  const isUser = label === "You";
  return (
    <article className={`agent-message agent-message--${isUser ? "user" : "agent"}`}>
      <div><p>{children}</p></div>
    </article>
  );
}

function Composer({
  children,
  active = false,
  queued = false,
  configState = "none",
  configOptions = GALLERY_CONFIG_OPTIONS,
}: {
  children?: ReactNode;
  active?: boolean;
  queued?: boolean;
  configState?: "none" | "ready" | "pending" | "failure";
  configOptions?: readonly AgentSessionConfigOption[];
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
          <div className="agent-composer__leading-actions">
            <button type="button" className="btn ghost" aria-label="Add context or sources"><Plus size={16} aria-hidden="true" /></button>
            <span className="agent-composer__status">Scoped tools</span>
          </div>
          {configState !== "none" && (
            <AgentSessionControls
              options={configOptions}
              pendingOptionId={configState === "pending" ? "model" : null}
              failure={configState === "failure" ? {
                optionId: "model",
                requestedValue: { type: "select", value: "terra" },
                message: "The agent rejected the model switch.",
              } : null}
              favoriteScope="gallery"
              disabled={false}
              onChange={() => undefined}
              onRetry={() => undefined}
            />
          )}
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
