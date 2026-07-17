import { describe, it, expect, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as ipc from "@/shared/ipc.ts";
import { chooseThreadAction, openFolder, renderApp } from "@/test/appHarness.tsx";

describe("OKF Studio agent security", () => {
  it("uses an ACP-advertised authentication method before starting a session", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFolder(user);

    await user.click(screen.getByRole("button", { name: /toggle agent panel/i }));
    await user.click(screen.getByRole("button", { name: "Connect an agent" }));
    await user.click(await screen.findByRole("button", { name: "Add command" }));
    await user.type(screen.getByLabelText("Name"), "Auth Harness");
    await user.type(screen.getByLabelText("Executable"), "C:\\tools\\auth.exe");
    await user.click(screen.getByRole("button", { name: "Save command" }));
    await user.click(await screen.findByRole("button", { name: "Connect Auth Harness" }));
    expect(await screen.findByText(/Authentication is required before a session/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back" }));

    expect(await screen.findByRole("heading", { name: "Authentication required" })).toBeInTheDocument();
    expect(screen.getByText("Sign in with browser")).toBeInTheDocument();
    expect(screen.getByText(/agent opens its own sign-in flow/i)).toBeInTheDocument();
    vi.spyOn(ipc, "authenticateAgent").mockRejectedValueOnce(new Error("Browser closed"));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Authentication failed. Browser closed",
    );
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("heading", { name: "Ask about this bundle" })).toBeInTheDocument();

    await chooseThreadAction(user, "Change agent");
    await user.click(await screen.findByRole("button", { name: "Disconnect" }));
    await user.click(screen.getByRole("button", { name: "Remove Auth Harness" }));
  });

  it("keeps a custom ACP connection failure visible and retryable", async () => {
    vi.spyOn(ipc, "connectCustomAgent").mockRejectedValueOnce(new Error("Handshake rejected"));
    const user = userEvent.setup();
    renderApp();
    await openFolder(user);

    await user.click(screen.getByRole("button", { name: /toggle agent panel/i }));
    await user.click(screen.getByRole("button", { name: "Connect an agent" }));
    await user.click(await screen.findByRole("button", { name: "Add command" }));
    await user.type(screen.getByLabelText("Name"), "Broken Harness");
    await user.type(screen.getByLabelText("Executable"), "C:\\tools\\broken.exe");
    await user.click(screen.getByRole("button", { name: "Save command" }));

    await user.click(await screen.findByRole("button", { name: "Connect Broken Harness" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Connection failed. Handshake rejected",
    );
    expect(screen.getByRole("button", { name: "Connect Broken Harness" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Remove Broken Harness" }));
  });

  it("shows a retryable error when the connection catalog cannot load", async () => {
    vi.spyOn(ipc, "agentCatalog").mockRejectedValueOnce(new Error("Catalog unavailable"));
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole("button", { name: /toggle agent panel/i }));
    await user.click(screen.getByRole("button", { name: "Connect an agent" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Catalog unavailable");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("retries a failed restricted-host check without blocking the catalog", async () => {
    vi.spyOn(ipc, "agentSecurityHostStatus").mockRejectedValueOnce(new Error("Probe failed"));
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole("button", { name: /toggle agent panel/i }));
    await user.click(screen.getByRole("button", { name: "Connect an agent" }));

    expect(await screen.findByRole("heading", { name: "Claude Agent" })).toBeInTheDocument();
    const hostSummary = await screen.findByText("Restricted agent host: Check failed");
    await user.click(hostSummary);
    const hostDetails = hostSummary.closest("details");
    if (!hostDetails) throw new Error("Restricted host disclosure was not rendered.");
    expect(within(hostDetails).getByRole("alert")).toHaveTextContent(
      "Studio could not check the local confinement backend.",
    );
    await user.click(within(hostDetails).getByRole("button", { name: "Retry" }));
    await waitFor(() => {
      expect(within(hostDetails).getByText(/Restricted agent host:/))
        .not.toHaveTextContent("Check failed");
    });
  });

  it("passes an explicit restricted offline mode for a custom ACP command", async () => {
    vi.spyOn(ipc, "agentSecurityHostStatus").mockResolvedValue({
      platform: "linux",
      backend: "bubblewrap",
      state: "ready",
      launchProfileAvailable: true,
    });
    const connect = vi.spyOn(ipc, "connectCustomAgent").mockRejectedValueOnce(
      new Error("Restricted launch stopped for this UI test"),
    );
    const user = userEvent.setup();
    renderApp();
    await openFolder(user);

    await user.click(screen.getByRole("button", { name: /toggle agent panel/i }));
    await user.click(screen.getByRole("button", { name: "Connect an agent" }));
    await user.click(await screen.findByRole("button", { name: "Add command" }));
    await user.type(screen.getByLabelText("Name"), "Offline Harness");
    await user.type(screen.getByLabelText("Executable"), "/usr/bin/offline-agent");
    await user.click(screen.getByRole("button", { name: "Save command" }));

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Launch mode for Offline Harness" }),
      "restricted-offline",
    );
    await user.click(screen.getByRole("button", { name: "Connect Offline Harness" }));

    expect(connect).toHaveBeenCalledWith(
      expect.any(String),
      "/mock/workspace/docs",
      "restricted-offline",
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Connection failed. Restricted launch stopped for this UI test",
    );
  });
});
