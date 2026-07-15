import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentSessionConfigOption } from "@/features/agent/connection.ts";
import { AgentSessionControls, orderedSessionOptions } from "@/features/agent/components/AgentSessionControls.tsx";

const OPTIONS: readonly AgentSessionConfigOption[] = [
  {
    id: "custom",
    name: "Concise",
    description: "Prefer concise responses.",
    category: "custom",
    type: "boolean",
    currentValue: false,
  },
  {
    id: "model",
    name: "Model",
    description: "Session model.",
    category: "model",
    type: "select",
    currentValue: "a",
    groups: [{
      id: "models",
      name: "Models",
      options: [
        { value: "a", name: "Model A", description: "Balanced." },
        { value: "b", name: "Model B", description: "Fast." },
      ],
    }],
  },
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
      options: [{ value: "agent", name: "Agent", description: null }],
    }],
  },
];

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("AgentSessionControls", () => {
  it("keeps semantic controls first and preserves unknown-option order", () => {
    expect(orderedSessionOptions(OPTIONS).map((option) => option.id))
      .toEqual(["mode", "model", "custom"]);
  });

  it("searches grouped values and sends only the advertised value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <AgentSessionControls
        options={OPTIONS}
        pendingOptionId={null}
        failure={null}
        favoriteScope="test"
        disabled={false}
        onChange={onChange}
        onRetry={() => undefined}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Model: Model A" }));
    await user.type(screen.getByRole("textbox", { name: "Search Model" }), "fast");
    await user.click(screen.getByRole("button", { name: "Model B Fast." }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: "model" }),
      { type: "select", value: "b" },
    );
  });

  it("keeps the confirmed value visible while pending and exposes retry on failure", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const { rerender } = render(
      <AgentSessionControls
        options={OPTIONS}
        pendingOptionId="model"
        failure={null}
        favoriteScope="test"
        disabled={false}
        onChange={() => undefined}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByRole("button", { name: "Model: Model A" })).toBeDisabled();

    rerender(
      <AgentSessionControls
        options={OPTIONS}
        pendingOptionId={null}
        failure={{
          optionId: "model",
          requestedValue: { type: "select", value: "b" },
          message: "Rejected.",
        }}
        favoriteScope="test"
        disabled={false}
        onChange={() => undefined}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByRole("button", { name: "Model: Model A" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("cycles a focused selector in advertised order", () => {
    const onChange = vi.fn();
    render(
      <AgentSessionControls
        options={OPTIONS}
        pendingOptionId={null}
        failure={null}
        favoriteScope="test"
        disabled={false}
        onChange={onChange}
        onRetry={() => undefined}
      />,
    );
    fireEvent.keyDown(screen.getByRole("button", { name: "Model: Model A" }), {
      key: "ArrowRight",
      altKey: true,
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: "model" }),
      { type: "select", value: "b" },
    );
  });

  it("keeps boolean options in the configuration popover", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <AgentSessionControls
        options={OPTIONS}
        pendingOptionId={null}
        failure={null}
        favoriteScope="test"
        disabled={false}
        onChange={onChange}
        onRetry={() => undefined}
      />,
    );
    await user.click(screen.getAllByRole("button", { name: /Configure session/ })[0]);
    await user.click(screen.getByRole("checkbox", { name: /Concise/ }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: "custom" }),
      { type: "boolean", value: true },
    );
  });

  it("removes controls when the agent replaces its option set", () => {
    const { rerender } = render(
      <AgentSessionControls
        options={OPTIONS}
        pendingOptionId={null}
        failure={null}
        favoriteScope="test"
        disabled={false}
        onChange={() => undefined}
        onRetry={() => undefined}
      />,
    );
    expect(screen.getByRole("button", { name: "Model: Model A" })).toBeInTheDocument();
    rerender(
      <AgentSessionControls
        options={OPTIONS.filter((option) => option.id !== "model")}
        pendingOptionId={null}
        failure={null}
        favoriteScope="test"
        disabled={false}
        onChange={() => undefined}
        onRetry={() => undefined}
      />,
    );
    expect(screen.queryByRole("button", { name: "Model: Model A" })).not.toBeInTheDocument();
  });

  it("renders nothing when the agent advertises no controls", () => {
    const { container } = render(
      <AgentSessionControls
        options={[]}
        pendingOptionId={null}
        failure={null}
        favoriteScope="test"
        disabled={false}
        onChange={() => undefined}
        onRetry={() => undefined}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
