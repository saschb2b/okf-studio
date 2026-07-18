import type { Meta, StoryObj } from "@storybook/react-vite";
import { Dialog } from "@base-ui/react/dialog";
import { BookOpenText, Bot, Database, Download, Palette, Settings2 } from "lucide-react";
import { useState } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import {
  SettingRow,
  SettingsGroup,
  SettingsWorkspace,
} from "./SettingsWorkspace.tsx";
import type {
  SettingsNavigationItem,
  SettingsSectionId,
} from "./SettingsWorkspace.tsx";
import "@/shared/styles/chrome.css";
import "@/shared/styles/baseui.css";
import "./Settings.css";

const sections = [
  { id: "general", label: "General", description: "Bundle discovery and local defaults.", icon: Settings2 },
  { id: "appearance", label: "Appearance", description: "Theme and motion.", icon: Palette },
  { id: "reading", label: "Reading", description: "Concept reader preferences.", icon: BookOpenText },
  { id: "agents", label: "Agents", description: "Agent attention and methods.", icon: Bot },
  { id: "knowledge", label: "Knowledge", description: "Bundle-scoped knowledge controls.", icon: Database },
  { id: "updates", label: "Updates", description: "Explicit application updates.", icon: Download },
] as const satisfies readonly SettingsNavigationItem[];

function WorkspaceHarness() {
  const [section, setSection] = useState<SettingsSectionId>("general");
  const [query, setQuery] = useState("");
  const active = sections.find((item) => item.id === section) ?? sections[0];
  return (
    <Dialog.Root open>
      <Dialog.Portal>
        <Dialog.Backdrop className="ui-backdrop" />
        <Dialog.Popup className="ui-dialog settings-dialog">
          <SettingsWorkspace
            sections={sections}
            activeSection={section}
            query={query}
            resultCount={query ? 1 : 0}
            onQueryChange={setQuery}
            onSectionChange={(next) => {
              setSection(next);
              setQuery("");
            }}
            onReset={fn()}
          >
            <SettingsGroup title={active.label} description={active.description}>
              <SettingRow
                title="Example preference"
                description="The shell keeps this row readable while its control stays aligned."
                control={<button type="button" className="btn">Change</button>}
              />
            </SettingsGroup>
          </SettingsWorkspace>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const meta = {
  title: "Shell/Settings/Workspace",
  component: SettingsWorkspace,
  parameters: { layout: "fullscreen" },
  args: {
    sections,
    activeSection: "general",
    query: "",
    resultCount: 0,
    onQueryChange: fn(),
    onSectionChange: fn(),
    onReset: fn(),
    children: null,
  },
} satisfies Meta<typeof SettingsWorkspace>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CategoryNavigation: Story = {
  render: () => <WorkspaceHarness />,
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement.ownerDocument.body);
    const appearance = await screen.findByRole("button", { name: "Appearance" });
    await waitFor(() => expect(appearance).toBeVisible());
    await userEvent.click(appearance);
    await expect(screen.getByRole("heading", { name: "Appearance", level: 2 })).toBeVisible();
    await expect(appearance).toHaveAttribute("aria-current", "page");
  },
};
