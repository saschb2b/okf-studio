import type { AgentPlanEntryInfo, AgentToolLocationInfo, AgentPermissionEvent, AgentPermissionOptionInfo, AgentTurnEvent } from "@/features/agent/connection.ts";
import type { Dispatch, SetStateAction } from "react";
import { ArrowRightLeft, Brain, Check, ChevronDown, Circle, CircleAlert, CircleDot, CornerUpLeft, FileText, Globe, Hammer, ListChecks, Minimize2, Pencil, RotateCcw, Search, ShieldQuestion, SlidersHorizontal, Terminal, Trash2 } from "lucide-react";
import { BundleProposalPreview } from "@/features/agent/components/BundleProposalPreview.tsx";
import { bundleProposalNarrative, parseBundleProposal } from "@/features/agent/bundleProposal.ts";
import { renderMarkdown } from "@/shared/render/markdown.ts";
import { respondAgentPermission } from "@/shared/ipc.ts";
import { useRef, useState } from "react";
import type { ConversationMessage, ConversationPlan, ConversationTool, ConversationItem, PendingPermission } from "./types.ts";
import { errorMessage } from "./helpers.ts";
import { ResponseActions } from "./ResponseActions.tsx";
import { StreamingMarkdown } from "./StreamingMarkdown.tsx";
import { useSmoothedStream } from "./useSmoothedStream.ts";
import { conceptIdForToolLocation } from "./toolLocation.ts";
import "@/features/agent/components/AgentConversation.css";

export function applyPermissionEvent(
  current: PendingPermission[],
  event: AgentPermissionEvent,
): PendingPermission[] {
  if (event.update.kind === "resolved") {
    return current.filter((permission) => permission.requestId !== event.requestId);
  }
  const requested: PendingPermission = { ...event, update: event.update };
  const existingIndex = current.findIndex((permission) => permission.requestId === event.requestId);
  if (existingIndex < 0) return [...current, requested];
  return current.map((permission, index) => (index === existingIndex ? requested : permission));
}

export function PermissionCard({ permission }: { permission: PendingPermission }) {
  const [status, setStatus] = useState<"idle" | "submitting">("idle");
  const [failure, setFailure] = useState<string | null>(null);
  const [rememberForThread, setRememberForThread] = useState(false);
  const hasRejectOption = permission.update.options.some((option) =>
    option.kind.startsWith("reject-"),
  );

  async function choose(option: AgentPermissionOptionInfo | null) {
    setStatus("submitting");
    setFailure(null);
    try {
      const accepted = await respondAgentPermission(
        permission.requestId,
        option?.optionId ?? null,
        rememberForThread && option?.kind.endsWith("-once") === true,
      );
      if (!accepted) {
        setStatus("idle");
        setFailure("This permission request is no longer active.");
      }
    } catch (error: unknown) {
      setStatus("idle");
      setFailure(errorMessage(error));
    }
  }

  return (
    <article className="agent-permission" aria-labelledby={`permission-${permission.requestId}`}>
      <ShieldQuestion size={20} aria-hidden="true" />
      <div className="agent-permission__body">
        <h3 id={`permission-${permission.requestId}`}>Permission needed</h3>
        <p>{permission.update.title ?? "The agent wants to run a tool."}</p>
        {permission.update.canRemember && (
          <label className="agent-permission__remember">
            <input
              type="checkbox"
              checked={rememberForThread}
              disabled={status === "submitting"}
              onChange={(event) => setRememberForThread(event.target.checked)}
            />
            Remember an Allow once or Reject choice for this exact request in this thread
          </label>
        )}
        <div className="agent-permission__actions">
          {permission.update.options.map((option) => (
            <button
              key={option.optionId}
              type="button"
              className={`btn ${option.kind.startsWith("allow-") ? "primary" : "ghost"}`}
              disabled={status === "submitting"}
              onClick={() => void choose(option)}
            >
              {option.name}
            </button>
          ))}
          {!hasRejectOption && (
            <button
              type="button"
              className="btn ghost"
              disabled={status === "submitting"}
              onClick={() => void choose(null)}
            >
              Cancel
            </button>
          )}
        </div>
        {failure && <p className="agent-permission__error" role="alert">{failure}</p>}
      </div>
    </article>
  );
}

