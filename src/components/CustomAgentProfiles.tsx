import { Plug, Plus, TerminalSquare, Trash2, Unplug } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import type { AgentConnectionEvent, AgentConnectionInfo } from "../agent/connection.ts";
import type { CustomAgentInput, CustomAgentProfile } from "../agent/custom.ts";
import {
  activeAgentConnections,
  connectCustomAgent,
  disconnectAgent,
  onAgentConnectionState,
} from "../ipc.ts";

interface CustomAgentProfilesProps {
  profiles: readonly CustomAgentProfile[];
  onProfileSave: (input: CustomAgentInput) => Promise<void>;
  onProfileRemove: (profileId: string) => Promise<void>;
}

type FormState = { status: "idle" } | { status: "error"; message: string };
type ProfileConnection =
  | { status: "disconnected" }
  | { status: "connecting" }
  | { status: "ready"; info: AgentConnectionInfo }
  | { status: "disconnecting"; info: AgentConnectionInfo }
  | { status: "error"; message: string; info?: AgentConnectionInfo };

const DISCONNECTED = { status: "disconnected" } as const satisfies ProfileConnection;

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
  const [connections, setConnections] = useState<Partial<Record<string, ProfileConnection>>>(() =>
    Object.fromEntries(
      activeAgentConnections().map((info) => [info.profileId, { status: "ready", info }]),
    ),
  );
  const [listenerError, setListenerError] = useState<string | null>(null);

  useEffect(() => {
    let stopListening: (() => void) | undefined;
    let isDisposed = false;
    void onAgentConnectionState((event) => {
      setConnections((current) => applyConnectionEvent(current, event));
    }).then(
      (stop) => {
        if (isDisposed) stop();
        else stopListening = stop;
      },
      (error: unknown) => {
        if (!isDisposed) {
          setListenerError(error instanceof Error ? error.message : String(error));
        }
      },
    );
    return () => {
      isDisposed = true;
      stopListening?.();
    };
  }, []);

  async function connect(profileId: string) {
    setConnections((current) => ({ ...current, [profileId]: { status: "connecting" } }));
    try {
      const info = await connectCustomAgent(profileId);
      setConnections((current) =>
        current[profileId]?.status === "connecting"
          ? { ...current, [profileId]: { status: "ready", info } }
          : current,
      );
    } catch (error: unknown) {
      setConnections((current) => ({
        ...current,
        [profileId]: {
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        },
      }));
    }
  }

  async function disconnect(info: AgentConnectionInfo) {
    setConnections((current) => ({
      ...current,
      [info.profileId]: { status: "disconnecting", info },
    }));
    try {
      await disconnectAgent(info.connectionId);
      setConnections((current) => ({ ...current, [info.profileId]: DISCONNECTED }));
    } catch (error: unknown) {
      setConnections((current) => ({
        ...current,
        [info.profileId]: {
          status: "error",
          message: error instanceof Error ? error.message : String(error),
          info,
        },
      }));
    }
  }

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
        <p className="custom-agents__execution-notice">
          Connecting launches the saved executable as an external process. It is not sandboxed;
          Studio limits only its inherited environment and ACP permissions.
        </p>
      )}

      {profiles.length > 0 && (
        <ul className="custom-agents__list">
          {profiles.map((profile) => {
            const connection = connections[profile.id] ?? DISCONNECTED;
            const connectedInfo = activeConnectionInfo(connection);
            return (
              <li key={profile.id}>
                <TerminalSquare size={18} aria-hidden="true" />
                <div className="custom-agents__details">
                  <strong>{profile.name}</strong>
                  <code title={profile.executable}>{profile.executable}</code>
                  <span>
                    {profile.arguments.length} argument(s), {profile.environment.length} inherited
                    variable(s).
                  </span>
                  <ConnectionStatus connection={connection} />
                </div>
                <div className="custom-agents__actions">
                  {connectedInfo ? (
                    <button
                      type="button"
                      className="btn ghost"
                      disabled={connection.status === "disconnecting"}
                      onClick={() => void disconnect(connectedInfo)}
                    >
                      <Unplug size={16} aria-hidden="true" />
                      {connection.status === "disconnecting" ? "Disconnecting..." : "Disconnect"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn"
                      aria-label={`Connect ${profile.name}`}
                      disabled={connection.status === "connecting"}
                      onClick={() => void connect(profile.id)}
                    >
                      <Plug size={16} aria-hidden="true" />
                      {connection.status === "connecting" ? "Connecting..." : "Connect"}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn ghost icon"
                    aria-label={`Remove ${profile.name}`}
                    disabled={
                      removeState.status === "removing" || connection.status === "connecting"
                    }
                    onClick={() => void remove(profile.id)}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {listenerError && (
        <p className="custom-agents__error" role="alert">
          Studio cannot report agent process exits. {listenerError}
        </p>
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

function activeConnectionInfo(connection: ProfileConnection): AgentConnectionInfo | undefined {
  if (connection.status === "ready" || connection.status === "disconnecting") {
    return connection.info;
  }
  return connection.status === "error" ? connection.info : undefined;
}

function applyConnectionEvent(
  current: Partial<Record<string, ProfileConnection>>,
  event: AgentConnectionEvent,
): Partial<Record<string, ProfileConnection>> {
  const existing = current[event.profileId];
  if (
    existing &&
    (existing.status === "ready" || existing.status === "disconnecting") &&
    existing.info.connectionId !== event.connectionId
  ) {
    return current;
  }
  return {
    ...current,
    [event.profileId]:
      event.status === "failed"
        ? { status: "error", message: event.message }
        : DISCONNECTED,
  };
}

function ConnectionStatus({ connection }: { connection: ProfileConnection }) {
  if (connection.status === "disconnected") {
    return <span className="custom-agents__connection">Not connected.</span>;
  }
  if (connection.status === "connecting") {
    return (
      <span className="custom-agents__connection" role="status">
        Starting process and negotiating ACP...
      </span>
    );
  }
  if (connection.status === "error") {
    return (
      <span className="custom-agents__connection custom-agents__error" role="alert">
        Connection failed. {connection.message}
      </span>
    );
  }
  if (connection.status === "disconnecting") {
    return (
      <span className="custom-agents__connection" role="status">
        Stopping agent process...
      </span>
    );
  }
  const agentName = connection.info.agent?.title ?? connection.info.agent?.name ?? "agent";
  const authNotice = connection.info.authMethods.length > 0
    ? " Authentication is required but is not available in Studio yet."
    : "";
  return (
    <span className="custom-agents__connection custom-agents__connection--ready" role="status">
      Connected to {agentName} over ACP v{connection.info.protocolVersion}.{authNotice}
    </span>
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
