import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { ThreadActionsMenu } from "./ThreadChrome.tsx";

const meta = {
  title: "Agent/Conversation/ThreadActionsMenu",
  component: ThreadActionsMenu,
  args: {
    historyAvailable: true,
    historyDisabled: false,
    exportAvailable: true,
    exportDisabled: false,
    exportPending: false,
    markdownAvailable: true,
    markdownDisabled: false,
    archiveAvailable: true,
    archiveDisabled: false,
    archiveTitle: "Archive this thread",
    retrievalLabAvailable: true,
    changeDisabled: false,
    onOpenHistory: fn(),
    onOpenMarkdown: fn(),
    onExport: fn(),
    onArchive: fn(),
    onOpenRetrievalLab: fn(),
    onChangeAgent: fn(),
  },
} satisfies Meta<typeof ThreadActionsMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TranscriptActions: Story = {
  play: async ({ args, canvas, canvasElement }) => {
    await userEvent.click(canvas.getByRole("button", { name: "More thread actions" }));
    const page = within(canvasElement.ownerDocument.body);
    const openMarkdown = await page.findByRole("menuitem", { name: "Open as Markdown" });
    const exportThread = page.getByRole("menuitem", { name: "Export thread" });
    const retrievalLab = page.getByRole("menuitem", { name: "Evidence Lab" });
    await expect(openMarkdown).toBeVisible();
    await expect(exportThread).toBeVisible();
    await expect(retrievalLab).toBeVisible();
    await userEvent.click(openMarkdown);
    await expect(args.onOpenMarkdown).toHaveBeenCalledOnce();
    await expect(args.onExport).not.toHaveBeenCalled();
  },
};
