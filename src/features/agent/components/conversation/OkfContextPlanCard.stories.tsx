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
