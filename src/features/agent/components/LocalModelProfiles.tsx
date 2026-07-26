import { Cpu, Plug, Plus, RefreshCw, Trash2, Unplug } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AgentConnectionInfo } from "@/features/agent/connection.ts";
import { useAgentConnections } from "@/features/agent/useAgentConnections.ts";
import {
  LOCAL_MODEL_PRESETS,
  localModelProviderLabel,
  type LocalModelProbe,
  type LocalModelProfile,
  type LocalModelProfileInput,
  type LocalModelProvider,
} from "@/features/agent/local.ts";
import {
  connectLocalModel,
  disconnectAgent,
  testLocalModelEndpoint,
  testSavedLocalModelEndpoint,
} from "@/shared/ipc.ts";
import "./AgentConnectionCatalog.css";

type ProbeState =
  | { status: "idle" }
  | { status: "testing" }
  | { status: "passed"; inputKey: string; result: LocalModelProbe }
  | { status: "failed"; message: string };

const DEFAULT_PROVIDER: LocalModelProvider = "ollama";

function inputKey(input: LocalModelProfileInput): string {
  return JSON.stringify([input.name.trim(), input.provider, input.baseUrl.trim()]);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function enteredApiKey(input: HTMLInputElement | null): string | undefined {
  const value = input?.value;
  return value === undefined || value === "" ? undefined : value;
}

export function LocalModelProfiles({
  profiles,
  formOpen,
  onFormOpenChange,
  onProfileSave,
  onProfileRemove,
  onConnected,
}: {
  profiles: readonly LocalModelProfile[];
  formOpen: boolean;
  onFormOpenChange: (open: boolean) => void;
  onProfileSave: (input: LocalModelProfileInput) => Promise<void>;
  onProfileRemove: (profileId: string) => Promise<void>;
  onConnected: (connection: AgentConnectionInfo) => void;
}) {
  const [input, setInput] = useState<LocalModelProfileInput>({
    name: LOCAL_MODEL_PRESETS[DEFAULT_PROVIDER].label,
    provider: DEFAULT_PROVIDER,
    baseUrl: LOCAL_MODEL_PRESETS[DEFAULT_PROVIDER].baseUrl,
  });
  const [probe, setProbe] = useState<ProbeState>({ status: "idle" });
  const [savedProbe, setSavedProbe] = useState<
    { profileId: string; state: ProbeState } | undefined
  >();
  const [formError, setFormError] = useState<string>();
  const [selectedModels, setSelectedModels] = useState<Partial<Record<string, string>>>({});
  const [connectionState, setConnectionState] = useState<
    | { status: "idle" }
    | { status: "connecting" | "disconnecting"; profileId: string }
    | { status: "failed"; profileId: string; message: string }
  >({ status: "idle" });
  const connections = useAgentConnections();
  const providerRef = useRef<HTMLSelectElement>(null);
  const credentialRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (formOpen) providerRef.current?.focus();
  }, [formOpen]);

  function updateInput(next: LocalModelProfileInput) {
    setInput(next);
    setProbe({ status: "idle" });
    setFormError(undefined);
  }

  function changeProvider(provider: LocalModelProvider) {
    if (credentialRef.current) credentialRef.current.value = "";
    const preset = LOCAL_MODEL_PRESETS[provider];
    updateInput({ name: preset.label, provider, baseUrl: preset.baseUrl });
  }

  async function testDraft() {
    setProbe({ status: "testing" });
    setFormError(undefined);
    try {
      const result = await testLocalModelEndpoint({
        ...input,
        apiKey: enteredApiKey(credentialRef.current),
      });
      setProbe({ status: "passed", inputKey: inputKey(input), result });
    } catch (error: unknown) {
      setProbe({ status: "failed", message: errorMessage(error) });
    }
  }

  async function saveDraft() {
    if (probe.status !== "passed" || probe.inputKey !== inputKey(input)) return;
    setFormError(undefined);
    try {
      await onProfileSave({
        ...input,
        apiKey: enteredApiKey(credentialRef.current),
      });
      onFormOpenChange(false);
      setProbe({ status: "idle" });
    } catch (error: unknown) {
      setFormError(errorMessage(error));
    }
  }

  async function testSaved(profile: LocalModelProfile) {
    setSavedProbe({ profileId: profile.id, state: { status: "testing" } });
    try {
      const result = await testSavedLocalModelEndpoint(profile.id);
      setSavedProbe({
        profileId: profile.id,
        state: { status: "passed", inputKey: inputKey(profile), result },
      });
      setSelectedModels((current) => ({
        ...current,
        [profile.id]: result.models.includes(current[profile.id] ?? "")
          ? current[profile.id]
          : result.models.length > 0 ? result.models[0] : "",
      }));
    } catch (error: unknown) {
      setSavedProbe({
        profileId: profile.id,
        state: { status: "failed", message: errorMessage(error) },
      });
    }
  }

  async function remove(profileId: string) {
    try {
      await onProfileRemove(profileId);
      if (savedProbe?.profileId === profileId) setSavedProbe(undefined);
    } catch (error: unknown) {
      setSavedProbe({
        profileId,
        state: { status: "failed", message: errorMessage(error) },
      });
    }
  }

  async function connect(profile: LocalModelProfile) {
    const model = selectedModels[profile.id];
    if (!model) return;
    setConnectionState({ status: "connecting", profileId: profile.id });
    try {
      const connection = await connectLocalModel(profile.id, model);
      setConnectionState({ status: "idle" });
      onConnected(connection);
    } catch (error: unknown) {
      setConnectionState({
        status: "failed",
        profileId: profile.id,
        message: errorMessage(error),
      });
    }
  }

  async function disconnect(profileId: string, connectionId: string) {
    setConnectionState({ status: "disconnecting", profileId });
    try {
      await disconnectAgent(connectionId);
      setConnectionState({ status: "idle" });
    } catch (error: unknown) {
      setConnectionState({
        status: "failed",
        profileId,
        message: errorMessage(error),
      });
    }
  }

  return (
    <section className="local-models" aria-labelledby="local-models-title">
      <div className="local-models__heading">
        <div>
          <h3 id="local-models-title">Studio model endpoints</h3>
          <p>
            Connect a local model without credentials, or an OpenAI-compatible service
            with an API key kept by your operating system.
          </p>
        </div>
        {!formOpen && (
          <button
            type="button"
            className="btn"
            onClick={() => onFormOpenChange(true)}
            data-local-model-open
          >
            <Plus size={16} aria-hidden="true" />
            Add endpoint
          </button>
        )}
      </div>

      {formOpen && (
        <form
          className="local-model-form"
          onSubmit={(event) => {
            event.preventDefault();
            void saveDraft();
          }}
        >
          <label>
            Provider
            <select
              ref={providerRef}
              value={input.provider}
              onChange={(event) => changeProvider(event.target.value as LocalModelProvider)}
            >
              {Object.entries(LOCAL_MODEL_PRESETS).map(([value, preset]) => (
                <option value={value} key={value}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Name
            <input
              required
              maxLength={80}
              value={input.name}
              onChange={(event) => updateInput({ ...input, name: event.target.value })}
            />
          </label>
          <label>
            Endpoint
            <input
              required
              type="url"
              maxLength={2048}
              placeholder="http://127.0.0.1:1234"
              value={input.baseUrl}
              onChange={(event) => updateInput({ ...input, baseUrl: event.target.value })}
            />
          </label>
          {input.provider === "open-ai-compatible" && (
            <label>
              <span>
                API key <span className="local-model-form__optional">Optional</span>
              </span>
              <input
                ref={credentialRef}
                type="password"
                maxLength={4096}
                autoComplete="new-password"
                spellCheck={false}
                onInput={() => setProbe({ status: "idle" })}
              />
            </label>
          )}
          <p className="local-model-form__notice">
            Testing performs one bounded model-list request and follows no redirects. If
            supplied, the API key is sent only to this endpoint and saved to the operating
            system credential store when you save the profile.
          </p>
          {probe.status === "testing" && (
            <p className="local-models__status" role="status">
              <RefreshCw size={16} aria-hidden="true" /> Testing endpoint…
            </p>
          )}
          {probe.status === "passed" && <ProbeResult result={probe.result} />}
          {probe.status === "failed" && (
            <p className="local-models__error" role="alert">
              Connection test failed. {probe.message}
            </p>
          )}
          {formError && (
            <p className="local-models__error" role="alert">
              Profile not saved. {formError}
            </p>
          )}
          <div className="local-model-form__actions">
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                onFormOpenChange(false);
                setProbe({ status: "idle" });
                setFormError(undefined);
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn"
              disabled={probe.status === "testing"}
              onClick={() => void testDraft()}
            >
              Test connection
            </button>
            <button
              type="submit"
              className="btn primary"
              disabled={probe.status !== "passed" || probe.inputKey !== inputKey(input)}
            >
              Save endpoint
            </button>
          </div>
        </form>
      )}

      {profiles.length > 0 && (
        <ul className="local-models__list">
          {profiles.map((profile) => {
            const status = savedProbe?.profileId === profile.id ? savedProbe.state : undefined;
            const connection = connections.find(
              (candidate) => candidate.profileId === profile.id,
            );
            const profileConnectionState =
              connectionState.status !== "idle" && connectionState.profileId === profile.id
                ? connectionState
                : undefined;
            return (
              <li key={profile.id}>
                <Cpu size={16} aria-hidden="true" />
                <div className="local-models__details">
                  <strong>{profile.name}</strong>
                  <span>{localModelProviderLabel(profile.provider)}</span>
                  <code>{profile.baseUrl}</code>
                  {profile.hasCredential && (
                    <span>API key stored by the operating system</span>
                  )}
                  {status?.status === "testing" && (
                    <p className="local-models__status" role="status">
                      Testing endpoint…
                    </p>
                  )}
                  {status?.status === "passed" && <ProbeResult result={status.result} />}
                  {status?.status === "failed" && (
                    <p className="local-models__error" role="alert">
                      Connection test failed. {status.message}
                    </p>
                  )}
                  {status?.status === "passed" && status.result.models.length > 0 && !connection && (
                    <label className="local-models__model">
                      Model
                      <select
                        value={selectedModels[profile.id] ?? status.result.models[0]}
                        onChange={(event) =>
                          setSelectedModels((current) => ({
                            ...current,
                            [profile.id]: event.target.value,
                          }))
                        }
                      >
                        {status.result.models.map((model) => (
                          <option value={model} key={model}>{model}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  {connection && (
                    <p className="local-models__connected" role="status">
                      Connected to {connection.agent?.title ?? profile.name}.
                    </p>
                  )}
                  {profileConnectionState?.status === "failed" && (
                    <p className="local-models__error" role="alert">
                      Connection failed. {profileConnectionState.message}
                    </p>
                  )}
                  <div className="local-models__actions">
                    <button
                      type="button"
                      className="btn ghost"
                      disabled={status?.status === "testing"}
                      onClick={() => void testSaved(profile)}
                    >
                      Test
                    </button>
                    {connection ? (
                      <button
                        type="button"
                        className="btn ghost"
                        disabled={profileConnectionState?.status === "disconnecting"}
                        onClick={() => void disconnect(profile.id, connection.connectionId)}
                      >
                        <Unplug size={16} aria-hidden="true" />
                        {profileConnectionState?.status === "disconnecting"
                          ? "Disconnecting..."
                          : "Disconnect"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn"
                        disabled={
                          status?.status !== "passed" ||
                          status.result.models.length === 0 ||
                          profileConnectionState?.status === "connecting"
                        }
                        onClick={() => void connect(profile)}
                      >
                        <Plug size={16} aria-hidden="true" />
                        {profileConnectionState?.status === "connecting"
                          ? "Connecting..."
                          : "Connect"}
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn ghost"
                      aria-label={`Remove ${profile.name}`}
                      onClick={() => void remove(profile.id)}
                    >
                      <Trash2 size={16} aria-hidden="true" /> Remove
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="local-models__execution-notice">
        Connect starts a Studio Agent using the selected model. Tool-capable models can load
        packaged OKF guidance, inspect the active bundle, read explicitly attached extracted
        text, and propose reviewed staging through bounded tools. They cannot read arbitrary files
        or write directly to the bundle.
      </p>
    </section>
  );
}

function ProbeResult({ result }: { result: LocalModelProbe }) {
  const shownModels = result.models.slice(0, 5);
  return (
    <div className="local-models__probe" role="status">
      <strong>Endpoint reached</strong>
      {shownModels.length === 0 ? (
        <span>No models are currently available.</span>
      ) : (
        <span>
          {result.models.length} model{result.models.length === 1 ? "" : "s"}: {shownModels.join(", ")}
          {result.models.length > shownModels.length ? `, and ${result.models.length - shownModels.length} more` : ""}
        </span>
      )}
    </div>
  );
}
