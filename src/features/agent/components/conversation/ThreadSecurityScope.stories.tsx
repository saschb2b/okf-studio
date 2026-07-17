import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { ThreadSecurityScope } from "./ThreadChrome.tsx";

const meta = {
  title: "Agent/Conversation/ThreadSecurityScope",
  component: ThreadSecurityScope,
  args: {
    bundleName: "Studio roadmap",
    scope: {
      evidenceSource: "external-process-launcher",
      processContainment: "posix-process-group",
      profile: {
        id: "external-interactive-unrestricted-v1",
        effectiveMounts: "host-operating-system",
        writableRoots: "host-operating-system-permissions",
        networkPolicy: "host-operating-system",
        credentialExposure: "host-operating-system-and-launch-environment",
        lifetime: "connection",
        stopConditions: ["disconnect", "application-exit", "host-failure"],
        unattendedEligible: false,
      },
    },
  },
} satisfies Meta<typeof ThreadSecurityScope>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InteractiveExternal: Story = {};

export const RestrictedUnattended: Story = {
  args: {
    scope: {
      evidenceSource: "external-process-launcher",
      processContainment: "posix-process-group",
      profile: {
        id: "external-linux-restricted-offline-v1",
        effectiveMounts: "system-runtime-agent-and-read-only-bundle",
        writableRoots: "private-temporary-only",
        networkPolicy: "isolated",
        credentialExposure: "launch-environment-only",
        lifetime: "connection",
        stopConditions: ["disconnect", "application-exit", "host-failure"],
        unattendedEligible: true,
      },
    },
  },
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Thread security scope" }));
    const page = within(canvasElement.ownerDocument.body);
    const popup = await page.findByRole("dialog", { name: "Thread security scope" });
    await expect(popup).toHaveTextContent("Eligible for unattended work");
    await expect(popup).toHaveTextContent("expires after 30 minutes");
    await expect(popup).not.toHaveTextContent("not a filesystem or network sandbox");
  },
};
