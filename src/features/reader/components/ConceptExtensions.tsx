import { CircleCheck, Download, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { exportOkfSidecar } from "@/shared/ipc.ts";
import {
  formatInteropBytes,
  sidecarNeedsAttention,
} from "@/features/bundle/interop.ts";
import type {
  InteropReport,
  LanguageVariantGroup,
  SidecarResource,
} from "@/features/bundle/interop.ts";
import "./ConceptExtensions.css";

export function ConceptLanguageSelect({
  conceptId,
  report,
  onSelect,
}: {
  conceptId: string;
  report: InteropReport;
  onSelect: (conceptId: string) => void;
}) {
  const group = languageGroupForConcept(report, conceptId);
  if (!group || group.variants.length < 2) return null;

  return (
    <label className="concept-language">
      <span>Language</span>
      <select
        aria-label="Concept language"
        value={conceptId}
        onChange={(event) => onSelect(event.target.value)}
      >
        {group.variants.map((variant) => (
          <option key={variant.conceptId} value={variant.conceptId}>
            {variant.language.toUpperCase()} · {variant.title}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ConceptResources({
  bundleRoot,
  conceptId,
  report,
}: {
  bundleRoot: string;
  conceptId: string;
  report: InteropReport;
}) {
  const resources = report.sidecars.filter((sidecar) => sidecar.conceptId === conceptId);
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (resources.length === 0) return null;

  async function saveCopy(resource: SidecarResource) {
    setBusyPath(resource.path);
    setNotice(null);
    try {
      const destination = await exportOkfSidecar(
        bundleRoot,
        resource.conceptId,
        resource.path,
      );
      if (destination) setNotice(`Saved ${destination}.`);
    } catch (cause: unknown) {
      setNotice(cause instanceof Error ? cause.message : String(cause));
    }
    setBusyPath(null);
  }

  return (
    <section className="rail-module concept-resources">
      <h3 className="rail-title">
        Resources
        <span className="rail-count">{resources.length}</span>
      </h3>
      <ul>
        {resources.map((resource) => {
          const needsAttention = sidecarNeedsAttention(resource);
          return (
            <li key={resource.path}>
              <div className="concept-resource__head">
                <span aria-hidden="true" data-status={resource.status}>
                  {needsAttention
                    ? <TriangleAlert size={14} />
                    : <CircleCheck size={14} />}
                </span>
                <strong title={resource.path}>{resource.path}</strong>
              </div>
              <span>{resource.mediaType} · {formatInteropBytes(resource.size)}</span>
              <small>{resource.message}</small>
              {resource.status === "ready" ? (
                <button
                  type="button"
                  disabled={busyPath !== null}
                  onClick={() => void saveCopy(resource)}
                >
                  <Download size={14} aria-hidden="true" />
                  {busyPath === resource.path ? "Saving…" : "Save copy"}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {notice ? <p className="concept-resources__notice" role="status">{notice}</p> : null}
    </section>
  );
}

export function languageGroupForConcept(
  report: InteropReport,
  conceptId: string,
): LanguageVariantGroup | null {
  return report.multilingual.groups.find((group) =>
    group.variants.some((variant) => variant.conceptId === conceptId)) ?? null;
}
