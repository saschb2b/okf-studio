import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ProfileReport } from "@/shared/types.ts";
import { AdvisoryProfilesView } from "./AdvisoryProfiles.tsx";

const ACTIVE_REPORT: ProfileReport = {
  schemaVersion: 1,
  profiles: [{
    namespace: "com.example.knowledge",
    version: "1.2.0",
    descriptorPath: "profiles/knowledge.json",
    status: "active",
    message: "Resolved from a version-pinned descriptor inside this bundle.",
    extra: {},
    descriptor: {
      schemaVersion: 1,
      namespace: "com.example.knowledge",
      version: "1.2.0",
      title: "Team knowledge",
      description: "Shared guidance.",
      fields: [],
      relationships: [],
      checks: [],
    },
  }],
  diagnostics: [{
    namespace: "com.example.knowledge",
    ruleId: "owner-present",
    level: "recommendation",
    scope: "concept",
    file: "guides/start.md",
    conceptId: "guides/start",
    field: "owner",
    message: "Name the responsible team.",
  }],
  truncated: false,
};

describe("AdvisoryProfilesView", () => {
  it("keeps profile advice visibly separate from OKF validation", () => {
    const onOpenConcept = vi.fn();
    const onReviewMigration = vi.fn();
    render(
      <AdvisoryProfilesView
        report={ACTIVE_REPORT}
        onOpenConcept={onOpenConcept}
        onReviewMigration={onReviewMigration}
      />,
    );

    expect(screen.getByText("Not OKF validation")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Profile advice · 1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open concept" }));
    expect(onOpenConcept).toHaveBeenCalledWith("guides/start");
    fireEvent.click(screen.getByRole("button", { name: "Review migration" }));
    expect(onReviewMigration).toHaveBeenCalledWith(
      ACTIVE_REPORT.diagnostics[0],
      "profile-migration:com.example.knowledge:owner-present:guides/start.md",
    );
  });

  it("explains an unavailable descriptor without hiding the declaration", () => {
    render(
      <AdvisoryProfilesView
        report={{
          schemaVersion: 1,
          profiles: [{
            namespace: "org.example.policy",
            version: "2.0.0",
            descriptorPath: "profiles/missing.json",
            status: "unavailable",
            message: "The local profile descriptor is unavailable.",
            descriptor: null,
            extra: { owner: "Platform" },
          }],
          diagnostics: [],
          truncated: false,
        }}
      />,
    );

    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(screen.getByText("org.example.policy")).toBeInTheDocument();
    expect(screen.getByText("profiles/missing.json")).toBeInTheDocument();
    expect(screen.queryByText("Profile advice")).toBeNull();
  });

  it("renders nothing when a bundle declares no profiles", () => {
    const { container } = render(
      <AdvisoryProfilesView
        report={{ schemaVersion: 1, profiles: [], diagnostics: [], truncated: false }}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
