import { useApp } from "./store.tsx";
import { useGlobalKeys } from "./keys.ts";
import { TopBar } from "./components/TopBar.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { GraphView } from "./components/GraphView.tsx";
import { Reader } from "./components/Reader.tsx";
import { CommandPalette } from "./components/CommandPalette.tsx";
import { ValidationPanel } from "./components/ValidationPanel.tsx";
import { LogView } from "./components/LogView.tsx";
import { Settings } from "./components/Settings.tsx";
import { EmptyState } from "./components/EmptyState.tsx";

export function App() {
  const { state } = useApp();
  useGlobalKeys();

  return (
    <div className="app">
      <TopBar />
      {state.bundle ? (
        <div className="workspace">
          {state.panels.sidebar && (
            <aside className="pane sidebar">
              <Sidebar />
            </aside>
          )}
          <main className="pane graph">
            <GraphView />
          </main>
          {state.panels.reader && (
            <section className="pane reader">
              <Reader />
            </section>
          )}
        </div>
      ) : (
        <EmptyState />
      )}

      {state.panels.log && <LogView />}
      {state.panels.validation && <ValidationPanel />}
      {state.palette && <CommandPalette />}
      {/* Settings renders always; its Base UI Dialog controls visibility via open state. */}
      <Settings />
    </div>
  );
}
