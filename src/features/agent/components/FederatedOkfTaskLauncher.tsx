import { useEffect, useRef, useState } from "react";
import { FederatedBundleSet } from "@/features/agent/components/FederatedBundleSet.tsx";
import { OkfTaskLauncher } from "@/features/agent/components/OkfTaskLauncher.tsx";
import type { OkfTaskLauncherStatus } from "@/features/agent/components/OkfTaskLauncher.tsx";
import type {
  BundleLibraryEntry,
  FederatedBundleSelection,
  FederatedBundleStatus,
} from "@/features/agent/federation.ts";
import {
  collectFederatedTaskEvidence,
  taskSupportsFederatedEvidence,
} from "@/features/agent/federatedTaskEvidence.ts";
import type { OkfContextPlan, OkfTaskId, OkfTaskKickoff } from "@/features/agent/taskContext.ts";
import { kickoffForOkfOrigin, type OkfTaskOrigin } from "@/features/agent/taskLauncher.ts";
import { bundleLibrary, previewFederatedBundles } from "@/shared/ipc.ts";

interface FederatedOkfTaskLauncherProps {
  requestId: string;
  activeRoot: string | null;
  origin: OkfTaskOrigin;
  status: OkfTaskLauncherStatus;
  tasks: readonly OkfTaskId[];
  selectedTaskId: OkfTaskId;
  plan?: OkfContextPlan;
  connectionName?: string;
  onTaskChange: (taskId: OkfTaskId) => void;
  onClose: () => void;
  onConnect: () => void;
  onAuthenticate: () => void;
  onRefresh: () => void;
  onStart: (kickoff: OkfTaskKickoff) => void;
}

interface FederatedBundleSetData {
  requestId: string;
  state: "loading" | "ready" | "empty" | "error" | "previewing";
  entries: BundleLibraryEntry[];
  selectedIds: string[];
  statuses: FederatedBundleStatus[];
  error?: string;
}

