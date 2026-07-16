import type { AgentPlanEntryInfo, AgentToolLocationInfo, AgentPermissionEvent, AgentPermissionOptionInfo, AgentTurnEvent } from "@/features/agent/connection.ts";
import type { Dispatch, SetStateAction } from "react";
import { Bot, Check, Circle, CircleAlert, CircleDot, FileText, ListChecks, RotateCcw, ShieldQuestion, User, Wrench } from "lucide-react";
import { BundleProposalPreview } from "@/features/agent/components/BundleProposalPreview.tsx";
import { bundleProposalNarrative, parseBundleProposal } from "@/features/agent/bundleProposal.ts";
import { renderMarkdown } from "@/shared/render/markdown.ts";
import { respondAgentPermission } from "@/shared/ipc.ts";
import { useState } from "react";
import type { ConversationMessage, ConversationPlan, ConversationTool, ConversationItem, PendingPermission } from "./types.ts";
import { errorMessage } from "./helpers.ts";
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
  if (event.update.kind === "usage") return;
  if (event.update.kind === "text") {
    const messageId = `agent-${event.turnId}`;
    const chunkText = event.update.text;
    setMessages((current) => {
      const index = current.findIndex((message) =>
        message.role !== "plan" && message.role !== "tool" && message.id === messageId);
      if (index < 0) return [...current, { id: messageId, role: "agent", text: chunkText }];
      return current.map((message, messageIndex) =>
        messageIndex === index && message.role !== "plan" && message.role !== "tool"
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
      const plan: ConversationPlan = { id: planId, role: "plan", entries };
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
  onRetry?: () => void;
  isRetrying: boolean;
  retryError: string | null;
  onGenerateProposal?: () => void;
  generationBlockedReason: string | null;
  generationError: string | null;
  isGeneratingProposal: boolean;
}

export function ConversationItemView({
  item,
  onRetry,
  isRetrying,
  retryError,
  onGenerateProposal,
  generationBlockedReason,
  generationError,
  isGeneratingProposal,
}: ConversationItemViewProps) {
  if (item.role === "plan") return <PlanCard plan={item} />;
  if (item.role === "tool") return <ToolCard tool={item} />;
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
    />
  );
}

export function ToolCard({ tool }: { tool: ConversationTool }) {
  const kindLabel = ({
    read: "Read",
    edit: "Edit",
    delete: "Delete",
    move: "Move",
    search: "Search",
    execute: "Command",
    think: "Reasoning",
    fetch: "Fetch",
    "switch-mode": "Mode",
    other: "Tool",
    unknown: "Tool",
  } as const)[tool.toolKind];
  const statusLabel = ({
    pending: "Pending",
    "in-progress": "Running",
    completed: "Completed",
    failed: "Failed",
    cancelled: "Cancelled",
    unknown: "Status unknown",
  } as const)[tool.status];
  return (
    <article
      className={`agent-tool agent-tool--${tool.status}`}
      aria-label={`Tool: ${tool.title}`}
    >
      <span className="agent-tool__icon" aria-hidden="true">
        <Wrench size={15} />
      </span>
      <div>
        <strong>{tool.title}</strong>
        <small>{kindLabel}</small>
        {tool.changeState && (
          <small
            className={`agent-tool__change agent-tool__change--${tool.changeState}`}
            title={tool.changeState === "staged"
              ? "Studio accepted this reported change for review. It is not applied."
              : "Studio did not accept this reported change. Check the thread grant and staging limits."}
          >
            {tool.changeState === "staged" ? "Change staged for review" : "Change not staged"}
          </small>
        )}
        <ToolLocations locations={tool.locations} />
      </div>
      <small className="agent-tool__status">{statusLabel}</small>
    </article>
  );
}

export function toolLocationLabel(location: AgentToolLocationInfo): string {
  return location.line === null ? location.path : `${location.path}:${location.line}`;
}

export function ToolLocations({ locations }: { locations: readonly AgentToolLocationInfo[] }) {
  if (locations.length === 0) return null;
  if (locations.length === 1) {
    const label = toolLocationLabel(locations[0]);
    return (
      <small className="agent-tool__location" title={label}>
        <FileText size={12} aria-hidden="true" />
        <span>{label}</span>
      </small>
    );
  }
  return (
    <details className="agent-tool__locations">
      <summary>{locations.length} locations</summary>
      <ul>
        {locations.map((location) => {
          const label = toolLocationLabel(location);
          return <li key={label} title={label}>{label}</li>;
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
  return (
    <section className="agent-plan" aria-label="Agent plan">
      <header>
        <span className="agent-plan__icon" aria-hidden="true">
          <ListChecks size={16} />
        </span>
        <div>
          <strong>Plan</strong>
          <small>{completed} of {plan.entries.length} complete</small>
        </div>
      </header>
      <PlanEntries entries={plan.entries} />
    </section>
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
}: MessageProps) {
  const agentNarrative = message.role === "agent"
    ? bundleProposalNarrative(message.text)
    : message.text;
  const renderedAgentText = message.role === "agent"
    ? { __html: renderMarkdown(agentNarrative) }
    : null;
  const bundleProposal = message.role === "agent"
    ? parseBundleProposal(message.text)
    : { status: "none" } as const;
  const label = message.role === "user" ? "You" : message.role === "agent" ? "Agent" : "Turn";
  return (
    <article
      className={`agent-message agent-message--${message.role}${message.tone ? ` agent-message--${message.tone}` : ""}`}
      {...(message.role === "status" ? { role: "status", "aria-label": message.text } : {})}
    >
      <span className="agent-message__icon" aria-hidden="true">
        {message.role === "user" ? (
          <User size={16} />
        ) : message.role === "agent" ? (
          <Bot size={16} />
        ) : (
          <CircleAlert size={16} />
        )}
      </span>
      <div>
        <strong>{label}</strong>
        {message.role === "agent" ? (
          agentNarrative ? (
            <div
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
