// The composer's session-configuration rail: mode/model/thought-level as
// primary text controls, booleans behind the compact popover, plus the
// pending and failed-change states.
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import type { AgentSessionConfigOption } from "@/features/agent/connection.ts";
import { AgentSessionControls } from "./AgentSessionControls.tsx";

const OPTIONS: AgentSessionConfigOption[] = [
  {
    id: "mode",
    name: "Mode",
    description: null,
    category: "mode",
    type: "select",
    currentValue: "agent",
    groups: [{
      id: null,
      name: null,
      options: [
        { value: "agent", name: "Agent", description: "Read and propose edits." },
        { value: "plan", name: "Plan", description: "Read-only planning." },
      ],
    }],
  },
  {
    id: "model",
    name: "Model",
    description: "Session model.",
    category: "model",
    type: "select",
    currentValue: "fable",
    groups: [{
      id: "models",
      name: "Models",
      options: [
        { value: "fable", name: "Fable", description: "Deep reasoning." },
        { value: "opus", name: "Opus", description: "Balanced." },
        { value: "haiku", name: "Haiku", description: "Fast." },
      ],
    }],
  },
  {
    id: "thought-level",
    name: "Thought level",
    description: null,
    category: "thought-level",
    type: "select",
    currentValue: "high",
    groups: [{
      id: null,
      name: null,
      options: [
        { value: "low", name: "Low", description: null },
        { value: "high", name: "High", description: null },
      ],
    }],
  },
  {
    id: "fast-mode",
    name: "Fast mode",
    description: "Faster output on the same model.",
    category: null,
    type: "boolean",
    currentValue: false,
  },
];

const meta = {
  title: "Agent/Panel/SessionControls",
  component: AgentSessionControls,
  args: {
    options: OPTIONS,
    pendingOptionId: null,
    failure: null,
    favoriteScope: "storybook",
    disabled: false,
    onChange: fn(),
    onRetry: fn(),
  },
} satisfies Meta<typeof AgentSessionControls>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Picking a grouped value sends only the advertised value. */
export const PickModel: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Model: Fable" }));
    const doc = within(canvasElement.ownerDocument.body);
    await userEvent.click(await doc.findByRole("button", { name: "Haiku Fast." }));
    await waitFor(() =>
      expect(args.onChange).toHaveBeenCalledWith(
        expect.objectContaining({ id: "model" }),
        { type: "select", value: "haiku" },
      ),
    );
  },
};

/** A change in flight disables its control. */
export const Pending: Story = {
  args: { pendingOptionId: "model" },
};

/** A rejected change surfaces beside the rail with a retry. */
export const ChangeFailed: Story = {
  args: {
    failure: {
      optionId: "model",
      requestedValue: { type: "select", value: "haiku" },
      message: "The agent rejected the model change.",
    },
  },
};

/** While a turn runs, every control is disabled. */
export const Disabled: Story = {
  args: { disabled: true },
};
