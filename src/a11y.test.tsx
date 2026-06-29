import { describe, it, expect } from "vitest";
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

async function expectNoViolations(container: HTMLElement) {
  const results = await axe.run(container, {
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
    await screen.findByText(/Read your knowledge as a graph/i);
    await expectNoViolations(container);
  });

  it("the open bundle (workspace) has no violations", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await user.click(screen.getAllByRole("button", { name: /open folder/i })[0]);
    await screen.findByText("OKF Viewer (sample)");
    await expectNoViolations(container);
  });
});
