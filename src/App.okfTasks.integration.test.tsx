import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as ipc from "@/shared/ipc.ts";
import { openAgentThread, openFolder, renderApp } from "@/test/appHarness.tsx";

describe("native OKF task entry points", () => {
  it("starts a bounded task from the reader without replacing the current thread", async () => {
    const { user } = await openAgentThread("Task Launcher Harness");

    await user.click(screen.getByRole("button", {
      name: "Close agent panel and return to workspace",
    }));
    await user.click(screen.getByRole("button", {
      name: /Overview What OKF Studio is and who it's for/i,
    }));
    await user.click(screen.getByRole("button", { name: "Work with agent" }));
    const launcher = await screen.findByRole("dialog", { name: "Start OKF work" });
    expect(within(launcher).getByText(/Concept:/)).toBeInTheDocument();

    await user.click(within(launcher).getByRole("radio", {
      name: "Research with cited evidence",
    }));
    expect(within(launcher).getByRole("region", { name: "Research with cited evidence" }))
      .toHaveTextContent("active concept");
    const bundleSet = await within(launcher).findByRole("region", { name: "Bundle set" });
    await user.click(within(bundleSet).getByRole("checkbox", {
      name: /Primer design system/i,
    }));
    await waitFor(() => expect(within(launcher).getByRole("button", { name: "Start task" }))
      .toBeEnabled());
    await user.click(within(launcher).getByRole("button", { name: "Start task" }));

    const prompts = screen.getAllByLabelText<HTMLTextAreaElement>("Message the agent");
    const visiblePrompt = prompts.find((prompt) => !prompt.closest("[hidden]"));
    expect(visiblePrompt?.value).toContain("cited evidence");
    expect(screen.getByRole("button", { name: "Remove Federated OKF concepts source" }))
      .toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Federated OKF sources source" }))
      .toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /New thread, idle/i })).toHaveLength(2);
  });

  it("returns focus to the originating reader action when cancelled", async () => {
    const { user } = await openAgentThread("Task Launcher Focus Harness");

    await user.click(screen.getByRole("button", {
      name: "Close agent panel and return to workspace",
    }));
    await user.click(screen.getByRole("button", {
      name: /Overview What OKF Studio is and who it's for/i,
    }));
    const origin = screen.getByRole("button", { name: "Work with agent" });
    await user.click(origin);
    const launcher = await screen.findByRole("dialog", { name: "Start OKF work" });

    await user.click(within(launcher).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(origin).toHaveFocus());
  });

  it("preserves the task while the user chooses an authentication method", async () => {
    const profile = await ipc.saveCustomAgent({
      name: "Auth Task Harness",
      executable: "C:\\tools\\auth.exe",
      arguments: [],
      environment: [],
    });
    const connection = await ipc.connectCustomAgent(profile.id, "/mock/workspace/docs");
    const user = userEvent.setup();
    renderApp();
    await openFolder(user);
    await user.click(screen.getByRole("button", { name: /toggle agent panel/i }));
    expect(await screen.findByRole("heading", { name: "Authentication required" }))
      .toBeInTheDocument();

    await user.click(screen.getByRole("button", {
      name: "Close agent panel and return to workspace",
    }));
    await user.click(screen.getByRole("button", {
      name: /Overview What OKF Studio is and who it's for/i,
    }));
    await user.click(screen.getByRole("button", { name: "Work with agent" }));
    let launcher = await screen.findByRole("dialog", { name: "Start OKF work" });
    expect(within(launcher).getByText(/needs authentication/i)).toBeInTheDocument();

    await user.click(within(launcher).getByRole("button", { name: "Authenticate" }));
    expect(screen.queryByRole("dialog", { name: "Start OKF work" })).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Authentication required" }))
      .toBeInTheDocument();
    expect(screen.getByText("Sign in with browser")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue" }));

    launcher = await screen.findByRole("dialog", { name: "Start OKF work" });
    expect(within(launcher).getByText(/Concept:/)).toHaveTextContent("Overview");
    await user.click(within(launcher).getByRole("button", { name: "Cancel" }));
    await ipc.disconnectAgent(connection.connectionId);
    await ipc.removeCustomAgent(profile.id);
  });
});
