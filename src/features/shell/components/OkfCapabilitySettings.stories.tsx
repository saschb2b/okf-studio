import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { OkfCapabilitySettingsView } from "./OkfCapabilitySettings.tsx";
import type { OkfCapabilityCatalogInfo } from "@/shared/ipc.ts";
import "@/shared/styles/baseui.css";
import "@/shared/styles/chrome.css";
import "./Settings.css";

const catalog: OkfCapabilityCatalogInfo = {
  manifestSha256: "6aa1c3a57fcd96d0a4199f4f4621dc9840ddf62e8afd3d2d2ff6424fd30dc034",
  schemaVersion: 1,
  resourceSchemaVersion: 1,
  pack: {
    id: "okf-foundation",
    version: "1.0.0",
    name: "OKF Foundation",
    description: "The built-in declarative skills, templates, artifact contract, and Studio tool requirements for bounded OKF work.",
    publisher: "OKF Studio",
    provenance: "built-in",
    manifestSha256: "8f42bf715678a0219ccb7213a96e81aa6c6911a0a5b95f6eddfe19a5e9c5637d",
    compatibility: {
      minimumStudioVersion: "0.3.0",
      capabilitySchemaVersion: 1,
      artifactSchemaVersion: 1,
    },
    conflicts: [],
    requiredStudioTools: ["okf_inventory", "okf_read", "okf_health_summary"],
    templateIds: ["okf-markdown-templates"],
    artifactSchemaIds: ["okf-artifact-v1"],
    active: true,
    rollbackLabel: "Legacy 0.3.0",
  },
  capabilities: [
    {
      id: "okf-core",
      version: "0.3.0",
      description: "Inspect, author, validate, and maintain conformant OKF bundles.",
      riskClass: "stage",
      requiredTools: ["okf_inventory", "okf_read"],
      artifactKinds: ["bundle-plan", "staged-revision"],
      resources: [{
        id: "instructions",
        label: "instructions",
        path: "SKILL.md",
        mediaType: "text/markdown",
        sha256: "20eda3778b8f39c0beb265b5a0939c3b3ead02d696a0c67f4957980bf180fc17",
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
      <div className="ui-dialog settings-dialog">
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
    await expect(canvas.getByText("okf-artifact-v1")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Use Legacy 0.3.0" }));
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
