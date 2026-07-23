import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent } from "storybook/test";
import { createOkfContextPlan } from "@/features/agent/taskContext.ts";
import { OkfContextPlanCard } from "./OkfContextPlanCard.tsx";

const plan = createOkfContextPlan({
  taskId: "okf-enrich",
  bundleRoot: "C:\\knowledge\\docs",
  concepts: [
    { id: "product/overview", title: "Product overview", type: "Product" },
    { id: "features/agent-panel", title: "Agent Panel", type: "Feature" },
  ],
  activeConcept: { id: "features/agent-panel", title: "Agent Panel" },
  attachedConcepts: [
    { id: "product/overview", title: "Product overview", type: "Product" },
  ],
  sources: [{
    id: "source-1",
    title: "Research notes",
    content: "A bounded evidence source.",
    origin: "notes.md",
  }],
  issues: [{ conceptId: "features/agent-panel", level: "warning", message: "Missing link" }],
});

const meta = {
  title: "Agent/Conversation/OkfContextPlanCard",
  component: OkfContextPlanCard,
  args: {
    plan,
    stale: false,
    disabled: false,
    onRemove: fn(),
    onAcceptRefresh: fn(),
  },
} satisfies Meta<typeof OkfContextPlanCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PlannedContext: Story = {
  play: async ({ canvas, args }) => {
    await expect(canvas.getByText("Enrich this bundle")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", {
      name: "Remove Agent Panel from the context plan",
    }));
    await expect(args.onRemove).toHaveBeenCalledWith("bundle-object", "features/agent-panel");
  },
};

export const BundleChanged: Story = {
  args: { stale: true },
  play: async ({ canvas, args }) => {
    await expect(canvas.getByRole("alert")).toHaveTextContent("bundle changed");
    await userEvent.click(canvas.getByRole("button", { name: "Use refreshed plan" }));
    await expect(args.onAcceptRefresh).toHaveBeenCalled();
  },
};

export const MemorySuggestion: Story = {
  args: {
    memorySuggestion: {
      conceptTitle: "Agent Panel",
      effect: "Omit bundle-object:features/agent-panel from future okf-enrich plans.",
    },
    onSaveMemory: fn(),
    onDismissMemory: fn(),
  },
  play: async ({ canvas, args }) => {
    await expect(canvas.getByRole("region", { name: "Workspace memory suggestion" }))
      .toHaveTextContent("User-owned");
    await userEvent.click(canvas.getByRole("button", { name: "Remember" }));
    await expect(args.onSaveMemory).toHaveBeenCalled();
  },
};

export const MemoryError: Story = {
  args: {
    memoryError: "Studio could not save this workspace preference.",
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("alert")).toHaveTextContent("could not save");
  },
};

export const ProfileAware: Story = {
  args: {
    plan: createOkfContextPlan({
      taskId: "okf-revise",
      bundleRoot: "C:\\knowledge\\docs",
      concepts: [
        { id: "guides/start", title: "Getting started", type: "Guide" },
      ],
      activeConcept: { id: "guides/start", title: "Getting started" },
      attachedConcepts: [],
      sources: [],
      issues: [],
      profileReport: {
        schemaVersion: 1,
        profiles: [{
          namespace: "com.example.knowledge",
          version: "1.2.0",
          descriptorPath: "profiles/knowledge.json",
          status: "active",
          message: "Resolved from a local descriptor.",
          extra: {},
          descriptor: {
            schemaVersion: 1,
            namespace: "com.example.knowledge",
            version: "1.2.0",
            title: "Team knowledge",
            description: "",
            fields: [
              {
                id: "type",
                scope: "concept",
                key: "type",
                label: "Type",
                description: "",
                valueType: "string",
                expectation: "required",
                conceptTypes: [],
                examples: ["Guide"],
              },
              {
                id: "owner",
                scope: "concept",
                key: "owner",
                label: "Owner",
                description: "",
                valueType: "string",
                expectation: "required",
                conceptTypes: ["Guide"],
                examples: ["Docs"],
              },
            ],
            relationships: [],
            checks: [],
          },
        }],
        diagnostics: [],
        edges: [],
        truncated: false,
      },
    }),
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByText("com.example.knowledge"));
    await expect(canvas.getByText("OKF-required")).toBeVisible();
    await expect(canvas.getByText("Profile-required")).toBeVisible();
    await expect(canvas.getByText("Not OKF validation")).toBeVisible();
  },
};
