export const AGENT_PANEL_OPENER_ID = "agent-panel-opener";

export function focusAgentPanel(): void {
  requestAnimationFrame(() => {
    document.querySelector<HTMLElement>("[data-agent-initial-focus]")?.focus();
  });
}

export function focusAgentPanelOpener(): void {
  requestAnimationFrame(() => {
    document.getElementById(AGENT_PANEL_OPENER_ID)?.focus();
  });
}
