import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect } from "react";
import { expect, userEvent, within } from "storybook/test";
import { WithStore } from "@/mock/withStore.tsx";
import { useApp } from "@/shared/store.tsx";
import { ValidationPanel } from "./ValidationPanel.tsx";

function OpenClinic() {
  const { state, actions } = useApp();
  useEffect(() => {
    if (!state.panels.validation) actions.togglePanel("validation", true);
  }, [state.panels.validation, actions]);
  return <ValidationPanel />;
}

const meta = {
  title: "Shell/CompatibilityClinic",
  component: OpenClinic,
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
} satisfies Meta<typeof OpenClinic>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MixedFindings: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(await page.findByText("Links")).toBeVisible();
    await expect(page.getByText("okf.portability.relative-link")).toBeVisible();
    await expect(page.getByText("Extensions")).toBeVisible();
    await userEvent.click(page.getByRole("button", { name: "Export compatibility report" }));
    await expect(await page.findByText(/Saved compatibility-/)).toBeVisible();
  },
};

export const Narrow: Story = {
  parameters: {
    viewport: { defaultViewport: "mobile1" },
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(await page.findByText("Compatibility Clinic")).toBeVisible();
    await expect(page.getByText("../features/graph-view.md")).toBeVisible();
  },
};
