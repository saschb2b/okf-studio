import { PanelRightClose, Sparkles } from "lucide-react";
import { useApp } from "../store.tsx";
import "./AgentPanel.css";

export function AgentPanel() {
  const { state, actions } = useApp();
  if (!state.panels.agent) return null;

  return (
    <aside className="agent-panel" aria-label="Agent panel">
      <header className="agent-panel__head">
        <span className="agent-panel__title">
          <Sparkles size={16} aria-hidden="true" />
          Agent
        </span>
        <button
          type="button"
          className="btn ghost icon"
          aria-label="Close agent panel"
          onClick={() => actions.togglePanel("agent", false)}
        >
          <PanelRightClose size={16} />
        </button>
      </header>
      <div className="agent-panel__empty">
        <span className="agent-panel__mark" aria-hidden="true">
          <Sparkles size={24} />
        </span>
        <h2>Connect an agent</h2>
        <p>
          Use an existing subscription, an API-backed Studio Agent, or a local
          model. Nothing connects until you choose.
        </p>
        <button type="button" className="btn primary">
          Connect an agent
        </button>
      </div>
    </aside>
  );
}
