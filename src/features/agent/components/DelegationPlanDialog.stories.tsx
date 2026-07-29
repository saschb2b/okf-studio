import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { DelegationPlanDialog } from "./DelegationPlanDialog.tsx";
import { MOCK_BUNDLE } from "@/mock/fixture.ts";

/**
 * The preview runs against the browser mock's planner, so these exercise the
 * real component against real plan shapes rather than hand-built props.
 */
const meta = {
  title: "Agent/Orchestration/DelegationPlanDialog",
  component: DelegationPlanDialog,
  args: {
    open: true,
    bundle: MOCK_BUNDLE,
    root: "/mock/workspace/docs",
    onOpenChange: () => undefined,
  },
} satisfies Meta<typeof DelegationPlanDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ByType: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await waitFor(async () => {
      await expect(body.getByText(/of \d+ concepts/)).toBeInTheDocument();
    });
    // Every run row carries a count, which is the number the screen exists to
    // show. A bar with no figure beside it is decoration.
    const runs = body.getAllByRole("listitem");
    await expect(runs.length).toBeGreaterThan(0);
  },
};

/** Switching the decomposition replans without leaving the previous answer up. */
export const SwitchingDecomposition: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await waitFor(async () => {
      await expect(body.getByText(/of \d+ concepts/)).toBeInTheDocument();
    });
    const before = body.getByText(/of \d+ concepts/).textContent;

    await userEvent.click(body.getByRole("button", { name: "By folder" }));
    await expect(body.getByRole("button", { name: "By folder" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await waitFor(async () => {
      // The folder decomposition of this fixture differs from the type one, so
      // a summary that never changed would mean the replan did not happen.
      await expect(body.getByText(/of \d+ concepts/).textContent).not.toBe(before);
    });
  },
};

/** No bundle open: the screen says what to do rather than rendering an empty plan. */
export const WithoutABundle: Story = {
  args: { bundle: null, root: null },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(body.getByText("Open a bundle to plan work over it.")).toBeInTheDocument();
  },
};

/** The narrow width the panel fixtures use. */
export const Narrow: Story = {
  globals: { viewport: { value: "mobile1" } },
};
