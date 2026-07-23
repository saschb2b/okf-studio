import type { OkfContextPlan } from "@/features/agent/taskContext.ts";
import { OKF_TASKS } from "@/features/agent/taskContext.ts";
import { FileText, Network, ShieldCheck, X } from "lucide-react";
import { useId } from "react";
import "./OkfContextPlanCard.css";

export interface OkfContextPlanCardProps {
  plan: OkfContextPlan;
  stale: boolean;
  disabled: boolean;
  editable?: boolean;
  onRemove: (kind: "bundle-object" | "source", id: string) => void;
  onAcceptRefresh: () => void;
  memorySuggestion?: { conceptTitle: string; effect: string } | null;
  memoryError?: string | null;
  onSaveMemory?: () => void;
  onDismissMemory?: () => void;
}

function bytesLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${Math.ceil(bytes / 1024)} KB`;
}

export function OkfContextPlanCard({
  plan,
  stale,
  disabled,
  editable = true,
  onRemove,
  onAcceptRefresh,
  memorySuggestion = null,
  memoryError = null,
  onSaveMemory,
  onDismissMemory,
}: OkfContextPlanCardProps) {
  const titleId = useId();
  const task = OKF_TASKS[plan.taskId];
  return (
    <section className="okf-context-plan" aria-labelledby={titleId}>
      <header>
        <ShieldCheck size={18} aria-hidden="true" />
        <div>
          <strong id={titleId}>{task.title}</strong>
          <span>{plan.bundleFingerprint}</span>
        </div>
        {stale && (
          <button
            type="button"
            className="btn"
            disabled={disabled}
            onClick={onAcceptRefresh}
          >
            Use refreshed plan
          </button>
        )}
      </header>
      {stale && (
        <p className="okf-context-plan__warning" role="alert">
          The bundle changed after this context was accepted. Review and accept the refreshed plan
          before sending another message.
        </p>
      )}
      <dl className="okf-context-plan__scope">
        <div>
          <dt>Capabilities</dt>
          <dd>{plan.capabilityIds.join(", ")}</dd>
        </div>
        <div>
          <dt>Tools</dt>
          <dd>{plan.tools.join(", ")}</dd>
        </div>
        <div>
          <dt>External network</dt>
          <dd>{plan.network ? "In scope" : "Not in scope"}</dd>
        </div>
        <div>
          <dt>Reviewed writes</dt>
          <dd>{plan.writes ? "May stage changes" : "Not in scope"}</dd>
        </div>
      </dl>
      {(plan.objects.length > 0 || plan.sources.length > 0) && (
        <div className="okf-context-plan__items">
          {plan.objects.map((object) => (
            <div key={`object-${object.id}`}>
              <FileText size={14} aria-hidden="true" />
              <span>
                <strong>{object.title}</strong>
                <small>{object.path} · {object.reason.replaceAll("-", " ")}</small>
              </span>
              {editable && !object.required && (
                <button
                  type="button"
                  aria-label={`Remove ${object.title} from the context plan`}
                  disabled={disabled}
                  onClick={() => onRemove("bundle-object", object.id)}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              )}
            </div>
          ))}
          {plan.sources.map((source) => (
            <div key={`source-${source.id}`}>
              <Network size={14} aria-hidden="true" />
              <span>
                <strong>{source.title}</strong>
                <small>{source.origin ?? "Attached evidence"} · {bytesLabel(source.estimatedBytes)}</small>
              </span>
              {editable && !source.required && (
                <button
                  type="button"
                  aria-label={`Remove ${source.title} from the context plan`}
                  disabled={disabled}
                  onClick={() => onRemove("source", source.id)}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {plan.profileContext && (
        <section className="okf-context-plan__profiles" aria-label="Advisory profile guidance">
          <header>
            <strong>Profile guidance</strong>
            <span>Not OKF validation</span>
          </header>
          <p>{plan.profileContext.conformanceBoundary}</p>
          <p>
            {plan.profileContext.edges.length} authored typed edge
            {plan.profileContext.edges.length === 1 ? "" : "s"} included
          </p>
          <ul>
            {plan.profileContext.profiles.map((profile) => {
              const findingCount = plan.profileContext?.diagnostics.filter(
                (diagnostic) => diagnostic.namespace === profile.namespace,
              ).length ?? 0;
              return (
                <li key={profile.namespace}>
                  <details>
                    <summary>
                      <code>{profile.namespace}</code>
                      <span>{profile.version ? `v${profile.version}` : "version unavailable"}</span>
                      <span>{profile.status}</span>
                    </summary>
                    <p>{profile.message}</p>
                    {profile.fields.length > 0 && (
                      <dl>
                        {profile.fields.map((field) => (
                          <div key={field.id}>
                            <dt>
                              <code>{field.key}</code>
                              <span>{field.requirement}</span>
                            </dt>
                            <dd>
                              {field.label} · {field.valueType}
                              {field.examples.length > 0
                                ? ` · examples: ${field.examples.join(", ")}`
                                : ""}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}
                    <small>
                      {profile.relationships.length} relationship
                      {profile.relationships.length === 1 ? "" : "s"}
                      {" · "}
                      {findingCount} current finding{findingCount === 1 ? "" : "s"}
                    </small>
                  </details>
                </li>
              );
            })}
          </ul>
          {plan.profileContext.truncated && (
            <p>Some profile guidance was omitted at the task-context limit.</p>
          )}
        </section>
      )}
      {plan.omissions.length > 0 && (
        <ul className="okf-context-plan__omissions" aria-label="Omitted context">
          {plan.omissions.map((omission) => (
            <li key={`${omission.kind}-${omission.id}`}>
              <code>{omission.id}</code>: {omission.reason.replaceAll("-", " ")}
            </li>
          ))}
        </ul>
      )}
      {memorySuggestion && onSaveMemory && onDismissMemory && (
        <section className="okf-context-plan__memory" aria-label="Workspace memory suggestion">
          <div>
            <strong>Remember this context choice?</strong>
            <span>{memorySuggestion.effect}</span>
            <small>
              User-owned · bundle scoped · revalidated after bundle changes · retained 180 days
            </small>
          </div>
          <div>
            <button type="button" className="btn" disabled={disabled} onClick={onSaveMemory}>
              Remember
            </button>
            <button type="button" className="btn ghost" onClick={onDismissMemory}>
              Not now
            </button>
          </div>
        </section>
      )}
      {memoryError && <p className="okf-context-plan__memory-error" role="alert">{memoryError}</p>}
      <footer>
        <span>
          {bytesLabel(plan.budget.selectedBytes)} of {bytesLabel(plan.budget.maxBytes)} planned ·
          about {plan.budget.selectedEstimatedTokens.toLocaleString()} tokens
        </span>
        <span>
          {plan.validation.errors} errors · {plan.validation.warnings} warnings
        </span>
        {plan.omissions.length > 0 && <span>{plan.omissions.length} optional omitted</span>}
      </footer>
    </section>
  );
}