export function applyTurnEvent(
  event: AgentTurnEvent,
  setMessages: Dispatch<SetStateAction<ConversationItem[]>>,
): void {
  if (event.update.kind === "usage" || event.update.kind === "capability-use") return;
  if (event.update.kind === "text") {
    const chunkText = event.update.text;
    setMessages((current) => {
      const lastTranscriptIndex = current.findLastIndex((item) => item.role !== "plan");
      const lastTranscriptItem = current[lastTranscriptIndex];
      if (lastTranscriptIndex < 0 || lastTranscriptItem.role !== "agent" ||
        lastTranscriptItem.turnId !== event.turnId) {
        const segmentNumber = current.filter((item) =>
          item.role === "agent" && item.turnId === event.turnId).length + 1;
        return [...current, {
          id: segmentNumber === 1
            ? `agent-${event.turnId}`
            : `agent-${event.turnId}-${segmentNumber}`,
          role: "agent",
          turnId: event.turnId,
          text: chunkText,
        }];
      }
      return current.map((message, messageIndex) =>
        messageIndex === lastTranscriptIndex && message.role === "agent"
          ? { ...message, text: message.text + chunkText }
          : message,
      );
    });
  } else if (event.update.kind === "plan") {
    const planId = `plan-${event.turnId}`;
    const entries = event.update.entries;
    setMessages((current) => {
      const index = current.findIndex((item) => item.id === planId);
      if (entries.length === 0) return current.filter((item) => item.id !== planId);
      const plan: ConversationPlan = { id: planId, role: "plan", turnId: event.turnId, entries };
      if (index < 0) return [...current, plan];
      return current.map((item, itemIndex) => itemIndex === index ? plan : item);
    });
  } else if (event.update.kind === "tool-call") {
    const toolUpdate = event.update;
    const itemId = `tool-${event.turnId}-${toolUpdate.toolCallId}`;
    setMessages((current) => {
      const index = current.findIndex((item) => item.id === itemId);
      const existing = index >= 0 && current[index]?.role === "tool"
        ? current[index]
        : null;
      const tool: ConversationTool = {
        id: itemId,
        role: "tool",
        turnId: event.turnId,
        toolCallId: toolUpdate.toolCallId,
        title: toolUpdate.title ?? existing?.title ?? "Agent tool",
        toolKind: toolUpdate.toolKind ?? existing?.toolKind ?? "other",
        status: toolUpdate.status ?? existing?.status ?? "pending",
        locations: toolUpdate.locations ?? existing?.locations ?? [],
        changeState: toolUpdate.changeState ?? existing?.changeState ?? null,
        content: toolUpdate.content ?? existing?.content ?? [],
      };
      if (index < 0) return [...current, tool];
      return current.map((item, itemIndex) => itemIndex === index ? tool : item);
    });
  } else if (event.update.kind === "failed") {
    const failureMessage = event.update.message;
    setMessages((current) => [
      ...finalizeToolItems(current, event.turnId, "failed"),
      {
        id: `status-${event.turnId}`,
        role: "status",
        tone: "error",
        turnId: event.turnId,
        text: `Turn failed. ${failureMessage}`,
      },
    ]);
  } else if (event.update.stopReason !== "end-turn") {
    const stopReason = event.update.stopReason;
    const notices = {
      cancelled: { text: "Turn cancelled.", tone: "neutral" },
      refusal: { text: "The agent refused this turn.", tone: "warning" },
      "max-tokens": { text: "The agent reached its token limit.", tone: "warning" },
      "max-turn-requests": {
        text: "The agent reached its turn-request limit.",
        tone: "warning",
      },
      unknown: { text: "The agent stopped for an unknown reason.", tone: "warning" },
    } as const;
    // The wire value can drift from the typed union (it once arrived as
    // snake_case and unmounted the whole app); never let this lookup throw.
    const stop = notices[stopReason in notices ? stopReason : "unknown"];
    setMessages((current) => [
      ...(stopReason === "cancelled"
        ? finalizeToolItems(current, event.turnId, "cancelled")
        : current),
      {
        id: `status-${event.turnId}`,
        role: "status",
        tone: stop.tone,
        turnId: event.turnId,
        text: stop.text,
      },
    ]);
  }
}

export function finalizeToolItems(
  items: readonly ConversationItem[],
  turnId: string,
  status: "failed" | "cancelled",
): ConversationItem[] {
  return items.map((item) =>
    item.role === "tool" && item.turnId === turnId &&
      (item.status === "pending" || item.status === "in-progress")
      ? { ...item, status }
      : item);
}

