import { Cpu, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  LOCAL_MODEL_PRESETS,
  localModelProviderLabel,
  type LocalModelProbe,
  type LocalModelProfile,
  type LocalModelProfileInput,
  type LocalModelProvider,
} from "../agent/local.ts";
import { testLocalModelEndpoint } from "../ipc.ts";

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

export function LocalModelProfiles({
  profiles,
  formOpen,
  onFormOpenChange,
  onProfileSave,
  onProfileRemove,
}: {
  profiles: readonly LocalModelProfile[];
  formOpen: boolean;
  onFormOpenChange: (open: boolean) => void;
  onProfileSave: (input: LocalModelProfileInput) => Promise<void>;
  onProfileRemove: (profileId: string) => Promise<void>;
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
  const providerRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (formOpen) providerRef.current?.focus();
  }, [formOpen]);

  function updateInput(next: LocalModelProfileInput) {
    setInput(next);
    setProbe({ status: "idle" });
    setFormError(undefined);
  }

  function changeProvider(provider: LocalModelProvider) {
    const preset = LOCAL_MODEL_PRESETS[provider];
    updateInput({ name: preset.label, provider, baseUrl: preset.baseUrl });
  }

  async function testDraft() {
    setProbe({ status: "testing" });
    setFormError(undefined);
    try {
      const result = await testLocalModelEndpoint(input);
      setProbe({ status: "passed", inputKey: inputKey(input), result });
    } catch (error: unknown) {
      setProbe({ status: "failed", message: errorMessage(error) });
    }
  }

  async function saveDraft() {
    if (probe.status !== "passed" || probe.inputKey !== inputKey(input)) return;
    setFormError(undefined);
    try {
      await onProfileSave(input);
      onFormOpenChange(false);
      setProbe({ status: "idle" });
    } catch (error: unknown) {
      setFormError(errorMessage(error));
    }
  }

  async function testSaved(profile: LocalModelProfile) {
    setSavedProbe({ profileId: profile.id, state: { status: "testing" } });
    try {
      const result = await testLocalModelEndpoint(profile);
      setSavedProbe({
        profileId: profile.id,
        state: { status: "passed", inputKey: inputKey(profile), result },
      });
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

  return (
    <section className="local-models" aria-labelledby="local-models-title">
      <div className="local-models__heading">
        <div>
          <h3 id="local-models-title">Local model endpoints</h3>
          <p>
            Probe model metadata without sending prompts. Saved profiles contain only a
            name, provider type, and endpoint URL.
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
          <p className="local-model-form__notice">
            Testing performs one bounded model-list request. It sends no bundle content,
            prompt, token, or credential and follows no redirects.
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
            return (
              <li key={profile.id}>
                <Cpu size={16} aria-hidden="true" />
                <div className="local-models__details">
                  <strong>{profile.name}</strong>
                  <span>{localModelProviderLabel(profile.provider)}</span>
                  <code>{profile.baseUrl}</code>
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
                  <div className="local-models__actions">
                    <button
                      type="button"
                      className="btn ghost"
                      disabled={status?.status === "testing"}
                      onClick={() => void testSaved(profile)}
                    >
                      Test
                    </button>
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
        Endpoint setup does not start a model or create an agent session. Studio Agent
        runtime support is a separate explicit connection step.
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
