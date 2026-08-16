import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import type { GitRepositorySnapshot } from "@/features/git/types.ts";
import { GitPanelView } from "./GitPanel.tsx";

const readyRepository: GitRepositorySnapshot = {
  availability: "ready",
  message: null,
  repositoryName: "okf-studio",
  branch: "feat/integrated-git-support",
  upstream: "origin/feat/integrated-git-support",
  ahead: 2,
  behind: 1,
  headSha: "972bdb14a0b8468df0106f639691a24e0ba9ee31",
  changes: [
    { path: "docs/features/integrated-git.md", kind: "added", staged: true, unstaged: false },
    { path: "src/features/git/components/GitPanel.tsx", kind: "modified", staged: false, unstaged: true },
    { path: "docs/log.md", kind: "modified", staged: true, unstaged: true },
    { path: "notes/review.md", kind: "untracked", staged: false, unstaged: true },
  ],
};

const callbacks = {
  onClose: fn(),
  onTabChange: fn(),
  onRefresh: fn(),
  onToggleChange: fn(),
  onStageAll: fn(),
  onUnstageAll: fn(),
  onOpenChange: fn(),
  onOpenAllChanges: fn(),
  onOpenCommit: fn(),
  onLoadMoreHistory: fn(),
  onRetryHistory: fn(),
  onMessageChange: fn(),
  onCommit: fn(),
  onUndo: fn(),
  onRemote: fn(),
  onAuthorizeRepository: fn(),
};

const meta = {
  title: "Git/GitPanel",
  component: GitPanelView,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div style={{ height: "780px", display: "flex", justifyContent: "flex-end", background: "var(--bg)" }}>
        <Story />
      </div>
    ),
  ],
  args: {
    open: true,
    snapshot: readyRepository,
    loading: false,
    error: null,
    tab: "changes",
    history: null,
    historyLoading: false,
    historyError: null,
    message: "",
    pending: null,
    feedback: null,
    ...callbacks,
  },
} satisfies Meta<typeof GitPanelView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Changes: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("tab", { name: "Changes 4" })).toHaveAttribute("aria-selected", "true");
    await userEvent.click(canvas.getByRole("button", { name: /GitPanel\.tsx/ }));
    await expect(args.onOpenChange).toHaveBeenCalledWith(readyRepository.changes[1]);
    await expect(canvas.getByRole("button", { name: "Commit staged" })).toBeDisabled();
  },
};

export const History: Story = {
  args: {
    tab: "history",
    history: {
      hasMore: true,
      commits: [
        {
          sha: "972bdb14a0b8468df0106f639691a24e0ba9ee31",
          shortSha: "972bdb1",
          subject: "Add bounded Git repository operations",
          authorName: "Sascha Becker",
          authorEmail: "sascha@example.invalid",
          timestamp: 1_774_110_000,
        },
        {
          sha: "610fb6aa3cfa8f7d69064cecd9bd25fa8f0c9124",
          shortSha: "610fb6a",
          subject: "Plan integrated Git support",
          authorName: "Sascha Becker",
          authorEmail: "sascha@example.invalid",
          timestamp: 1_774_106_400,
        },
      ],
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /Add bounded Git repository operations/ }));
    await expect(args.onOpenCommit).toHaveBeenCalledWith("972bdb14a0b8468df0106f639691a24e0ba9ee31");
    await expect(canvas.getByRole("button", { name: "Load older commits" })).toBeVisible();
  },
};

export const CleanRepository: Story = {
  args: {
    snapshot: { ...readyRepository, ahead: 0, behind: 0, changes: [] },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("No changes to commit")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Commit staged" })).toBeDisabled();
  },
};

export const RepositoryOutsideGrant: Story = {
  args: {
    snapshot: {
      availability: "scopeDenied",
      message: "The bundle is inside a larger Git repository. Allow that repository to use Git here.",
      repositoryName: null,
      branch: null,
      upstream: null,
      ahead: 0,
      behind: 0,
      headSha: null,
      changes: [],
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Connect the enclosing repository")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Allow repository" }));
    await expect(args.onAuthorizeRepository).toHaveBeenCalledOnce();
  },
};

export const ConflictAndLongPaths: Story = {
  args: {
    snapshot: {
      ...readyRepository,
      branch: "feat/knowledge-workflows-with-an-intentionally-long-branch-name",
      changes: [
        {
          path: "docs/product/a-very-long-concept-directory/knowledge-that-needs-manual-conflict-resolution.md",
          kind: "conflict",
          staged: true,
          unstaged: true,
        },
        ...readyRepository.changes,
        { path: "docs/archive/retired.md", kind: "deleted", staged: false, unstaged: true },
        { path: "docs/features/renamed-concept.md", kind: "renamed", staged: true, unstaged: false },
      ],
    },
    message: "Resolve the knowledge conflict",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Resolve conflicted files/)).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Commit staged" })).toBeDisabled();
    await expect(canvas.getByLabelText("Conflict")).toBeVisible();
  },
};

export const TrackedOnlyCommit: Story = {
  args: {
    snapshot: {
      ...readyRepository,
      changes: [
        { path: "docs/features/integrated-git.md", kind: "modified", staged: false, unstaged: true },
        { path: "notes/new-source.md", kind: "untracked", staged: false, unstaged: true },
      ],
    },
    message: "Document Git support",
    onCommit: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Untracked files stay out of this commit.")).toBeVisible();
    const composer = canvas.getByRole("textbox", { name: "Commit message" });
    await userEvent.type(composer, "{Control>}{Enter}{/Control}");
    await expect(args.onCommit).toHaveBeenCalledWith(true);
  },
};

export const RemoteOperationFailed: Story = {
  args: {
    pending: "fetch",
    feedback: {
      tone: "error",
      message: "Fetch failed. Sign in with Git, then try Fetch again.",
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("alert")).toHaveTextContent("Fetch failed");
    await expect(canvas.getByRole("button", { name: "Fetch" })).toBeDisabled();
  },
};

export const NoRepository: Story = {
  args: {
    snapshot: {
      availability: "notRepository",
      message: "The active bundle is not inside a Git repository.",
      repositoryName: null,
      branch: null,
      upstream: null,
      ahead: 0,
      behind: 0,
      headSha: null,
      changes: [],
    },
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("No Git repository")).toBeVisible();
  },
};

export const GitUnavailable: Story = {
  args: {
    snapshot: {
      availability: "gitUnavailable",
      message: "Install Git and reopen the panel.",
      repositoryName: null,
      branch: null,
      upstream: null,
      ahead: 0,
      behind: 0,
      headSha: null,
      changes: [],
    },
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("Git is not installed")).toBeVisible();
  },
};

export const EmptyHistory: Story = {
  args: {
    tab: "history",
    history: { commits: [], hasMore: false },
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("No commits yet")).toBeVisible();
  },
};
