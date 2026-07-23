import type { Issue } from "@/shared/types.ts";

export type BundleConformanceKind = "ok" | "warning" | "error";

export interface BundleConformance {
  kind: BundleConformanceKind;
  label: string;
  detail: string;
  errors: number;
  warnings: number;
}

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export function getBundleConformance(issues: Issue[]): BundleConformance {
  const errors = issues.filter((issue) => issue.level === "error").length;
  const warnings = issues.filter((issue) => issue.level === "warning").length;

  if (errors > 0) {
    return {
      kind: "error",
      label: "Not conformant",
      detail: warnings > 0
        ? `${plural(errors, "error")} · ${plural(warnings, "warning")}`
        : plural(errors, "error"),
      errors,
      warnings,
    };
  }

  if (warnings > 0) {
    return {
      kind: "warning",
      label: "Conformant with warnings",
      detail: plural(warnings, "warning"),
      errors,
      warnings,
    };
  }

  return {
    kind: "ok",
    label: "Conformant",
    detail: "No OKF issues",
    errors,
    warnings,
  };
}
