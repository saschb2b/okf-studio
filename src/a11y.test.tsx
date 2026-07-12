import { beforeEach, describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { App } from "./App.tsx";
import { AppProvider } from "./store.tsx";

// Automated accessibility gate (Microsoft "run axe checks in CI" best practice).
// Renders the real app over the mock backend and runs axe on the result. Colour
// contrast needs real layout (unavailable in jsdom), so it is verified via the
// design tokens (see docs/ux/theming.md) and disabled here; this test covers the
// structural rules — names, roles, ARIA, landmarks, labels.

function renderApp() {
  return render(
    <AppProvider>
      <App />
    </AppProvider>,
  );
}

beforeEach(() => localStorage.clear());

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

async function openBundle(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getAllByRole("button", { name: /open folder/i })[0]);
  await screen.findByRole("button", { name: /switch bundle/i });
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
    await expectNoViolations(container);
  });

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
});
