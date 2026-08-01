import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AppProvider } from "@/shared/store.tsx";
import { TopBar } from "./TopBar.tsx";

// The shell is read from the user-agent when the bar renders, so a case only
// has to define the property before rendering. Defined on the instance rather
// than swapping navigator wholesale: jsdom's navigator carries more than the
// user-agent, and a replacement object loses the rest.
function renderTopBarWith(userAgent: string) {
  Object.defineProperty(navigator, "userAgent", { value: userAgent, configurable: true });
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
});

describe("TopBar window controls", () => {
  it("draws minimize, maximize, and close on the desktop shell", () => {
    renderTopBarWith(DESKTOP_UA);
    expect(screen.getByLabelText("Minimize")).toBeInTheDocument();
    expect(screen.getByLabelText("Maximize")).toBeInTheDocument();
    expect(screen.getByLabelText("Close")).toBeInTheDocument();
  });

  it("draws none of them on Android", () => {
    // The Android activity is sized and closed by the system. Caption buttons
    // there are three controls that either do nothing or close the app by
    // surprise, in the space the bundle name needs on a narrower screen.
    renderTopBarWith(ANDROID_UA);
    expect(screen.queryByLabelText("Minimize")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Maximize")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Close")).not.toBeInTheDocument();
  });
});