export interface ConversationItemViewProps {
  item: ConversationItem;
  conceptIds: readonly string[];
  onOpenConcept: (conceptId: string) => void;
  onRetry?: () => void;
  isRetrying: boolean;
  retryError: string | null;
  onGenerateProposal?: () => void;
  generationBlockedReason: string | null;
  generationError: string | null;
  isGeneratingProposal: boolean;
  showResponseActions?: boolean;
  /** Still being written; only the live message gets the smoothed reveal. */
  isStreaming?: boolean;
  reduceMotion?: boolean;
}

export function ConversationItemView({
  item,
  conceptIds,
  onOpenConcept,
  onRetry,
  isRetrying,
  retryError,
  onGenerateProposal,
  generationBlockedReason,
  generationError,
  isGeneratingProposal,
  showResponseActions = true,
  isStreaming = false,
  reduceMotion = false,
}: ConversationItemViewProps) {
  if (item.role === "plan") return <PlanCard plan={item} />;
  if (item.role === "tool") {
    return (
      <ToolCard
        tool={item}
        conceptIds={conceptIds}
        onOpenConcept={onOpenConcept}
      />
    );
  }
  return (
    <Message
      message={item}
      onRetry={onRetry}
      isRetrying={isRetrying}
      retryError={retryError}
      onGenerateProposal={onGenerateProposal}
      generationBlockedReason={generationBlockedReason}
      generationError={generationError}
      isGeneratingProposal={isGeneratingProposal}
      showResponseActions={showResponseActions}
      isStreaming={isStreaming}
      reduceMotion={reduceMotion}
    />
  );
}

/**
 * Tool-call rendering follows Zed's agent panel: most calls are one quiet
 * dim row (icon + title) that lets the agent's prose stay the document, while
 * mutating calls (edit/delete/move) and commands get a bordered card with a
 * header strip so changes and executions stand out from lookups.
 */
const TOOL_KIND_META = {
  read: { label: "Read", icon: Search, shape: "row" },
  edit: { label: "Edit", icon: Pencil, shape: "card" },
  delete: { label: "Delete", icon: Trash2, shape: "card" },
  move: { label: "Move", icon: ArrowRightLeft, shape: "card" },
  search: { label: "Search", icon: Search, shape: "row" },
  execute: { label: "Command", icon: Terminal, shape: "card" },
  think: { label: "Reasoning", icon: Brain, shape: "row" },
  fetch: { label: "Fetch", icon: Globe, shape: "row" },
  "switch-mode": { label: "Mode", icon: SlidersHorizontal, shape: "row" },
  other: { label: "Tool", icon: Hammer, shape: "row" },
  unknown: { label: "Tool", icon: Hammer, shape: "row" },
} as const;

const TOOL_STATUS_LABEL = {
  pending: "Pending",
  "in-progress": "Running",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
  unknown: "Status unknown",
} as const;

/** One unified-diff line's display class: added, removed, hunk header, context. */
function diffLineClass(line: string): string {
  if (line.startsWith("+")) return "agent-tool__diff-line--added";
  if (line.startsWith("-")) return "agent-tool__diff-line--removed";
  if (line.startsWith("@@")) return "agent-tool__diff-line--hunk";
  return "agent-tool__diff-line--context";
}

/**
 * Zed-style inline tool content: a reported file diff rendered line-by-line
 * with added/removed tinting, or a mono block of output text. The host bounds
 * both and marks truncation.
 */
function ToolContent({ content }: { content: ConversationTool["content"] }) {
  if (content.length === 0) return null;
  return (
    <>
      {content.map((item, index) =>
        item.kind === "diff" ? (
          <div key={`diff-${item.path}-${index}`} className="agent-tool__diff">
            <small className="agent-tool__diff-path" title={item.path}>{item.path}</small>
            <pre>
              {item.diff.replace(/\n$/, "").split("\n").map((line, lineIndex) => (
                <span
                  // Line identity is positional within one immutable snapshot.
                  key={lineIndex}
                  className={`agent-tool__diff-line ${diffLineClass(line)}`}
                >
                  {line}
                  {"\n"}
                </span>
              ))}
            </pre>
            {item.truncated && <small>Diff truncated for display.</small>}
          </div>
        ) : (
          <div key={`text-${index}`} className="agent-tool__output">
            <pre>{item.text}</pre>
            {item.truncated && <small>Output truncated for display.</small>}
          </div>
        ),
      )}
    </>
  );
}

