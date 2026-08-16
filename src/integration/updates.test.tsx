// The update badge: a quiet launch check feeds the store, an unseen release
// shows a warn dot on the Settings gear, the trail continues on the Updates
// nav item, and viewing that section acknowledges the release for good.

import { describe, it, expect, vi, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as ipc from "@/shared/ipc.ts";
import * as updater from "@/shared/platform/updater.ts";
import { DEFAULT_SETTINGS } from "@/shared/types.ts";
import { renderApp } from "@/test/appHarness.tsx";

const SEEN_KEY = "okf-viewer:update-seen";

afterEach(() => {
  localStorage.removeItem(SEEN_KEY);
});

describe("update badge", () => {
  it("surfaces a new release as a quiet badge and clears it once seen", async () => {
    vi.spyOn(updater, "checkForUpdateQuietly").mockResolvedValue({
      kind: "available",
      version: "9.9.9",
      canInstall: true,
    });
    const user = userEvent.setup();
    renderApp();

    // The gear gains the badge and says why, without any dialog or toast.
    const gear = await screen.findByRole("button", {
      name: "Open settings, update available",
    });
    await user.click(gear);

    // The trail continues on the Updates nav item inside Settings.
    await user.click(screen.getByRole("button", { name: /Updates.*update available/ }));
    expect(await screen.findByText("Version 9.9.9 is ready to install.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Install v9.9.9 and restart" }),
    ).toBeInTheDocument();

    // Viewing the section acknowledges the release: the badge is gone and the
    // acknowledgment persists, so the next launch stays quiet for 9.9.9.
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(await screen.findByRole("button", { name: "Open settings" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Open settings, update available" }),
    ).not.toBeInTheDocument();
    expect(localStorage.getItem(SEEN_KEY)).toBe("9.9.9");
  });

  it("stays quiet when the launch check finds nothing", async () => {
    const check = vi
      .spyOn(updater, "checkForUpdateQuietly")
      .mockResolvedValue(null);
    renderApp();

    await vi.waitFor(() => expect(check).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: "Open settings" })).toBeInTheDocument();
  });

  it("skips the launch check entirely when the badge setting is off", async () => {
    vi.spyOn(ipc, "loadSettings").mockResolvedValue({
      ...DEFAULT_SETTINGS,
      updateNotify: false,
    });
    const check = vi.spyOn(updater, "checkForUpdateQuietly");
    const recentBundles = vi.spyOn(ipc, "recentBundles");
    renderApp();

    // Boot has settled once recents resolve; the updater was never consulted.
    await vi.waitFor(() => expect(recentBundles).toHaveBeenCalledOnce());
    expect(check).not.toHaveBeenCalled();
  });
});
