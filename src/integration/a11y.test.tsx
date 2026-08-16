import { describe, it, expect } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import * as ipc from "@/shared/ipc.ts";
import { openBundle, renderApp } from "@/test/appHarness.tsx";

// Automated accessibility gate (Microsoft "run axe checks in CI" best practice).
// Renders the real app over the mock backend and runs axe on the result. Colour
// contrast needs real layout (unavailable in jsdom), so it is verified via the
// design tokens (see docs/ux/theming.md) and disabled here; this test covers the
// structural rules — names, roles, ARIA, landmarks, labels.
//
// Scan `baseElement`, never the render container. Every dialog, menu, and
// popover here goes through a Base UI portal onto document.body, which is a
// sibling of the container rather than a child of it: measured, a scan of the
// container saw 346 elements and none of the open dialog, while baseElement
// saw 494 including it. Scanning the container reported green on surfaces it
// had never looked at.

// The three pane splitters are `role="separator"` widgets that sit between
// landmarks by construction: each is a flex sibling of the panes it resizes,
// so it cannot live inside either one without breaking the layout. They carry
// no content, so the region rule's concern (content a landmark navigator can
// never reach) does not apply to them. Excluded by selector rather than by
// switching the rule off, so region still runs over every other element.
const SPLITTERS = [
  ".agent-panel-divider",
  '[aria-label="Resize sidebar"]',
  '[aria-label="Resize reader"]',
];

/**
 * @param overlayOpen a portalled dialog, menu, or popover is on screen. Those
 *   render onto document.body outside every landmark, and a reader reaches
 *   them through focus rather than by walking landmarks, so the page-level
 *   `region` rule is dropped for them. Every other rule still runs over the
 *   overlay, which is the coverage this test exists for.
 */
async function expectNoViolations(node: Element, overlayOpen = false) {
  const results = await axe.run(
    { include: [node], exclude: SPLITTERS.map((selector) => [selector]) },
    {
      rules: {
        "color-contrast": { enabled: false },
        ...(overlayOpen ? { region: { enabled: false } } : {}),
      },
    },
  );
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
    const { baseElement } = renderApp();
    await screen.findByText(/Explore connected knowledge with the agents you already use/i);
    await expectNoViolations(baseElement);
  });

  it("the open bundle (workspace) has no violations", async () => {
    const user = userEvent.setup();
    const { baseElement } = renderApp();
    await openBundle(user);
    await expectNoViolations(baseElement);
  });

  it("the disconnected agent panel has no violations", async () => {
    const user = userEvent.setup();
    const { baseElement } = renderApp();
    await user.click(screen.getByRole("button", { name: /toggle agent panel/i }));
    await screen.findByRole("complementary", { name: /agent panel/i });
    await expectNoViolations(baseElement);
  });

  it("the agent connection catalog has no violations", async () => {
    const user = userEvent.setup();
    const { baseElement } = renderApp();
    await user.click(screen.getByRole("button", { name: /toggle agent panel/i }));
    await user.click(screen.getByRole("button", { name: "Connect an agent" }));
    await screen.findByRole("heading", { name: /choose how agents run/i });
    await user.click(screen.getByRole("button", { name: "Configure" }));
    await user.selectOptions(screen.getByLabelText("Provider"), "open-ai-compatible");
    await screen.findByLabelText(/API key/);
    await expectNoViolations(baseElement, true);
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
      const { baseElement } = renderApp();
      await openBundle(user);
      await user.click(screen.getByRole("button", { name: /toggle agent panel/i }));
      await user.click(screen.getByRole("button", { name: "Thread security scope" }));
      await screen.findByRole("dialog", { name: "Thread security scope" });
      await expectNoViolations(baseElement, true);
      await user.keyboard("{Escape}");
      await user.click(screen.getByRole("button", { name: "More thread actions" }));
      await screen.findByRole("menu", { name: "More thread actions" });
      await expectNoViolations(baseElement, true);
      await user.keyboard("{Escape}");
      await user.click(screen.getByRole("button", {
        name: "Start another thread with A11y Harness",
      }));
      await user.click(screen.getByRole("button", { name: "Close thread surface" }));
      await screen.findByRole("button", { name: "Close thread" });
      await expectNoViolations(baseElement, true);
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
    const { baseElement } = renderApp();
    await openBundle(user);
    await user.click(screen.getByRole("button", { name: /open bundle details/i }));
    const dialog = await screen.findByRole("dialog", { name: "Bundle details" });
    await user.click(within(dialog).getByRole("tab", { name: "Connections" }));
    await within(dialog).findByRole("heading", { name: "Connections" });
    await user.click(within(dialog).getByRole("button", { name: "Open connections" }));
    const connections = await screen.findByRole("dialog", { name: "Bundle connections" });
    await within(connections).findByRole("heading", { name: "External sources" });
    await user.click(within(connections).getByRole("tab", { name: /diagnostics/i }));
    await within(connections).findByRole("heading", { name: "Interoperability diagnostics" });
    await user.click(within(connections).getByRole("button", { name: "Close bundle connections" }));
    await user.click(screen.getByRole("button", { name: /open bundle details/i }));
    const reopenedDialog = await screen.findByRole("dialog", { name: "Bundle details" });
    await user.click(within(reopenedDialog).getByRole("tab", { name: "Ignore rules" }));
    await within(reopenedDialog).findByRole("heading", { name: "Ignore rules" });
    await user.click(within(reopenedDialog).getByRole("tab", { name: "Profiles" }));
    await within(reopenedDialog).findByRole("heading", { name: "Advisory profiles" });
    await expectNoViolations(baseElement);
  });

  it("Bundle Home has no violations", async () => {
    const user = userEvent.setup();
    const { baseElement } = renderApp();
    await openBundle(user);
    await user.click(screen.getByRole("button", { name: "Bundle home" }));
    await screen.findByRole("region", { name: "Bundle home" });
    await expectNoViolations(baseElement);
  });
});