function ToolChangeState({ tool }: { tool: ConversationTool }) {
  if (!tool.changeState) return null;
  return (
    <small
      className={`agent-tool__change agent-tool__change--${tool.changeState}`}
      title={tool.changeState === "staged"
        ? "Studio accepted this reported change for review. It is not applied."
        : "Studio did not accept this reported change. Check the thread grant and staging limits."}
    >
      {tool.changeState === "staged" ? "Staged" : "Not staged"}
    </small>
  );
}

export interface ToolCardProps {
  tool: ConversationTool;
  conceptIds?: readonly string[];
  onOpenConcept?: (conceptId: string) => void;
}

export function ToolCard({
  tool,
  conceptIds = [],
  onOpenConcept,
}: ToolCardProps) {
  const meta = TOOL_KIND_META[tool.toolKind];
  const KindIcon = meta.icon;
  // Completed is the resting state and stays silent (the row itself is the
  // record); only the exceptional ends get spelled out.
  const statusNote = tool.status === "failed" || tool.status === "cancelled"
    ? TOOL_STATUS_LABEL[tool.status]
    : null;

  // A call that reported content (a diff, output text) always renders as a
  // card so the content has a body to live in — Zed's expandable-entry rule.
  if (meta.shape === "row" && tool.content.length === 0) {
    // Keep title-duplicating locations quiet unless they are the safe reader
    // navigation target. A navigable target must remain discoverable.
    const soleLocation = tool.locations.length === 1 ? tool.locations[0] : null;
    const soleConceptId = soleLocation
      ? conceptIdForToolLocation(soleLocation, conceptIds)
      : null;
    const titleIsConceptLink = soleConceptId !== null && onOpenConcept !== undefined &&
      soleLocation !== null && tool.title.includes(soleLocation.path);
    const showSoleLocation = soleLocation !== null && !tool.title.includes(soleLocation.path);
    return (
      <article
        className={`agent-tool agent-tool--row agent-tool--${tool.status}`}
        aria-label={`Tool: ${tool.title}`}
      >
        <span className="agent-tool__icon" aria-hidden="true">
          <KindIcon size={14} />
        </span>
        {titleIsConceptLink ? (
          <button
            type="button"
            className="agent-tool__title agent-tool__location-link"
            title={`Open ${tool.title} in reader`}
            onClick={() => onOpenConcept(soleConceptId)}
          >
            {tool.title}
          </button>
        ) : (
          <span className="agent-tool__title" title={tool.title}>{tool.title}</span>
        )}
        {showSoleLocation && (
          <ToolLocation
            location={soleLocation}
            conceptId={soleConceptId}
            className="agent-tool__inline-location"
            onOpenConcept={onOpenConcept}
          />
        )}
        {statusNote && <small className="agent-tool__status">{statusNote}</small>}
        <ToolChangeState tool={tool} />
        {tool.locations.length > 1 && (
          <ToolLocations
            locations={tool.locations}
            conceptIds={conceptIds}
            onOpenConcept={onOpenConcept}
          />
        )}
      </article>
    );
  }

  const isCommand = tool.toolKind === "execute";
  const hasBody = isCommand || tool.content.length > 0 ||
    tool.locations.length > 0 || tool.changeState !== null;
  const expandedByDefault = tool.status === "pending" || tool.status === "in-progress" ||
    tool.status === "failed";
  return (
    <details
      className={`agent-tool agent-tool--card agent-tool--${tool.status}`}
      aria-label={`Tool: ${tool.title}`}
      open={expandedByDefault}
    >
      <summary>
        <span className="agent-tool__icon" aria-hidden="true">
          <KindIcon size={14} />
        </span>
        {isCommand && <span className="agent-tool__kind">{meta.label}</span>}
        <span className="agent-tool__title" title={tool.title}>{tool.title}</span>
        <ToolChangeState tool={tool} />
        {statusNote && <small className="agent-tool__status">{statusNote}</small>}
        <ChevronDown className="agent-tool__chevron" size={14} aria-hidden="true" />
      </summary>
      {hasBody && (
        <div className="agent-tool__body">
          <ToolContent content={tool.content} />
          <ToolLocations
            locations={tool.locations}
            conceptIds={conceptIds}
            onOpenConcept={onOpenConcept}
          />
        </div>
      )}
    </details>
  );
}

