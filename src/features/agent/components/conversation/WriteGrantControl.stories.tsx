import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent } from "storybook/test";
import { WriteGrantControl } from "./WriteGrantControl.tsx";

const meta = {
  title: "Agent/Conversation/WriteGrantControl",
  component: WriteGrantControl,
  args: {
    granted: false,
    activeMode: null,
    preferredMode: "interactive",
    unattendedEligible: false,
    disabled: false,
    pending: false,
    onPreferredModeChange: fn(),
    onToggle: fn(),
  },
} satisfies Meta<typeof WriteGrantControl>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InteractiveOnly: Story = {
  play: async ({ args, canvas }) => {
    await expect(canvas.queryByRole("combobox", { name: "Edit access mode" })).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Allow edits in this thread" }));
    await expect(args.onToggle).toHaveBeenCalledOnce();
  },
};

export const RestrictedHost: Story = {
  args: { unattendedEligible: true },
  play: async ({ args, canvas }) => {
    await userEvent.selectOptions(
      canvas.getByRole("combobox", { name: "Edit access mode" }),
      "unattended",
    );
    await expect(args.onPreferredModeChange).toHaveBeenCalledWith("unattended");
  },
};

export const UnattendedActive: Story = {
  args: {
    granted: true,
    activeMode: "unattended",
    preferredMode: "unattended",
    unattendedEligible: true,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Unattended edits allowed in this thread" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(canvas.getByRole("combobox", { name: "Edit access mode" })).toBeDisabled();
  },
};

export const Pending: Story = {
  args: {
    unattendedEligible: true,
    pending: true,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Allow edits in this thread" })).toBeDisabled();
  },
};
