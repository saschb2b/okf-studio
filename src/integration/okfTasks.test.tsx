import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as ipc from "@/shared/ipc.ts";
import { openAgentThread, openFolder, renderApp } from "@/test/appHarness.tsx";

describe("native OKF task entry points", () => {
  it("reviews, validates, applies, and restores a safe concept move", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFolder(user);
    await user.click(screen.getByRole("button", {
      name: /Overview What OKF Studio is and who it's for/i,
    }));

    // Move lives in the reader header's overflow menu — rare, reviewed, and one
    // click away from the actions a reader uses constantly.
    const origin = screen.getByRole("button", { name: "More concept actions" });
    await user.click(origin);
    await user.click(await screen.findByRole("menuitem", { name: /Move concept/ }));
    const dialog = await screen.findByRole("dialog", { name: "Move concept" });
    expect(within(dialog).getByLabelText("Destination path"))
      .toHaveValue("archive/overview.md");

    await user.click(within(dialog).getByRole("button", { name: "Review move" }));
    while (within(dialog).queryAllByRole("button", { name: "Review file" }).length > 0) {
      await user.click(within(dialog).getAllByRole("button", { name: "Review file" })[0]);
    }
    for (const keep of within(dialog).getAllByRole("button", { name: "Keep" })) {
      await user.click(keep);
    }

    const validate = within(dialog).getByRole("button", { name: "Validate" });
    await waitFor(() => expect(validate).toBeEnabled());
    await user.click(validate);
    expect(await within(dialog).findByRole("status", { name: "Concept move validation" }))
      .toHaveTextContent("OKF validation passed");

    await user.click(within(dialog).getByRole("button", { name: "Apply move" }));
    expect(await within(dialog).findByRole("heading", { name: "Concept moved" }))
      .toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Restore" }));
    expect(await within(dialog).findByRole("heading", { name: "Move restored" }))
      .toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Done" }));
    await waitFor(() => expect(origin).toHaveFocus());
  });

  it("records and restores a reviewed concept deprecation", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFolder(user);
    await user.click(screen.getByRole("button", {
      name: /Overview What OKF Studio is and who it's for/i,
    }));

    const origin = screen.getByRole("button", { name: "More concept actions" });
    await user.click(origin);
    await user.click(await screen.findByRole("menuitem", { name: /Retire concept/ }));
    const dialog = await screen.findByRole("dialog", { name: "Retire concept" });
    expect(within(dialog).getByRole("radio", { name: /Deprecate/i })).toBeChecked();
    await user.type(
      within(dialog).getByLabelText("Reason"),
      "A newer overview is now authoritative",
    );
    await user.click(within(dialog).getByRole("button", { name: "Review deprecate" }));
    expect(await within(dialog).findByRole("region", { name: "Retirement impact" }))
      .toHaveTextContent("retrieval adds a lifecycle caveat");

    while (within(dialog).queryAllByRole("button", { name: "Review file" }).length > 0) {
      await user.click(within(dialog).getAllByRole("button", { name: "Review file" })[0]);
    }
    for (const keep of within(dialog).getAllByRole("button", { name: "Keep" })) {
      await user.click(keep);
    }
    const validate = within(dialog).getByRole("button", { name: "Validate" });
    await waitFor(() => expect(validate).toBeEnabled());
    await user.click(validate);
    expect(await within(dialog).findByRole("status", { name: "Concept retirement validation" }))
      .toHaveTextContent("OKF validation passed");

    await user.click(within(dialog).getByRole("button", { name: "Apply deprecate" }));
    expect(await within(dialog).findByRole("heading", { name: "Retirement applied" }))
      .toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Restore" }));
    expect(await within(dialog).findByRole("heading", { name: "Retirement restored" }))
      .toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Done" }));
    await waitFor(() => expect(origin).toHaveFocus());
  });

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