export function FederatedOkfTaskLauncher({
  requestId,
  activeRoot,
  origin,
  status,
  tasks,
  selectedTaskId,
  plan,
  connectionName,
  onTaskChange,
  onClose,
  onConnect,
  onAuthenticate,
  onRefresh,
  onStart,
}: FederatedOkfTaskLauncherProps) {
  const supportsFederation = taskSupportsFederatedEvidence(selectedTaskId);
  const showFederation = supportsFederation
    && status !== "first-use"
    && status !== "authentication"
    && status !== "unsupported"
    && status !== "stale";
  const [reloadToken, setReloadToken] = useState(0);
  const [bundleSet, setBundleSet] = useState<FederatedBundleSetData | null>(null);
  const previewSequence = useRef(0);
  const loadSequence = useRef(0);

  useEffect(() => {
    const sequence = ++loadSequence.current;
    if (!showFederation || !activeRoot) {
      setBundleSet(null);
      return;
    }
    setBundleSet({
      requestId,
      state: "loading",
      entries: [],
      selectedIds: [],
      statuses: [],
    });
    void bundleLibrary(activeRoot)
      .then(async (entries) => {
        if (sequence !== loadSequence.current) return;
        const active = entries.find((entry) => entry.active);
        if (!active) {
          setBundleSet({ requestId, state: "empty", entries, selectedIds: [], statuses: [] });
          return;
        }
        const selectedIds = [active.bundleId];
        const statuses = await previewFederatedBundles(selectedIds);
        if (sequence !== loadSequence.current) return;
        setBundleSet({ requestId, state: "ready", entries, selectedIds, statuses });
      })
      .catch((error: unknown) => {
        if (sequence !== loadSequence.current) return;
        setBundleSet({
          requestId,
          state: "error",
          entries: [],
          selectedIds: [],
          statuses: [],
          error: errorMessage(error, "Studio could not load the bundle library."),
        });
      });
    return () => {
      if (loadSequence.current === sequence) loadSequence.current += 1;
    };
  }, [activeRoot, reloadToken, requestId, showFederation]);

  async function updateSelection(bundleId: string, selected: boolean) {
    if (bundleSet?.requestId !== requestId) return;
    const selectedIds = selected
      ? [...bundleSet.selectedIds, bundleId]
      : bundleSet.selectedIds.filter((id) => id !== bundleId);
    const sequence = ++previewSequence.current;
    setBundleSet({ ...bundleSet, state: "previewing", selectedIds });
    try {
      const statuses = await previewFederatedBundles(selectedIds);
      if (sequence !== previewSequence.current) return;
      setBundleSet((current) => current?.requestId === requestId
        ? { ...current, state: "ready", selectedIds, statuses, error: undefined }
        : current);
    } catch (error: unknown) {
      if (sequence !== previewSequence.current) return;
      setBundleSet((current) => current?.requestId === requestId
        ? {
            ...current,
            state: "error",
            selectedIds,
            error: errorMessage(error, "Studio could not verify the selected bundles."),
          }
        : current);
    }
  }

  async function startTask() {
    const kickoff = kickoffForOkfOrigin(selectedTaskId, origin);
    if (!supportsFederation || !bundleSet || bundleSet.selectedIds.length < 2) {
      onStart(kickoff);
      return;
    }
    const selections = exactSelections(bundleSet);
    if (!selections) return;
    setBundleSet({ ...bundleSet, state: "previewing" });
    try {
      const evidence = await collectFederatedTaskEvidence(
        selectedTaskId,
        origin.title,
        selections,
      );
      if (evidence.statuses.some((bundle) => bundle.grantState !== "available")) {
        setBundleSet((current) => current?.requestId === requestId
          ? { ...current, state: "ready", statuses: evidence.statuses }
          : current);
        return;
      }
      onStart({
        ...kickoff,
        sources: [...(kickoff.sources ?? []), ...evidence.sources],
      });
    } catch (error: unknown) {
      setBundleSet((current) => current?.requestId === requestId
        ? {
            ...current,
            state: "error",
            error: errorMessage(error, "Studio could not gather the selected bundle evidence."),
          }
        : current);
    }
  }

  const currentBundleSet = bundleSet?.requestId === requestId ? bundleSet : null;
  const selectedUnavailable = currentBundleSet?.statuses.some((bundle) =>
    currentBundleSet.selectedIds.includes(bundle.bundleId) && bundle.grantState !== "available"
  ) ?? false;
  const bundleSetBusy = currentBundleSet?.state === "loading"
    || currentBundleSet?.state === "previewing";
  const hasSelectedEvidence = (currentBundleSet?.selectedIds.length ?? 0) > 1;
  const startDisabled = showFederation
    && (!currentBundleSet || bundleSetBusy || (hasSelectedEvidence
      && (currentBundleSet.state === "error" || selectedUnavailable)));

  return (
    <OkfTaskLauncher
      open
      origin={origin}
      status={status}
      tasks={tasks}
      selectedTaskId={selectedTaskId}
      plan={plan}
      connectionName={connectionName}
      bundleSet={showFederation && currentBundleSet ? (
        <FederatedBundleSet
          state={currentBundleSet.state}
          entries={currentBundleSet.entries}
          selectedIds={currentBundleSet.selectedIds}
          statuses={currentBundleSet.statuses}
          error={currentBundleSet.error}
          onToggle={(bundleId, selected) => void updateSelection(bundleId, selected)}
          onRetry={() => setReloadToken((token) => token + 1)}
        />
      ) : undefined}
      startDisabled={startDisabled}
      onTaskChange={onTaskChange}
      onClose={onClose}
      onConnect={onConnect}
      onAuthenticate={onAuthenticate}
      onRefresh={onRefresh}
      onStart={() => void startTask()}
    />
  );
}

function exactSelections(bundleSet: FederatedBundleSetData): FederatedBundleSelection[] | null {
  const statuses = new Map(bundleSet.statuses.map((status) => [status.bundleId, status]));
  const selections: FederatedBundleSelection[] = [];
  for (const bundleId of bundleSet.selectedIds) {
    const entry = bundleSet.entries.find((candidate) => candidate.bundleId === bundleId);
    const status = statuses.get(bundleId);
    const revisionFingerprint = status?.revisionFingerprint ?? entry?.revisionFingerprint;
    if (!entry || status?.grantState !== "available" || !revisionFingerprint) return null;
    selections.push({ bundleId, revisionFingerprint });
  }
  return selections;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}
