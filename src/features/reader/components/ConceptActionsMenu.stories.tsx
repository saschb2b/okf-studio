import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, within } from "storybook/test";
import { MOCK_BUNDLE } from "@/mock/fixture.ts";
import { ConceptActionsMenu } from "./ConceptActionsMenu.tsx";

const concept =
  MOCK_BUNDLE.concepts.find((candidate) => candidate.id === "product/overview") ??
  MOCK_BUNDLE.concepts[0];

const meta = {
  title: "Reader/ConceptActionsMenu",
  component: ConceptActionsMenu,
  args: {
    bundle: MOCK_BUNDLE,
    concept,
    onSelectConcept: fn(),
  },
} satisfies Meta<typeof ConceptActionsMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Closed: one quiet trigger, named for both hover and assistive technology. */
export const Trigger: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole("button", { name: "More concept actions" });
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAttribute("title", "More concept actions");
  },
};

/** Open: the two reviewed transactions, each labelled with its ellipsis so it
 *  reads as "opens something" rather than "does something now". */
export const Open: Story = {
  args: { defaultOpen: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await expect(await canvas.findByRole("menuitem", { name: /Move concept/ })).toBeVisible();
    await expect(canvas.getByRole("menuitem", { name: /Retire concept/ })).toBeVisible();
    // Two items and no more: the overflow is for the rare pair, not a dumping
    // ground that grows until it needs its own search.
    await expect(canvas.getAllByRole("menuitem")).toHaveLength(2);
  },
};

/** Without a bundle there is nothing to write to, so both stay reachable but
 *  inert rather than vanishing and changing the menu's shape. */
export const WithoutABundle: Story = {
  args: { bundle: null, defaultOpen: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    for (const item of await canvas.findAllByRole("menuitem")) {
      await expect(item).toHaveAttribute("data-disabled");
    }
  },
};
