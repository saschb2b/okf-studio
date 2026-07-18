import { useEffect, useState } from "react";
import { okfCapabilityCatalog, setOkfCapabilityPackActive } from "@/shared/ipc.ts";
import type { OkfCapabilityCatalogInfo } from "@/shared/ipc.ts";
import "./OkfCapabilitySettings.css";

interface OkfCapabilityCatalogViewProps {
  catalog: OkfCapabilityCatalogInfo;
  busy?: boolean;
  error?: string | null;
  onTogglePack: () => void;
}

export function OkfCapabilityCatalogView({
  catalog,
  busy = false,
  error = null,
  onTogglePack,
}: OkfCapabilityCatalogViewProps) {
  const { pack } = catalog;
  return (
    <>
      <section className="settings-capability-pack" aria-labelledby="okf-pack-title">
        <header>
          <div>
            <h3 id="okf-pack-title">{pack.name}</h3>
            <p>{pack.description}</p>
          </div>
          <span className="settings-capability-pack__status" data-active={pack.active}>
            {pack.active ? "Active" : "Legacy mode"}
          </span>
        </header>
        <dl>
          <dt>Pack</dt>
          <dd><code>{pack.id}@{pack.version}</code></dd>
          <dt>Provenance</dt>
          <dd>{pack.provenance}, published by {pack.publisher}</dd>
          <dt>Compatibility</dt>
          <dd>Studio {pack.compatibility.minimumStudioVersion}+; capability schema {pack.compatibility.capabilitySchemaVersion}; artifact schema {pack.compatibility.artifactSchemaVersion}</dd>
          <dt>Skills</dt>
          <dd>{catalog.capabilities.length} active capabilities</dd>
          <dt>Studio tools</dt>
          <dd>
            <details className="settings-capability-pack__tools">
              <summary>{pack.requiredStudioTools.length} closed tool IDs</summary>
              <span>{pack.requiredStudioTools.join(", ")}</span>
            </details>
          </dd>
          <dt>Templates</dt>
          <dd>{pack.templateIds.join(", ")}</dd>
          <dt>Artifact schemas</dt>
          <dd>{pack.artifactSchemaIds.join(", ")}</dd>
          <dt>Conflicts</dt>
          <dd>{pack.conflicts.length > 0 ? pack.conflicts.join(", ") : "None"}</dd>
          <dt>Digest</dt>
          <dd><code>{pack.manifestSha256}</code></dd>
        </dl>
        {!pack.active && (
          <p className="settings-capability-pack__notice" role="status">
            Only the legacy OKF capability is active. Agent profiles, sessions, checkpoints,
            settings, and bundle grants are unchanged.
          </p>
        )}
        {error && <p className="settings-capability-pack__error" role="alert">{error}</p>}
        <button type="button" className="btn" disabled={busy} onClick={onTogglePack}>
          {busy
            ? "Updating capability mode…"
            : pack.active
              ? `Use ${pack.rollbackLabel}`
              : `Restore ${pack.name}`}
        </button>
      </section>
      <p className="settings-capability-manifest muted">
        Capability manifest <code>{catalog.manifestSha256}</code>
      </p>
      <div className="settings-capability-list">
        {catalog.capabilities.map((capability) => (
          <details key={capability.id} className="settings-capability">
            <summary>
              <span>{capability.id}</span>
              <code>v{capability.version}</code>
            </summary>
            <p>{capability.description}</p>
            <dl>
              <dt>Risk</dt>
              <dd>{capability.riskClass}</dd>
              <dt>Tools</dt>
              <dd>{capability.requiredTools.join(", ")}</dd>
              <dt>Artifacts</dt>
              <dd>{capability.artifactKinds.join(", ")}</dd>
            </dl>
            <ul aria-label={`${capability.id} resources`}>
              {capability.resources.map((resource) => (
                <li key={resource.id}>
                  <strong>{resource.label}</strong>
                  <span>{resource.path}</span>
                  <code>{resource.sha256}</code>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </>
  );
}

interface OkfCapabilitySettingsViewProps {
  catalog: OkfCapabilityCatalogInfo | null;
  loadError?: boolean;
  busy?: boolean;
  actionError?: string | null;
  onRetry: () => void;
  onTogglePack: () => void;
}

export function OkfCapabilitySettingsView({
  catalog,
  loadError = false,
  busy = false,
  actionError = null,
  onRetry,
  onTogglePack,
}: OkfCapabilitySettingsViewProps) {
  let content;
  if (loadError) {
    content = (
      <div className="settings-capability-error" role="alert">
        <span>Studio could not inspect its built-in capabilities.</span>
        <button type="button" className="btn" onClick={onRetry}>Retry</button>
      </div>
    );
  } else if (catalog) {
    content = (
      <OkfCapabilityCatalogView
        catalog={catalog}
        busy={busy}
        error={actionError}
        onTogglePack={onTogglePack}
      />
    );
  } else {
    content = (
      <p className="field-hint muted" role="status">
        Inspecting built-in capabilities…
      </p>
    );
  }

  return (
    <section className="settings-capabilities" aria-labelledby="okf-capabilities-title">
      <div>
        <h2 id="okf-capabilities-title" className="field-label">
          OKF capability pack
        </h2>
        <p className="field-hint muted">
          Inspect the declarative skills and contracts Studio makes available to agents.
        </p>
      </div>
      <div className="settings-capability-content">{content}</div>
    </section>
  );
}

export function OkfCapabilitySettings() {
  const [catalog, setCatalog] = useState<OkfCapabilityCatalogInfo | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [request, setRequest] = useState(0);

  useEffect(() => {
    let current = true;
    void okfCapabilityCatalog().then(
      (nextCatalog) => {
        if (current) {
          setCatalog(nextCatalog);
          setLoadError(false);
        }
      },
      () => {
        if (current) setLoadError(true);
      },
    );
    return () => {
      current = false;
    };
  }, [request]);

  async function togglePack() {
    if (!catalog || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      setCatalog(await setOkfCapabilityPackActive(!catalog.pack.active));
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : String(cause));
    }
    setBusy(false);
  }

  return (
    <OkfCapabilitySettingsView
      catalog={catalog}
      loadError={loadError}
      busy={busy}
      actionError={actionError}
      onRetry={() => {
        setLoadError(false);
        setRequest((value) => value + 1);
      }}
      onTogglePack={() => void togglePack()}
    />
  );
}
