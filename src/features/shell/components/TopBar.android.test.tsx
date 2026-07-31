import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// `isAndroidShell` is read once at module load, so the user-agent has to be in
// place before the module graph is imported. Each case therefore resets the
// registry and imports what it renders, provider included: a provider from the
// stale registry would hand the freshly imported bar a different context object
// and it would render nothing at all.
async function renderTopBarWith(userAgent: string) {
  // Defined on the instance rather than swapped wholesale: jsdom's navigator
  // carries more than the user-agent, and a replacement object loses the rest.
  Object.defineProperty(navigator, "userAgent", { value: userAgent, configurable: true });
  vi.resetModules();
  const [{ TopBar }, { AppProvider }] = await Promise.all([
    import("./TopBar.tsx"),
    import("@/shared/store.tsx"),
  ]);
  render(
    <AppProvider>
      <TopBar />
    </AppProvider>,
  );
}

const DESKTOP_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 15; Pixel Tablet) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const JSDOM_UA = navigator.userAgent;

afterEach(() => {
  Object.defineProperty(navigator, "userAgent", { value: JSDOM_UA, configurable: true });
  vi.resetModules();
});

describe("TopBar window controls", () => {
  it("draws minimize, maximize, and close on the desktop shell", async () => {
    await renderTopBarWith(DESKTOP_UA);
    expect(screen.getByLabelText("Minimize")).toBeInTheDocument();
    expect(screen.getByLabelText("Maximize")).toBeInTheDocument();
    expect(screen.getByLabelText("Close")).toBeInTheDocument();
  });

  it("draws none of them on Android", async () => {
    // The Android activity is sized and closed by the system. Caption buttons
    // there are three controls that either do nothing or close the app by
    // surprise, in the space the bundle name needs on a narrower screen.
    await renderTopBarWith(ANDROID_UA);
    expect(screen.queryByLabelText("Minimize")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Maximize")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Close")).not.toBeInTheDocument();
  });
});
