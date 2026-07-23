import { EyeOff, FileWarning, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { readIgnoreReport } from "@/shared/ipc.ts";
import type { IgnoreReport } from "@/shared/types.ts";
import "./IgnoreRules.css";

type IgnoreState =
  | { bundleRoot: string; status: "loading" }
  | { bundleRoot: string; status: "ready"; report: IgnoreReport }
  | { bundleRoot: string; status: "error"; message: string };

export function IgnoreRules({ bundleRoot }: { bundleRoot: string }) {
  const [state, setState] = useState<IgnoreState>({
    bundleRoot,
    status: "loading",
  });
  const visibleState: IgnoreState = state.bundleRoot === bundleRoot
    ? state
    : { bundleRoot, status: "loading" };

  useEffect(() => {
    let active = true;
    void readIgnoreReport(bundleRoot).then(
      (report) => {
        if (active) setState({ bundleRoot, status: "ready", report });
      },
      (error: unknown) => {
        if (active) {
          setState({
            bundleRoot,
            status: "error",
            message: error instanceof Error
              ? error.message
              : "Studio could not inspect .okfignore.",
          });
        }
      },
    );
    return () => {
      active = false;
    };
  }, [bundleRoot]);

  return (
    <section className="ignore-rules" aria-labelledby="ignore-rules-title">
      <header>
        <div>
          <h2 id="ignore-rules-title">
            <EyeOff size={15} aria-hidden="true" />
            Ignore rules
          </h2>
          <p>
            {visibleState.status === "loading"
              ? "Inspecting bundle rules…"
              : visibleState.status === "error"
                ? "Rule report unavailable"
                : summary(visibleState.report)}
          </p>
        </div>
        {visibleState.status === "ready" && (
          <span className="ignore-rules__source">
            {visibleState.report.source ?? "Studio defaults"}
          </span>
        )}
      </header>

      <p className="ignore-rules__boundary">
        <ShieldAlert size={14} aria-hidden="true" />
        Ignore rules reduce Studio context and exports. They are not encryption
        or filesystem access control.
      </p>

      {visibleState.status === "error" && (
        <p className="ignore-rules__error" role="alert">
          <FileWarning size={14} aria-hidden="true" />
          {visibleState.message}
        </p>
      )}

      {visibleState.status === "ready" &&
        (visibleState.report.excludedPaths.length > 0 ||
          visibleState.report.diagnostics.length > 0) && (
          <details>
            <summary>
              Inspect exclusions
              <span>{visibleState.report.caseSensitive ? "Case-sensitive" : "Case-insensitive"}</span>
            </summary>
            {visibleState.report.excludedPaths.length > 0 && (
              <ul aria-label="Excluded bundle paths">
                {visibleState.report.excludedPaths.map((path) => (
                  <li key={path}><code>{path}</code></li>
                ))}
              </ul>
            )}
            {visibleState.report.truncated && (
              <p>Only the first {visibleState.report.excludedPaths.length} paths are shown.</p>
            )}
            {visibleState.report.diagnostics.map((diagnostic) => (
              <p className="ignore-rules__diagnostic" key={diagnostic}>
                {diagnostic}
              </p>
            ))}
          </details>
        )}
    </section>
  );
}

function summary(report: IgnoreReport): string {
  if (!report.source) {
    return `${report.excludedCount} default exclusion${report.excludedCount === 1 ? "" : "s"}; no root .okfignore`;
  }
  return `${report.excludedCount} excluded · ${report.ruleCount} root rule${report.ruleCount === 1 ? "" : "s"}`;
}
