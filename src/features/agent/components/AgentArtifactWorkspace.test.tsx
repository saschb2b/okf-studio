import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AgentArtifact } from "@/features/agent/artifact.ts";
import { AgentArtifactWorkspace } from "./AgentArtifactWorkspace.tsx";

const artifact: AgentArtifact = {
  schemaVersion: 1,
  artifactId: "bundle-plan-1",
  kind: "bundle-plan",
  revision: 1,
  parentRevision: null,
  bundleFingerprint: "okf-health-revision-current",
  title: "Bundle plan",
  status: "complete",
  summary: "Plan a bounded bundle.",
  conceptReferences: [
    { path: "product/overview.md", conceptId: "product/overview", exists: true },
  ],
  sources: [],
  citations: [],
  fields: [
    { id: "destination", label: "Destination", value: "New bundle", editable: true },
    { id: "scope", label: "Scope", value: "Product knowledge", editable: true },
  ],
  items: [],
  missingFields: [],
  large: false,
  verification: {
    errors: 0,
    warnings: 0,
    completionBlocked: false,
    findings: [],
  },
};

describe("AgentArtifactWorkspace", () => {
  it("keeps edits local until the user sends a new revision", () => {
    const onSendRevision = vi.fn();
    render(
      <AgentArtifactWorkspace
        state={{ status: "ready", artifact, sentRevision: null }}
        onShowConversation={vi.fn()}
        onSendRevision={onSendRevision}
      />,
    );
    fireEvent.change(screen.getByLabelText("Scope"), { target: { value: "Curated product knowledge" } });
    expect(onSendRevision).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Send revision 2" }));
    expect(onSendRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        revision: 2,
        parentRevision: 1,
        fields: expect.arrayContaining([
          expect.objectContaining({ id: "scope", value: "Curated product knowledge" }),
        ]),
      }),
      "continue",
    );
  });

  it("keeps a stale artifact read-only", () => {
    render(
      <AgentArtifactWorkspace
        state={{
          status: "stale",
          artifact,
          sentRevision: 2,
          message: "An older update arrived.",
        }}
        onShowConversation={vi.fn()}
        onSendRevision={vi.fn()}
      />,
    );
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send revision 2" })).toBeDisabled();
  });

  it("keeps critic review separate from revision and apply actions", () => {
    const onRunCritic = vi.fn();
    render(
      <AgentArtifactWorkspace
        state={{ status: "ready", artifact, sentRevision: null }}
        criticState={{ status: "idle" }}
        onShowConversation={vi.fn()}
        onRunCritic={onRunCritic}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Run critic" }));
    expect(onRunCritic).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: /approve|apply/iu })).not.toBeInTheDocument();
  });
});