export function toolLocationLabel(location: AgentToolLocationInfo): string {
  return location.line === null ? location.path : `${location.path}:${location.line}`;
}

interface ToolLocationProps {
  location: AgentToolLocationInfo;
  conceptId: string | null;
  className?: string;
  onOpenConcept?: (conceptId: string) => void;
}

function ToolLocation({
  location,
  conceptId,
  className = "",
  onOpenConcept,
}: ToolLocationProps) {
  const label = toolLocationLabel(location);
  if (conceptId && onOpenConcept) {
    return (
      <button
        type="button"
        className={`agent-tool__location-link ${className}`}
        title={`Open ${label} in reader`}
        onClick={() => onOpenConcept(conceptId)}
      >
        {className !== "agent-tool__inline-location" && (
          <FileText size={12} aria-hidden="true" />
        )}
        <span>{label}</span>
      </button>
    );
  }
  return (
    <span className={className} title={label}>
      {className !== "agent-tool__inline-location" && (
        <FileText size={12} aria-hidden="true" />
      )}
      <span>{label}</span>
    </span>
  );
}

export interface ToolLocationsProps {
  locations: readonly AgentToolLocationInfo[];
  conceptIds?: readonly string[];
  onOpenConcept?: (conceptId: string) => void;
}

export function ToolLocations({
  locations,
  conceptIds = [],
  onOpenConcept,
}: ToolLocationsProps) {
  if (locations.length === 0) return null;
  if (locations.length === 1) {
    return (
      <small className="agent-tool__location">
        <ToolLocation
          location={locations[0]}
          conceptId={conceptIdForToolLocation(locations[0], conceptIds)}
          onOpenConcept={onOpenConcept}
        />
      </small>
    );
  }
  return (
    <details className="agent-tool__locations">
      <summary>{locations.length} locations</summary>
      <ul>
        {locations.map((location) => {
          const label = toolLocationLabel(location);
          return (
            <li key={label}>
              <ToolLocation
                location={location}
                conceptId={conceptIdForToolLocation(location, conceptIds)}
                onOpenConcept={onOpenConcept}
              />
            </li>
          );
        })}
      </ul>
    </details>
  );
}

export function planProgressLabel(plan: ConversationPlan): string {
  const completed = plan.entries.filter((entry) => entry.status === "completed").length;
  const remaining = plan.entries.length - completed;
  return `${completed} complete · ${remaining} remaining`;
}

export function LivePlan({ plan }: { plan: ConversationPlan }) {
  const current = plan.entries.find((entry) => entry.status === "in-progress") ??
    plan.entries.find((entry) => entry.status === "pending") ?? plan.entries.at(-1);
  return (
    <details className="agent-live-plan" open>
      <summary>
        <span className="agent-plan__icon" aria-hidden="true">
          <ListChecks size={15} />
        </span>
        <span>
          <strong>Plan</strong>
          <span title={current?.content}>{current?.content ?? "Waiting for the next step"}</span>
        </span>
        <small>{planProgressLabel(plan)}</small>
      </summary>
      <PlanEntries entries={plan.entries} />
    </details>
  );
}

export function PlanCard({ plan }: { plan: ConversationPlan }) {
  const completed = plan.entries.filter((entry) => entry.status === "completed").length;
  const isComplete = completed === plan.entries.length;
  return (
    <details className="agent-plan" aria-label="Agent plan" open={!isComplete}>
      <summary>
        <span className="agent-plan__icon" aria-hidden="true">
          <ListChecks size={16} />
        </span>
        <strong>{isComplete ? "Plan completed" : "Plan"}</strong>
        <small>{completed} of {plan.entries.length} complete</small>
        <ChevronDown className="agent-plan__chevron" size={14} aria-hidden="true" />
      </summary>
      <PlanEntries entries={plan.entries} />
    </details>
  );
}

export function PlanEntries({ entries }: { entries: readonly AgentPlanEntryInfo[] }) {
  return (
    <ol>
      {entries.map((entry, index) => {
        const status = ({
          pending: { label: "Pending", icon: Circle },
          "in-progress": { label: "In progress", icon: CircleDot },
          completed: { label: "Completed", icon: Check },
          unknown: { label: "Status unknown", icon: CircleAlert },
        } as const)[entry.status];
        const StatusIcon = status.icon;
        return (
          <li
            key={`${entry.content}-${entry.priority}-${index}`}
            className={`agent-plan__entry agent-plan__entry--${entry.status}`}
          >
            <StatusIcon size={14} aria-hidden="true" />
            <span>{entry.content}</span>
            <small title={`${entry.priority} priority`}>{status.label}</small>
          </li>
        );
      })}
    </ol>
  );
}

