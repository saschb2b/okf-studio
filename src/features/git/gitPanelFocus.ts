export const GIT_PANEL_OPENER_ID = "git-panel-opener";

export function focusGitPanel(): void {
  requestAnimationFrame(() => {
    document.querySelector<HTMLElement>("[data-git-initial-focus]")?.focus();
  });
}

export function focusGitPanelOpener(): void {
  requestAnimationFrame(() => {
    document.getElementById(GIT_PANEL_OPENER_ID)?.focus();
  });
}
