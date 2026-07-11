import { Plus, TerminalSquare, Trash2 } from "lucide-react";
import { useActionState, useState } from "react";
import type { CustomAgentInput, CustomAgentProfile } from "../agent/custom.ts";

interface CustomAgentProfilesProps {
  profiles: readonly CustomAgentProfile[];
  onProfileSave: (input: CustomAgentInput) => Promise<void>;
  onProfileRemove: (profileId: string) => Promise<void>;
}

type FormState = { status: "idle" } | { status: "error"; message: string };

function text(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

function lines(value: FormDataEntryValue | null): string[] {
  return text(value)
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

function validAbsolutePath(path: string): boolean {
  return path.startsWith("/") || /^[A-Za-z]:[\\/]/u.test(path) || path.startsWith("\\\\");
}

function validateInput(input: CustomAgentInput): string | null {
  if (!input.name || input.name.length > 80) return "Enter a name of up to 80 characters.";
  if (!validAbsolutePath(input.executable)) return "Use an absolute executable path.";
  if (input.environment.some((name) => !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(name))) {
    return "Environment entries must be variable names without values.";
  }
  return null;
}

export function CustomAgentProfiles({
  profiles,
  onProfileSave,
  onProfileRemove,
}: CustomAgentProfilesProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [removeState, setRemoveState] = useState<
    { status: "idle" } | { status: "removing"; profileId: string } | { status: "error"; message: string }
  >({ status: "idle" });

  async function remove(profileId: string) {
    setRemoveState({ status: "removing", profileId });
    try {
      await onProfileRemove(profileId);
      setRemoveState({ status: "idle" });
    } catch (error: unknown) {
      setRemoveState({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return (
    <section className="custom-agents" aria-labelledby="custom-agents-title">
      <div className="custom-agents__heading">
        <div>
          <h3 id="custom-agents-title">Custom ACP commands</h3>
          <p>Register a local ACP executable. Studio stores argv, never a shell command.</p>
        </div>
        {!isAdding && (
          <button type="button" className="btn" onClick={() => setIsAdding(true)}>
            <Plus size={16} aria-hidden="true" />
            Add command
          </button>
        )}
      </div>

      {profiles.length > 0 && (
        <ul className="custom-agents__list">
          {profiles.map((profile) => (
            <li key={profile.id}>
              <TerminalSquare size={18} aria-hidden="true" />
              <div>
                <strong>{profile.name}</strong>
                <code title={profile.executable}>{profile.executable}</code>
                <span>
                  {profile.arguments.length} argument(s), {profile.environment.length} inherited variable(s). Not connected.
                </span>
              </div>
              <button
                type="button"
                className="btn ghost icon"
                aria-label={`Remove ${profile.name}`}
                disabled={removeState.status === "removing"}
                onClick={() => void remove(profile.id)}
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {removeState.status === "error" && (
        <p className="custom-agents__error" role="alert">
          Studio could not remove the command. {removeState.message}
        </p>
      )}

      {isAdding && (
        <CustomAgentForm
          onCancel={() => setIsAdding(false)}
          onProfileSave={async (input) => {
            await onProfileSave(input);
            setIsAdding(false);
          }}
        />
      )}
    </section>
  );
}

function CustomAgentForm({
  onCancel,
  onProfileSave,
}: {
  onCancel: () => void;
  onProfileSave: (input: CustomAgentInput) => Promise<void>;
}) {
  const [state, action, isPending] = useActionState<FormState, FormData>(
    async (_previous, formData) => {
      const input: CustomAgentInput = {
        name: text(formData.get("name")).trim(),
        executable: text(formData.get("executable")).trim(),
        arguments: lines(formData.get("arguments")),
        environment: lines(formData.get("environment")),
      };
      const validationError = validateInput(input);
      if (validationError) return { status: "error", message: validationError };
      try {
        await onProfileSave(input);
        return { status: "idle" };
      } catch (error: unknown) {
        return {
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },
    { status: "idle" },
  );

  return (
    <form className="custom-agent-form" action={action}>
      <label>
        <span>Name</span>
        <input name="name" required maxLength={80} autoComplete="off" />
      </label>
      <label>
        <span>Executable</span>
        <input
          name="executable"
          required
          maxLength={4096}
          autoComplete="off"
          spellCheck={false}
          placeholder="C:\\tools\\agent.exe or /opt/tools/agent"
        />
      </label>
      <label>
        <span>Arguments, one per line</span>
        <textarea name="arguments" rows={3} spellCheck={false} placeholder="--stdio" />
      </label>
      <label>
        <span>Inherited environment variable names, one per line</span>
        <textarea name="environment" rows={3} spellCheck={false} placeholder="MODEL_PATH" />
      </label>
      <p className="custom-agent-form__notice">
        Arguments are stored as plain text. Put no tokens or passwords here. Studio stores variable names, not their values.
      </p>
      {state.status === "error" && (
        <p className="custom-agents__error" role="alert">
          {state.message}
        </p>
      )}
      <div className="custom-agent-form__actions">
        <button type="button" className="btn ghost" disabled={isPending} onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn" disabled={isPending}>
          {isPending ? "Saving…" : "Save command"}
        </button>
      </div>
    </form>
  );
}
