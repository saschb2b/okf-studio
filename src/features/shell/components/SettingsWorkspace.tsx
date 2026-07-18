import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Search, X } from "lucide-react";
import { Dialog } from "@base-ui/react/dialog";
import "./SettingsWorkspace.css";

export type SettingsSectionId =
  | "general"
  | "appearance"
  | "reading"
  | "agents"
  | "knowledge"
  | "updates";

export interface SettingsNavigationItem {
  id: SettingsSectionId;
  label: string;
  description: string;
  icon: LucideIcon;
}

interface SettingsWorkspaceProps {
  sections: readonly SettingsNavigationItem[];
  activeSection: SettingsSectionId;
  query: string;
  resultCount: number;
  onQueryChange: (query: string) => void;
  onSectionChange: (section: SettingsSectionId) => void;
  onReset: () => void;
  children: ReactNode;
}

export function SettingsWorkspace({
  sections,
  activeSection,
  query,
  resultCount,
  onQueryChange,
  onSectionChange,
  onReset,
  children,
}: SettingsWorkspaceProps) {
  const active = sections.find((section) => section.id === activeSection) ?? sections[0];
  const isSearching = query.trim().length > 0;

  return (
    <div className="settings-workspace">
      <header className="settings-workspace__header">
        <div>
          <Dialog.Title className="settings-workspace__title">Settings</Dialog.Title>
          <p>Preferences are stored on this device and apply as soon as you change them.</p>
        </div>
        <Dialog.Close className="btn ghost icon" aria-label="Close settings">
          <X size={16} aria-hidden="true" />
        </Dialog.Close>
      </header>

      <div className="settings-workspace__body">
        <aside className="settings-workspace__sidebar">
          <label className="settings-search">
            <Search size={16} aria-hidden="true" />
            <span className="sr-only">Search settings</span>
            <input
              type="search"
              value={query}
              placeholder="Search settings"
              onChange={(event) => onQueryChange(event.target.value)}
            />
          </label>

          <nav className="settings-nav" aria-label="Settings categories">
            {sections.map((section) => {
              const Icon = section.icon;
              return (
                <button
                  key={section.id}
                  type="button"
                  aria-current={!isSearching && section.id === activeSection ? "page" : undefined}
                  onClick={() => onSectionChange(section.id)}
                >
                  <Icon size={16} aria-hidden="true" />
                  <span>{section.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="settings-workspace__main">
          <div className="settings-workspace__mobile-nav">
            <label htmlFor="settings-category">Category</label>
            <select
              id="settings-category"
              value={activeSection}
              onChange={(event) => {
                const next = sections.find((section) => section.id === event.target.value);
                if (next) onSectionChange(next.id);
              }}
            >
              {sections.map((section) => (
                <option key={section.id} value={section.id}>{section.label}</option>
              ))}
            </select>
          </div>

          <header className="settings-workspace__content-header">
            <p>{isSearching ? "Settings search" : "Local preferences"}</p>
            <h2 id="settings-content-title" tabIndex={-1}>
              {isSearching ? "Search results" : active.label}
            </h2>
            <span>
              {isSearching
                ? `${resultCount} ${resultCount === 1 ? "result" : "results"} for “${query.trim()}”`
                : active.description}
            </span>
          </header>

          <div
            className="settings-workspace__content"
            aria-labelledby="settings-content-title"
          >
            {children}
          </div>
        </main>
      </div>

      <footer className="settings-workspace__footer">
        <span>Saved automatically</span>
        <div>
          <button type="button" className="btn" onClick={onReset}>Reset to defaults</button>
          <Dialog.Close className="btn primary">Done</Dialog.Close>
        </div>
      </footer>
    </div>
  );
}

interface SettingsGroupProps {
  title: string;
  description: string;
  children: ReactNode;
}

export function SettingsGroup({ title, description, children }: SettingsGroupProps) {
  return (
    <section className="settings-group">
      <header>
        <h3>{title}</h3>
        <p>{description}</p>
      </header>
      <div className="settings-group__rows">{children}</div>
    </section>
  );
}

interface SettingRowProps {
  id?: string;
  title: string;
  description: string;
  control: ReactNode;
}

export function SettingRow({ id, title, description, control }: SettingRowProps) {
  return (
    <div id={id} className="setting-row" tabIndex={id ? -1 : undefined}>
      <div>
        <h4>{title}</h4>
        <p>{description}</p>
      </div>
      <div className="setting-row__control">{control}</div>
    </div>
  );
}

interface SettingsEmptyStateProps {
  id?: string;
  title: string;
  description: string;
  icon?: LucideIcon;
}

export function SettingsEmptyState({
  id,
  title,
  description,
  icon: Icon = Search,
}: SettingsEmptyStateProps) {
  return (
    <div id={id} className="settings-empty-state" role="status" tabIndex={id ? -1 : undefined}>
      <Icon size={20} aria-hidden="true" />
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </div>
  );
}
