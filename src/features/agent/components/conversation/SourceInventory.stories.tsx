import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent } from "storybook/test";
import type { AgentSourceInput, AgentSourceAdapterReceipt } from "@/shared/ipc.ts";
import { SourceInventory } from "./SourceInventory.tsx";

const receipt = (
  adapterId: string,
  discovery: AgentSourceAdapterReceipt["discovery"],
  origin: string,
  diagnostics: AgentSourceAdapterReceipt["diagnostics"] = [],
): AgentSourceAdapterReceipt => ({
  schemaVersion: 1,
  adapterId,
  adapterVersion: 1,
  discovery,
  origin,
  mediaType: "application/json",
  sourceFingerprint: `sha256-${"a".repeat(64)}`,
  evidenceFingerprint: `sha256-${"b".repeat(64)}`,
  refreshFingerprint: `source-refresh-v1-${"c".repeat(64)}`,
  trust: "untrusted",
  diagnostics,
});

const readySources: AgentSourceInput[] = [
  {
    title: "openapi.json",
    content: "# OpenAPI inventory",
    origin: "openapi.json",
    mediaType: "application/json",
    sourceDigest: "a".repeat(64),
    adapterReceipt: receipt("openapi", "file", "openapi.json"),
  },
  {
    title: "warehouse/manifest.json",
    content: "# dbt manifest inventory",
    origin: "warehouse/manifest.json",
    mediaType: "application/json",
    sourceDigest: "a".repeat(64),
    adapterReceipt: receipt("dbt-manifest", "folder", "warehouse/manifest.json"),
  },
];

const meta = {
  title: "Agent/Conversation/SourceInventory",
  component: SourceInventory,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => <div style={{ width: "min(680px, calc(100vw - 32px))" }}><Story /></div>,
  ],
} satisfies Meta<typeof SourceInventory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {
  args: { sources: readySources },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByText("Source inventory"));
    await expect(canvas.getByText("OpenAPI v1 · file")).toBeVisible();
    await expect(canvas.getByText(/Embedded instructions stay inert/)).toBeVisible();
  },
};

export const PartialWithWarning: Story = {
  args: {
    sources: [{
      ...readySources[0],
      title: "metadata.json",
      origin: "metadata.json",
      adapterReceipt: receipt("bigquery-metadata", "file", "metadata.json", [{
        level: "warning",
        code: "bigquery-missing-schema",
        message: "orders has no exported schema fields. Re-export table metadata with schema details.",
      }]),
    }],
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("1 source · 1 warning")).toBeVisible();
    await expect(canvas.getByText(/Re-export table metadata/)).toBeVisible();
  },
};

export const Narrow: Story = {
  args: { sources: readySources },
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
