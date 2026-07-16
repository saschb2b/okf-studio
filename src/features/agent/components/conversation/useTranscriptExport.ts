import { useState } from "react";
import type { AgentThreadWorkflow } from "@/features/agent/threadMetadata.ts";
import {
  datasetChangeRequirements,
  researchExportRequirements,
  transcriptFilename,
  transcriptMarkdown,
} from "@/features/agent/thread.ts";
import { exportAgentTranscript } from "@/shared/ipc.ts";
import { errorMessage } from "./helpers.ts";
import type { ConversationItem, ExportState, ThreadTitle } from "./types.ts";

interface UseTranscriptExportInput {
  messages: readonly ConversationItem[];
  threadWorkflow: AgentThreadWorkflow;
  threadTitle: ThreadTitle;
  bundleName: string | null;
  agentName: string;
}

/**
 * Owns the transcript-export lifecycle: the workflow export gates (research and
 * dataset-change), the native save, and the resulting idle/exporting/success/
 * error state. It reads conversation inputs and produces no side effects beyond
 * its own state, so it is decoupled from the connection subscription lifecycle.
 */
export function useTranscriptExport({
  messages,
  threadWorkflow,
  threadTitle,
  bundleName,
  agentName,
}: UseTranscriptExportInput) {
  const [exportState, setExportState] = useState<ExportState>({ status: "idle" });

  async function exportTranscript() {
    if (messages.length === 0 || exportState.status === "exporting") return;
    if (threadWorkflow === "deep-research") {
      const requirements = researchExportRequirements(messages);
      if (requirements.length > 0) {
        const missing = requirements.length === 2
          ? "a Sources list with a cited link or bundle path and an Inferences section"
          : requirements[0] === "sources"
            ? "a Sources list with a cited link or bundle path"
            : "an Inferences section";
        setExportState({
          status: "error",
          message: `Research export needs ${missing}. Ask the agent to revise the response. Use None when it made no inference.`,
        });
        return;
      }
    }
    if (threadWorkflow === "dataset-change") {
      const requirements = datasetChangeRequirements(messages);
      if (requirements.length > 0) {
        let missing = "a Change Plan with at least one step and an Affected Concepts list with bundle paths";
        if (requirements.length === 1) {
          missing = requirements[0] === "change-plan"
            ? "a Change Plan with at least one step"
            : "an Affected Concepts list with bundle paths";
        }
        setExportState({
          status: "error",
          message: `Dataset change export needs ${missing}. Ask the agent to revise the response before review.`,
        });
        return;
      }
    }
    setExportState({ status: "exporting" });
    try {
      const filename = await exportAgentTranscript(
        transcriptFilename(threadTitle.value),
        transcriptMarkdown(threadTitle.value, bundleName, agentName, messages),
      );
      setExportState(filename ? { status: "success", filename } : { status: "idle" });
    } catch (error: unknown) {
      setExportState({ status: "error", message: `Export failed. ${errorMessage(error)}` });
    }
  }

  const resetExport = () => setExportState({ status: "idle" });

  return { exportState, exportTranscript, resetExport };
}
