import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { useRef } from "react";
import { ResponseActions } from "./ResponseActions.tsx";

function ResponseActionsExample() {
  const responseRef = useRef<HTMLDivElement>(null);
  return (
    <div>
      <div ref={responseRef}>The canonical order definition excludes draft carts.</div>
      <ResponseActions
        selectionRootRef={responseRef}
        responseText="The canonical order definition excludes draft carts."
      />
    </div>
  );
}

const meta = {
  title: "Agent/Conversation/ResponseActions",
  component: ResponseActionsExample,
} satisfies Meta<typeof ResponseActionsExample>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CompleteResponse: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Copy response" })).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "Copy selection" })).toBeNull();

  },
};
