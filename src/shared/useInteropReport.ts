import { useEffect, useState } from "react";
import { readInteropReport } from "@/shared/ipc.ts";
import type { Bundle } from "@/shared/types.ts";
import type { InteropReport } from "@/features/bundle/interop.ts";

type InteropReportState =
  | { status: "ready"; bundle: Bundle; report: InteropReport }
  | { status: "error"; bundle: Bundle; message: string };

const requests = new WeakMap<Bundle, Promise<InteropReport>>();

function requestInteropReport(bundle: Bundle): Promise<InteropReport> {
  const current = requests.get(bundle);
  if (current) return current;
  const request = readInteropReport(bundle.root);
  requests.set(bundle, request);
  return request;
}

export function useInteropReport(bundle: Bundle | null): {
  status: "idle" | "loading" | "ready" | "error";
  report: InteropReport | null;
  message: string;
} {
  const [state, setState] = useState<InteropReportState | null>(null);

  useEffect(() => {
    if (!bundle) return;
    let current = true;
    void requestInteropReport(bundle).then(
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
              : "Studio could not inspect bundle connections.",
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
