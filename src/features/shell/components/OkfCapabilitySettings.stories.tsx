import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { OkfCapabilitySettingsView } from "./OkfCapabilitySettings.tsx";
import type { OkfCapabilityCatalogInfo } from "@/shared/ipc.ts";
import "@/shared/styles/baseui.css";
import "@/shared/styles/chrome.css";

const catalog: OkfCapabilityCatalogInfo = {
  manifestSha256: "918d9b0905d2a29632dcc800cfc285d53b62dd37e15f4013aa81e514e6a4f535",
  schemaVersion: 1,
  resourceSchemaVersion: 1,
  pack: {
    id: "okf-foundation",
    version: "1.2.0",
    name: "OKF Foundation",
    description: "The built-in declarative skills, templates, artifact contract, and Studio tool requirements for bounded OKF work.",
    publisher: "OKF Studio",
    provenance: "built-in",
    manifestSha256: "8db79fe5633fa142af8afe5fe0f89850c46ecae0634cc0324e4577db0f023fce",
    compatibility: {
      minimumStudioVersion: "0.3.0",
      capabilitySchemaVersion: 1,
      artifactSchemaVersion: 1,
    },
    conflicts: [],
    requiredStudioTools: [
      "okf_capability_catalog",
      "okf_capability_resource",
      "okf_inventory",
      "okf_read",
      "okf_search",
      "okf_sources",
      "okf_traverse",
      "okf_validate",
      "okf_health_summary",
      "okf_health_finding",
      "okf_health_affected",
      "okf_health_repair",
      "studio_source_inventory",
      "studio_source_read",
      "studio_stage_inventory",
      "studio_stage_read",
      "studio_stage_propose",
      "studio_stage_validate",
    ],
    templateIds: ["okf-markdown-templates"],
    artifactSchemaIds: ["okf-artifact-v1", "writing-revision-v1"],
    active: true,
    rollbackLabel: "Legacy 0.4.0",
  },
  capabilities: [
    {
      id: "okf-core",
      version: "0.4.0",
      description: "Inspect, author, validate, and maintain conformant OKF bundles.",
      riskClass: "stage",
      requiredTools: ["okf_inventory", "okf_read"],
      artifactKinds: ["bundle-plan", "staged-revision"],
      resources: [{
        id: "instructions",
        label: "instructions",
        path: "SKILL.md",
        mediaType: "text/markdown",
        sha256: "44a69ba95ee836153ff3960656df63f50dce096962314843ff6a31a7012fd934",
      }],
    },
    {
      id: "okf-inspect",
      version: "0.2.0",
      description: "Answer bounded questions about an existing bundle.",
      riskClass: "read",
      requiredTools: ["okf_inventory", "okf_read", "okf_health_summary"],
      artifactKinds: ["health-report"],
      resources: [{
        id: "instructions",
        label: "inspect method",
        path: "capabilities/inspect.md",
        mediaType: "text/markdown",
        sha256: "b29132498437e36064314185edc828138d680b1e226ba5cf91af843129ea70fe",
      }],
    },
  ],
};

const meta = {
  title: "Shell/Settings/OKF capabilities",
  component: OkfCapabilitySettingsView,
  decorators: [
    (Story) => (
      <div
        style={{
          boxSizing: "border-box",
          width: "min(720px, 100%)",
          margin: "0 auto",
          padding: "var(--space-24)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          background: "var(--bg-elev)",
        }}
      >
        <Story />
      </div>
    ),
  ],
  args: {
    catalog,
    loadError: false,
    busy: false,
    actionError: null,
    onRetry: fn(),
    onTogglePack: fn(),
  },
} satisfies Meta<typeof OkfCapabilitySettingsView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ActivePack: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Active")).toBeVisible();
    await expect(canvas.getByText(/okf-artifact-v1/)).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Use Legacy 0.4.0" }));
    await expect(args.onTogglePack).toHaveBeenCalledOnce();
  },
};

export const LegacyMode: Story = {
  args: {
    catalog: {
      ...catalog,
      pack: { ...catalog.pack, active: false },
      capabilities: [catalog.capabilities[0]],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Legacy mode")).toBeVisible();
    await expect(canvas.getByText(/profiles, sessions, checkpoints/i)).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Restore OKF Foundation" })).toBeEnabled();
  },
};

export const Updating: Story = {
  args: { busy: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: /Updating capability mode/i })).toBeDisabled();
  },
};

export const UpdateError: Story = {
  args: { actionError: "Studio could not save capability pack state." },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("alert")).toHaveTextContent("could not save");
  },
};

export const Loading: Story = {
  args: { catalog: null },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("status")).toHaveTextContent("Inspecting built-in capabilities");
  },
};

export const LoadError: Story = {
  args: { catalog: null, loadError: true },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("alert")).toHaveTextContent("could not inspect");
    await userEvent.click(canvas.getByRole("button", { name: "Retry" }));
    await expect(args.onRetry).toHaveBeenCalledOnce();
  },
};

export const Narrow: Story = {
  parameters: { viewport: { defaultViewport: "mobile1" } },
};
