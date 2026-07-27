// A file-stored computation has to reach the reading column.
//
// This is the regression the OKF v0.2 migration introduced: promoting
// `runtime`, `parameters`, `computation`, `executor` and `attester` out of
// `Concept.extra` made them invisible, because the Metadata Inspector renders
// `extra`. A computation stored in a *file* was worse than invisible — it is a
// path, not body content, so nothing put it on the page at all.
//
// The unit tests cover the materializer and the path-safety gate. This covers
// the thing neither can: that the whole route actually runs in the app — the
// concept opens, the backend serves a `.sql` file the general text door refuses
// to serve, and the query lands in the body.

import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { openBundle, renderApp } from "@/test/appHarness.tsx";
import * as ipc from "@/shared/ipc.ts";

describe("attested computation", () => {
  it("renders a file-stored computation in the reading column", async () => {
    const user = userEvent.setup();
    renderApp();
    await openBundle(user);

    await user.click(
      await screen.findByRole("button", { name: /search and commands/i }),
    );
    const combo = await screen.findByRole("combobox");
    await user.type(combo, "Recognized revenue");
    // Several results match the query (the concept, and prose mentioning it);
    // the first is the concept itself.
    const results = await screen.findAllByRole("option", { name: /Recognized revenue/i });
    await user.click(results[0]);

    // The contract, from the rail.
    expect(await screen.findByText("bigquery")).toBeVisible();
    expect(screen.getByText("computations/recognized-revenue.sql")).toBeVisible();

    // The computation itself, in the body under the same heading an inline one
    // would use. This is what rendered nowhere before.
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /^Computation$/ }),
      ).toBeVisible();
    });
    await waitFor(() => {
      expect(screen.getByText(/recognized_revenue/)).toBeVisible();
    });
  });

  it("serves the computation only through the declaration-scoped door", async () => {
    // `.sql` is deliberately not a permitted text asset, so the general door
    // refuses it. That refusal is the reason the scoped door exists: it is
    // authorized by the concept's own declaration rather than by extension, so
    // widening the allowlist to every language a runtime accepts was not
    // needed. If this ever starts returning content, the narrow grant has been
    // replaced by a broad one.
    expect(
      await ipc.readAsset("/mock/workspace/docs", "computations/recognized-revenue.sql"),
    ).toBeNull();

    expect(
      await ipc.readDeclaredComputation(
        "/mock/workspace/docs",
        "metrics/recognized-revenue",
      ),
    ).toContain("recognized_revenue");

    // A concept that declares no computation reaches nothing, even though the
    // file plainly exists.
    expect(
      await ipc.readDeclaredComputation("/mock/workspace/docs", "product/overview"),
    ).toBeNull();
  });
});
