import { Plug, Plus, TerminalSquare, Trash2, Unplug } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import type {
  AgentConnectionEvent,
  AgentConnectionInfo,
  AgentConnectionMode,
} from "@/agent/connection.ts";
import type { CustomAgentInput, CustomAgentProfile } from "@/agent/custom.ts";
import {
  activeAgentConnections,
  connectCustomAgent,
  disconnectAgent,
  onAgentConnectionState,
} from "@/ipc.ts";

interface CustomAgentProfilesProps {
  bundleRoot: string | null;
  profiles: readonly CustomAgentProfile[];
  restrictedOfflineAvailable: boolean;
  onProfileSave: (input: CustomAgentInput) => Promise<void>;
  onProfileRemove: (profileId: string) => Promise<void>;
  onConnected: (connection: AgentConnectionInfo) => void;
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
  bundleRoot,
  profiles,
  restrictedOfflineAvailable,
  onProfileSave,
  onProfileRemove,
  onConnected,
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
  const [connectionModes, setConnectionModes] = useState<
    Partial<Record<string, AgentConnectionMode>>
  >({});

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

  async function connect(profileId: string, mode: AgentConnectionMode) {
    if (!bundleRoot) return;
    setConnections((current) => ({ ...current, [profileId]: { status: "connecting" } }));
    try {
      const info = await connectCustomAgent(profileId, bundleRoot, mode);
      setConnections((current) =>
        current[profileId]?.status === "connecting"
          ? { ...current, [profileId]: { status: "ready", info } }
          : current,
      );
      onConnected(info);
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
          Standard launches with normal OS access. Restricted offline is available through a
          verified Linux Bubblewrap host for self-contained agents: the bundle and executable are
          read-only, protected paths are hidden, and host network access is disabled. Both modes
          limit inherited environment variables and stop the process tree on Disconnect.
        </p>
      )}

      {profiles.length > 0 && (
        <ul className="custom-agents__list">
          {profiles.map((profile) => {
            const connection = connections[profile.id] ?? DISCONNECTED;
            const connectedInfo = activeConnectionInfo(connection);
            const mode = connectedInfo
              ? connectionMode(connectedInfo)
              : connectionModes[profile.id] ?? "standard";
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
                  <ConnectionStatus bundleRoot={bundleRoot} connection={connection} />
                  {!connectedInfo && !bundleRoot && (
                    <span className="custom-agents__connection">Open an OKF bundle to connect.</span>
                  )}
                </div>
                <div className="custom-agents__actions">
                  <label className="custom-agents__mode">
                    <span aria-hidden="true">Launch</span>
                    <select
                      aria-label={`Launch mode for ${profile.name}`}
                      value={mode}
                      disabled={Boolean(connectedInfo) || connection.status === "connecting"}
                      onChange={(event) => {
                        const nextMode: AgentConnectionMode = event.target.value === "restricted-offline"
                          ? "restricted-offline"
                          : "standard";
                        setConnectionModes((current) => ({
                          ...current,
                          [profile.id]: nextMode,
                        }));
                      }}
                    >
                      <option value="standard">Standard</option>
                      <option value="restricted-offline" disabled={!restrictedOfflineAvailable}>
                        Restricted offline
                      </option>
                    </select>
                  </label>
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
                      disabled={!bundleRoot || connection.status === "connecting"}
                      onClick={() => void connect(profile.id, mode)}
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

function connectionMode(connection: AgentConnectionInfo): AgentConnectionMode {
  return connection.securityScope.profile.id === "external-linux-restricted-offline-v1"
    ? "restricted-offline"
    : "standard";
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

function ConnectionStatus({
  bundleRoot,
  connection,
}: {
  bundleRoot: string | null;
  connection: ProfileConnection;
}) {
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
  const authNotice = !connection.info.authenticated
    ? " Authentication is required before a session can start."
    : "";
  const bundleNotice = connection.info.bundleRoot !== bundleRoot
    ? " This connection belongs to another bundle."
    : "";
  return (
    <span className="custom-agents__connection custom-agents__connection--ready" role="status">
      Connected to {agentName} over ACP v{connection.info.protocolVersion}.{bundleNotice}
      {authNotice}
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
