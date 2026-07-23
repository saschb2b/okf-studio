import { describe, it, expect } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import * as ipc from "@/shared/ipc.ts";
import { openBundle, renderApp } from "@/test/appHarness.tsx";

// Automated accessibility gate (Microsoft "run axe checks in CI" best practice).
// Renders the real app over the mock backend and runs axe on the result. Colour
// contrast needs real layout (unavailable in jsdom), so it is verified via the
// design tokens (see docs/ux/theming.md) and disabled here; this test covers the
// structural rules — names, roles, ARIA, landmarks, labels.

async function expectNoViolations(node: Element) {
  const results = await axe.run(node, {
    rules: { "color-contrast": { enabled: false } },
  });
  const summary = results.violations.map(
    (v) =>
      `${v.id} (${v.impact}) — ${v.help} @ ${v.nodes
        .map((n) => n.target.join(" "))
        .join(" | ")}`,
  );
  expect(summary).toEqual([]);
}

describe("accessibility (axe-core)", () => {
  it("the first-run empty state has no violations", async () => {
    const { container } = renderApp();
    await screen.findByText(/Explore connected knowledge with the agents you already use/i);
    await expectNoViolations(container);
  });

  it("the open bundle (workspace) has no violations", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openBundle(user);
    await expectNoViolations(container);
  });

  it("the disconnected agent panel has no violations", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await user.click(screen.getByRole("button", { name: /toggle agent panel/i }));
    await screen.findByRole("complementary", { name: /agent panel/i });
    await expectNoViolations(container);
  });

  it("the agent connection catalog has no violations", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await user.click(screen.getByRole("button", { name: /toggle agent panel/i }));
    await user.click(screen.getByRole("button", { name: "Connect an agent" }));
    await screen.findByRole("heading", { name: /choose how agents run/i });
    await user.click(screen.getByRole("button", { name: "Configure" }));
    await user.selectOptions(screen.getByLabelText("Provider"), "open-ai-compatible");
    await screen.findByLabelText(/API key/);
    await expectNoViolations(container);
  });

  it("agent security scope and parallel-thread close confirmation have no violations", async () => {
    const profile = await ipc.saveCustomAgent({
      name: "A11y Harness",
      executable: "C:\\tools\\a11y.exe",
      arguments: [],
      environment: [],
    });
    const connection = await ipc.connectCustomAgent(profile.id, "/mock/workspace/docs");

    try {
      const user = userEvent.setup();
      const { container } = renderApp();
      await openBundle(user);
      await user.click(screen.getByRole("button", { name: /toggle agent panel/i }));
      await user.click(screen.getByRole("button", { name: "Thread security scope" }));
      await screen.findByRole("dialog", { name: "Thread security scope" });
      await expectNoViolations(container);
      await user.keyboard("{Escape}");
      await user.click(screen.getByRole("button", { name: "More thread actions" }));
      await screen.findByRole("menu", { name: "More thread actions" });
      await expectNoViolations(container);
      await user.keyboard("{Escape}");
      await user.click(screen.getByRole("button", {
        name: "Start another thread with A11y Harness",
      }));
      await user.click(screen.getByRole("button", { name: "Close thread surface" }));
      await screen.findByRole("button", { name: "Close thread" });
      await expectNoViolations(container);
    } finally {
      cleanup();
      await ipc.disconnectAgent(connection.connectionId);
      await ipc.removeCustomAgent(profile.id);
    }
  }, 10_000);

  it("the settings dialog has no violations", async () => {
    const user = userEvent.setup();
    renderApp();
    await openBundle(user);
    await user.click(screen.getByRole("button", { name: /open settings/i }));
    await expectNoViolations(await screen.findByRole("dialog"));
  });

  it("the shortcuts overlay has no violations", async () => {
    const user = userEvent.setup();
    renderApp();
    await openBundle(user);
    await user.keyboard("?");
    await expectNoViolations(await screen.findByRole("dialog"));
  });

  it("the bundle switcher has no violations", async () => {
    const user = userEvent.setup();
    renderApp();
    await openBundle(user);
    await user.click(screen.getByRole("button", { name: /switch bundle/i }));
    const popup = await screen.findByLabelText("Bundle switcher");
    await expectNoViolations(popup);
  });

  it("the bundle details dialog has no violations", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openBundle(user);
    await user.click(screen.getByRole("button", { name: /open bundle details/i }));
    await screen.findByRole("dialog", { name: "Bundle details" });
    await expectNoViolations(container);
  });
});
