import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { App } from "@/App.tsx";
import { AppProvider } from "@/shared/store.tsx";

export function renderApp({ strictMode = false }: { strictMode?: boolean } = {}) {
  const app = (
    <AppProvider>
      <App />
    </AppProvider>
  );
  return render(
    strictMode ? <StrictMode>{app}</StrictMode> : app,
  );
}

export async function openBundle(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getAllByRole("button", { name: /open folder/i })[0]);
  await screen.findByRole("button", { name: /switch bundle/i });
}

export const openFolder = openBundle;

export async function openBundleAtOverview(user: ReturnType<typeof userEvent.setup>) {
  await openBundle(user);
  await user.click(screen.getByRole("treeitem", { name: "Overview" }));
  await screen.findByRole("heading", { name: "Overview", level: 1 });
}

export async function openAttachmentMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Add context or sources" }));
}

export async function openThreadActions(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "More thread actions" }));
}

export async function chooseThreadAction(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
) {
  await openThreadActions(user);
  await user.click(await screen.findByRole("menuitem", { name }));
}