export interface MessageProps {
  message: ConversationMessage;
  onRetry?: () => void;
  isRetrying: boolean;
  retryError: string | null;
  onGenerateProposal?: () => void;
  generationBlockedReason: string | null;
  generationError: string | null;
  isGeneratingProposal: boolean;
  showResponseActions?: boolean;
  onReusePrompt?: () => void;
  /** Still being written. Drives the smoothed reveal; a settled message renders
   *  as one parsed document with no spans and no animation. */
  isStreaming?: boolean;
  reduceMotion?: boolean;
}

export function Message({
  message,
  onRetry,
  isRetrying,
  retryError,
  onGenerateProposal,
  generationBlockedReason,
  generationError,
  isGeneratingProposal,
  showResponseActions = true,
  onReusePrompt,
  isStreaming = false,
  reduceMotion = false,
}: MessageProps) {
  const markdownRef = useRef<HTMLDivElement>(null);
  const agentNarrative = message.role === "agent"
    ? bundleProposalNarrative(message.text)
    : message.text;
  const streaming = message.role === "agent" && isStreaming;
  // Smoothed only while streaming. The hook returns the full text the moment
  // that stops, so a finished answer never waits for a buffer to drain.
  const visibleNarrative = useSmoothedStream(agentNarrative, streaming);
  // Only parsed once streaming ends: the growing edge goes through
  // StreamingMarkdown instead, which parses the settled part per closed block
  // rather than per chunk.
  const renderedAgentText = message.role === "agent" && !streaming
    ? { __html: renderMarkdown(agentNarrative) }
    : null;
  const bundleProposal = message.role === "agent"
    ? parseBundleProposal(message.text)
    : { status: "none" } as const;

  // Zed-style document flow: the agent's markdown IS the document (no avatar,
  // no "Agent" label), the user's message sits in a bordered editor-like
  // block, and status notices are quiet icon+text rows.
  return (
    <article
      className={`agent-message agent-message--${message.role}${message.tone ? ` agent-message--${message.tone}` : ""}`}
      {...(message.role === "status" ? { role: "status", "aria-label": message.text } : {})}
    >
      {message.role === "status" && (
        <span className="agent-message__icon" aria-hidden="true">
          <CircleAlert size={15} />
        </span>
      )}
      <div>
        {message.role === "agent" && message.contextSummary && (
          <p className="agent-message__context-summary">
            <Minimize2 size={14} aria-hidden="true" />
            Context summary from /{message.contextSummary.commandName}
          </p>
        )}
        {message.role === "agent" ? (
          streaming ? (
            <StreamingMarkdown text={visibleNarrative} animate={!reduceMotion} />
          ) : agentNarrative ? (
            <div
              ref={markdownRef}
              className="markdown agent-message__markdown"
              // renderMarkdown sanitizes untrusted agent output with DOMPurify.
              dangerouslySetInnerHTML={renderedAgentText ?? undefined}
            />
          ) : null
        ) : <p>{message.text}</p>}
        <BundleProposalPreview
          result={bundleProposal}
          onGenerate={onGenerateProposal}
          generationBlockedReason={generationBlockedReason}
          generationError={generationError}
          isGenerating={isGeneratingProposal}
        />
        {message.role === "agent" && agentNarrative && showResponseActions && (
          <ResponseActions
            selectionRootRef={markdownRef}
            responseText={message.text}
          />
        )}
        {message.role === "user" && onReusePrompt && (
          <div className="agent-message__user-actions">
            <button type="button" className="btn ghost" onClick={onReusePrompt}>
              <CornerUpLeft size={14} aria-hidden="true" />
              Reuse prompt
            </button>
          </div>
        )}
        {onRetry && (
          <div className="agent-message__actions">
            <button
              type="button"
              className="btn ghost"
              disabled={isRetrying}
              onClick={onRetry}
            >
              <RotateCcw size={14} aria-hidden="true" />
              {isRetrying ? "Retrying..." : "Retry turn"}
            </button>
          </div>
        )}
        {retryError && (
          <p className="agent-message__retry-error" role="alert">
            Retry failed. {retryError}
          </p>
        )}
      </div>
    </article>
  );
}
