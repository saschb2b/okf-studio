import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { WithStore } from "@/mock/withStore.tsx";
import { useApp } from "@/shared/store.tsx";
import { OpenRemoteDialog } from "./OpenRemoteDialog.tsx";

function OpenDialog() {
  const { actions } = useApp();
  useEffect(() => actions.setRemoteOpen(true), [actions]);
  return <OpenRemoteDialog />;
}

const meta = {
  title: "Bundle/OpenRemoteDialog",
  component: OpenRemoteDialog,
  parameters: { layout: "fullscreen" },
  render: () => (
    <WithStore>
      <OpenDialog />
    </WithStore>
  ),
} satisfies Meta<typeof OpenRemoteDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

const URL_LABEL = "Paste a GitHub URL or a link to an archive";

/** Nothing typed: the network boundary is stated before any request. */
export const Idle: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await body.findByLabelText(URL_LABEL);
    // The popup fades in, so the hint exists before it is visible.
    await waitFor(() =>
      expect(body.getByText(/No request is sent until you choose Open\./)).toBeVisible(),
    );
    await expect(body.queryByText("Private repository?")).not.toBeInTheDocument();
  },
};

/** A GitHub URL offers the token disclosure, opened here. */
export const PrivateRepositoryToken: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.type(await body.findByLabelText(URL_LABEL), "https://github.com/owner/repo");
    await userEvent.click(body.getByText("Private repository?"));
    await expect(body.getByLabelText("Personal access token (optional)")).toBeVisible();
    await expect(body.getByText(/Studio does not store it\./)).toBeVisible();
  },
};

export const PrivateRepositoryTokenNarrow: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: PrivateRepositoryToken.play,
};

/** An archive can sit on any host, so it never gets a token field. */
export const ArchiveUrl: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.type(await body.findByLabelText(URL_LABEL), "https://example.com/bundle.tar.gz");
    await expect(body.getByText("Archive")).toBeVisible();
    await expect(body.queryByText("Private repository?")).not.toBeInTheDocument();
  },
};
