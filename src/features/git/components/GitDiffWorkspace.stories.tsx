import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { GitDiffWorkspaceView } from "./GitDiffWorkspace.tsx";

const meta = {
  title: "Git/GitDiffWorkspace",
  component: GitDiffWorkspaceView,
  parameters: { layout: "fullscreen" },
  args: {
    loading: false,
    error: null,
    onClose: fn(),
    diff: {
      title: "src/features/git/components/GitPanel.tsx",
      truncated: false,
      text: [
        "diff --git a/src/features/git/components/GitPanel.tsx b/src/features/git/components/GitPanel.tsx",
        "--- a/src/features/git/components/GitPanel.tsx",
        "+++ b/src/features/git/components/GitPanel.tsx",
        "@@ -1,3 +1,4 @@",
        " import { GitBranch } from \"lucide-react\";",
        "+import { GitChanges } from \"./GitChanges.tsx\";",
        "-export function SourceControl() {",
        "+export function GitPanel() {",
      ].join("\n"),
    },
  },
} satisfies Meta<typeof GitDiffWorkspaceView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TextDiff: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText("src/features/git/components/GitPanel.tsx")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Back to workspace" }));
    await expect(args.onClose).toHaveBeenCalledOnce();
  },
};

export const Loading: Story = {
  args: { loading: true, diff: null },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("Loading diff")).toBeVisible();
  },
};

export const Error: Story = {
  args: { diff: null, error: "The file changed before its diff could be read." },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Diff unavailable")).toBeVisible();
    await expect(canvas.getByText("The file changed before its diff could be read.")).toBeVisible();
  },
};
