import { useEffect, useState } from "react";
import { readProfileReport } from "@/shared/ipc.ts";
import type { Bundle, ProfileReport } from "@/shared/types.ts";

type ProfileReportState =
  | { status: "ready"; bundle: Bundle; report: ProfileReport }
  | { status: "error"; bundle: Bundle; message: string };

const requests = new WeakMap<Bundle, Promise<ProfileReport>>();

function requestProfileReport(bundle: Bundle): Promise<ProfileReport> {
  const current = requests.get(bundle);
  if (current) return current;
  const request = readProfileReport(bundle.root);
  requests.set(bundle, request);
  return request;
}

export function useProfileReport(bundle: Bundle | null): {
  status: "idle" | "loading" | "ready" | "error";
  report: ProfileReport | null;
  message: string;
} {
  const [state, setState] = useState<ProfileReportState | null>(null);

  useEffect(() => {
    if (!bundle) return;
    let current = true;
    void requestProfileReport(bundle).then(
      (report) => {
        if (current) setState({ status: "ready", bundle, report });
      },
      (cause: unknown) => {
        if (current) {
          setState({
            status: "error",
            bundle,
            message: cause instanceof Error
              ? cause.message
              : "Studio could not inspect profile relationships.",
          });
        }
      },
    );
    return () => {
      current = false;
    };
  }, [bundle]);

  if (!bundle) return { status: "idle", report: null, message: "" };
  if (state?.bundle !== bundle) {
    return { status: "loading", report: null, message: "" };
  }
  if (state.status === "ready") {
    return { status: "ready", report: state.report, message: "" };
  }
  return { status: "error", report: null, message: state.message };
}
