import { useEffect, useState } from "react";
import { okfCapabilityCatalog } from "@/shared/ipc.ts";
import type { OkfCapabilityCatalogInfo } from "@/shared/ipc.ts";
import "./OkfCapabilitySettings.css";

function CapabilityCatalog({ catalog }: { catalog: OkfCapabilityCatalogInfo }) {
  return (
    <>
      <p className="settings-capability-manifest muted">
        Manifest <code>{catalog.manifestSha256}</code>
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

export function OkfCapabilitySettings() {
  const [catalog, setCatalog] = useState<OkfCapabilityCatalogInfo | null>(null);
  const [hasError, setHasError] = useState(false);
  const [request, setRequest] = useState(0);

  useEffect(() => {
    let current = true;
    void okfCapabilityCatalog().then(
      (nextCatalog) => {
        if (current) {
          setCatalog(nextCatalog);
          setHasError(false);
        }
      },
      () => {
        if (current) setHasError(true);
      },
    );
    return () => {
      current = false;
    };
  }, [request]);

  let content;
  if (hasError) {
    content = (
      <div className="settings-capability-error" role="alert">
        <span>Studio could not inspect its built-in capabilities.</span>
        <button
          className="btn"
          onClick={() => {
            setHasError(false);
            setRequest((value) => value + 1);
          }}
        >
          Retry
        </button>
      </div>
    );
  } else if (catalog) {
    content = <CapabilityCatalog catalog={catalog} />;
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
          Built-in OKF capabilities
        </h2>
        <p className="field-hint muted">
          Versioned methods available to Studio agents. Detailed guidance loads only when a task needs it.
        </p>
      </div>
      <div className="settings-capability-content">{content}</div>
    </section>
  );
}
