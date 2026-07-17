// The static create-new-bundle form over the real store: the folder name
// derives live from the title, and the primary action stays disabled until
// the form can produce a valid bundle.
import { useEffect } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { useApp } from "@/shared/store.tsx";
import { WithStore } from "@/mock/withStore.tsx";
import { CreateBundleDialog } from "./CreateBundleDialog.tsx";

function OpenOnMount() {
  const { actions } = useApp();
  useEffect(() => {
    actions.setCreateOpen(true);
    // The store's actions object is stable; open exactly once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <CreateBundleDialog />;
}

const meta = {
  title: "Bundle/CreateBundleDialog",
  component: CreateBundleDialog,
  render: () => (
    <WithStore>
      <OpenOnMount />
    </WithStore>
  ),
} satisfies Meta<typeof CreateBundleDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Title drives the folder slug; create enables once a title exists. */
export const FormDerivation: Story = {
  play: async ({ canvasElement }) => {
    const doc = within(canvasElement.ownerDocument.body);
    const dialog = await doc.findByRole("dialog", { name: "Create new bundle" });
    const create = within(dialog).getByRole("button", { name: /choose location & create/i });
    await expect(create).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText("Bundle title"), "Field Notes: Q3");
    await waitFor(() =>
      expect(within(dialog).getByLabelText("Folder name")).toHaveValue("field-notes-q3"),
    );
    await expect(create).toBeEnabled();
  },
};

/** A hand-edited folder name stops tracking the title. */
export const FolderNamePinned: Story = {
  play: async ({ canvasElement }) => {
    const doc = within(canvasElement.ownerDocument.body);
    const dialog = await doc.findByRole("dialog", { name: "Create new bundle" });
    const folder = within(dialog).getByLabelText("Folder name");
    await userEvent.type(folder, "kb");
    await userEvent.type(within(dialog).getByLabelText("Bundle title"), "Knowledge Base");
    await expect(folder).toHaveValue("kb");
  },
};
