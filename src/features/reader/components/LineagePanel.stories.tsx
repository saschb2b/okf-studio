import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect } from "react";
import { expect, userEvent, within } from "storybook/test";
import { WithStore } from "@/mock/withStore.tsx";
import { useApp } from "@/shared/store.tsx";
import { LineagePanel } from "./LineagePanel.tsx";

function OpenLineage() {
  const { state, actions } = useApp();
  useEffect(() => {
    if (state.activeConceptId !== "product/overview") actions.selectConcept("product/overview");
    if (!state.panels.lineage) actions.togglePanel("lineage", true);
  }, [actions, state.activeConceptId, state.panels.lineage]);
  return <LineagePanel />;
}

const meta = {
  title: "Reader/LineagePanel",
  component: OpenLineage,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <WithStore withBundle>
        <div style={{ minHeight: "760px", background: "var(--bg)" }}>
          <Story />
        </div>
      </WithStore>
    ),
  ],
} satisfies Meta<typeof OpenLineage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FilteredAndExplained: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(await page.findByRole("dialog", { name: "Lineage" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Lineage filters" })).toBeVisible();
    const supports = await page.findByRole("option", { name: "Supports" });
    await expect(supports).toBeVisible();
    await userEvent.selectOptions(page.getByLabelText("Path target concept"), "features/graph-view");
    await expect(page.getByText(/Outgoing · Links to/)).toBeVisible();
    await userEvent.selectOptions(page.getByLabelText("Relationship"), supports);
    await expect(page.getByText("Supports")).toBeVisible();
  },
};

export const CautionOnly: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(await page.findByRole("dialog", { name: "Lineage" })).toBeVisible();
    await userEvent.selectOptions(page.getByLabelText("Reliability"), "caution");
    await expect(page.getAllByText(/No relationships match the current filters/)[0]).toBeVisible();
  },
};

export const Narrow: Story = {
  parameters: { viewport: { defaultViewport: "mobile1" } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(await page.findByRole("dialog", { name: "Lineage" })).toBeVisible();
    await expect(page.getByRole("radio", { name: "Both" })).toBeChecked();
  },
};
