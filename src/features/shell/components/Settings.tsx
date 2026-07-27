import { Check, ChevronDown, ChevronRight, BookOpenText, Bot, Database, Download, Palette, Settings2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Select } from "@base-ui/react/select";
import { Checkbox } from "@base-ui/react/checkbox";
import { NumberField } from "@base-ui/react/number-field";
import { hasUnseenUpdate, useApp } from "@/shared/store.tsx";
import { DEFAULT_SETTINGS } from "@/shared/types.ts";
import type { Bundle, Settings as SettingsModel, ThemeMode } from "@/shared/types.ts";
import { ZOOM_EVENT } from "@/shared/platform/native.ts";
import type { ZoomIntent } from "@/shared/platform/native.ts";
import { checkForUpdate, installUpdate, RELEASES_URL } from "@/shared/platform/updater.ts";
import type { UpdateStatus } from "@/shared/platform/updater.ts";
import {
  requestAgentNotificationPermission,
  sendRoutineAttentionNotification,
} from "@/shared/platform/notifications.ts";
import { runDueOkfRoutines } from "@/shared/ipc.ts";
import { attentionRuns } from "@/features/agent/routines.ts";
import { OkfCapabilitySettings } from "./OkfCapabilitySettings.tsx";
import { WorkspaceMemorySettings } from "@/features/agent/components/WorkspaceMemorySettings.tsx";
import { OkfRoutineSettings } from "@/features/agent/components/OkfRoutineSettings.tsx";
import { OkfMcpGrantSettings } from "@/features/agent/components/OkfMcpGrantSettings.tsx";
import { bundleContextFingerprint } from "@/features/agent/taskContext.ts";
import {
  SettingRow,
  SettingsEmptyState,
  SettingsGroup,
  SettingsWorkspace,
} from "./SettingsWorkspace.tsx";
import type {
  SettingsNavigationItem,
  SettingsSectionId,
} from "./SettingsWorkspace.tsx";
import "@/shared/styles/chrome.css";
import "@/shared/styles/baseui.css";
import "./Settings.css";

const THEME_LABELS: Record<ThemeMode, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

const READER_SCALE_MIN = 0.8;
const READER_SCALE_MAX = 1.6;
const READER_SCALE_STEP = 0.1;
const SCALE_OPTIONS = [0.9, 1.0, 1.15, 1.3] as const;
const SCALE_LABELS: Record<string, string> = {
  "0.9": "Small",
  "1": "Default",
  "1.15": "Large",
  "1.3": "Larger",
};

const SETTINGS_SECTIONS = [
  {
    id: "general",
    label: "General",
    description: "Control how Studio discovers bundles and applies local preferences.",
    icon: Settings2,
  },
  {
    id: "appearance",
    label: "Appearance",
    description: "Choose the interface theme and motion behavior.",
    icon: Palette,
  },
  {
    id: "reading",
    label: "Reading",
    description: "Tune the concept reader without scaling the rest of the app.",
    icon: BookOpenText,
  },
  {
    id: "agents",
    label: "Agents",
    description: "Manage agent attention and inspect Studio's OKF methods.",
    icon: Bot,
  },
  {
    id: "knowledge",
    label: "Knowledge",
    description: "Manage local memory, routines, and bounded access for the open bundle.",
    icon: Database,
  },
  {
    id: "updates",
    label: "Updates",
    description: "See the release you are on and choose when a new one installs.",
    icon: Download,
  },
] as const satisfies readonly SettingsNavigationItem[];

interface SettingsSearchItem {
  id: string;
  section: SettingsSectionId;
  title: string;
  description: string;
  keywords: string;
}

const SETTINGS_SEARCH_ITEMS: readonly SettingsSearchItem[] = [
  {
    id: "scan-depth",
    section: "general",
    title: "Bundle scan depth",
    description: "Set how far bundle discovery descends into subfolders.",
    keywords: "autodetect discovery folder nesting max depth",
  },
  {
    id: "theme",
    section: "appearance",
    title: "Theme",
    description: "Follow the operating system or choose a light or dark interface.",
    keywords: "system light dark color appearance",
  },
  {
    id: "reduce-motion",
    section: "appearance",
    title: "Reduce motion",
    description: "Limit interface transitions and animated movement.",
    keywords: "accessibility animation transition motion",
  },
  {
    id: "reader-size",
    section: "reading",
    title: "Reader text size",
    description: "Scale concept prose without changing the graph or app chrome.",
    keywords: "font zoom text scale concept reader",
  },
  {
    id: "agent-notifications",
    section: "agents",
    title: "Background agent notifications",
    description: "Choose whether finished, failed, or blocked background work can notify you.",
    keywords: "desktop permission background thread alert attention",
  },
  {
    id: "notification-sound",
    section: "agents",
    title: "Notification sound",
    description: "Allow sound for agent notifications when the operating system permits it.",
    keywords: "audio alert desktop agent",
  },
  {
    id: "okf-capabilities",
    section: "agents",
    title: "OKF capability pack",
    description: "Inspect the versioned OKF methods, tools, schemas, and digests supplied to agents.",
    keywords: "skills methods contracts foundation legacy catalog manifest",
  },
  {
    id: "workspace-memory",
    section: "knowledge",
    title: "Workspace memory",
    description: "Inspect and delete bounded local preferences for the open bundle.",
    keywords: "bundle context retention local metadata stale delete",
  },
  {
    id: "local-routines",
    section: "knowledge",
    title: "Local routines",
    description: "Run or schedule deterministic bundle checks without an agent.",
    keywords: "health source fingerprint schedule daily attention inbox",
  },
  {
    id: "external-access",
    section: "knowledge",
    title: "Use this bundle from another agent",
    description: "Create a one-shot read-only MCP descriptor for the open bundle.",
    keywords: "grant external mcp descriptor read only access",
  },
  {
    id: "application-updates",
    section: "updates",
    title: "Application updates",
    description: "Check the latest release and install or download it explicitly.",
    keywords: "version release install restart download github",
  },
  {
    id: "update-notify",
    section: "updates",
    title: "New release badge",
    description: "Show a quiet dot on the settings icon when a new version exists.",
    keywords: "notify automatic launch check version dot indicator badge",
  },
];

function clampScale(value: number): number {
  return Math.min(READER_SCALE_MAX, Math.max(READER_SCALE_MIN, value));
}

function roundScale(value: number): number {
  return Math.round(value * 10) / 10;
}

function scaleLabel(value: number): string {
  return SCALE_LABELS[String(value)] ?? `${Math.round(value * 100)}%`;
}

function updateHint(status: UpdateStatus, updateNotify: boolean): string {
  switch (status.kind) {
    case "checking":
      return "Checking the latest release...";
    case "available":
      return status.canInstall
        ? `Version ${status.version} is ready to install.`
        : `Version ${status.version} is available. Download the new package to upgrade.`;
    case "installing":
      return "Downloading and installing. The app will restart.";
    case "uptodate":
      return "You are on the latest version.";
    case "error":
      return status.message;
    case "idle":
      return updateNotify
        ? "Studio looks for a new release shortly after launch. You can also check now."
        : "The launch check is off. Studio checks only when you select this action.";
  }
}

function sectionLabel(sectionId: SettingsSectionId): string {
  return SETTINGS_SECTIONS.find((section) => section.id === sectionId)?.label ?? sectionId;
}

function SettingsToggle({
  label,
  checked,
  disabled = false,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <Checkbox.Root
      className="settings-toggle"
      aria-label={label}
      checked={checked}
      disabled={disabled}
      onCheckedChange={onCheckedChange}
    >
      <span className="settings-toggle__thumb" aria-hidden="true" />
    </Checkbox.Root>
  );
}

function ThemeSelect({
  value,
  onChange,
}: {
  value: ThemeMode;
  onChange: (value: ThemeMode) => void;
}) {
  return (
    <Select.Root value={value} onValueChange={(next) => { if (next) onChange(next); }}>
      <Select.Trigger className="ui-select-trigger" aria-label="Theme">
        <Select.Value>
          {(selected) => THEME_LABELS[(selected as ThemeMode | null) ?? "system"]}
        </Select.Value>
        <Select.Icon className="ui-select-icon" aria-hidden="true">
          <ChevronDown size={14} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner className="ui-select-positioner" sideOffset={4}>
          <Select.Popup className="ui-select-popup">
            {(Object.keys(THEME_LABELS) as ThemeMode[]).map((mode) => (
              <Select.Item key={mode} value={mode} className="ui-select-item">
                <Select.ItemText>{THEME_LABELS[mode]}</Select.ItemText>
                <Select.ItemIndicator className="ui-select-check">
                  <Check size={13} aria-hidden="true" />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

function ReaderScaleSelect({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <Select.Root value={value} onValueChange={(next) => onChange(roundScale(Number(next)))}>
      <Select.Trigger className="ui-select-trigger" aria-label="Reader text size">
        <Select.Value>
          {(selected) => scaleLabel((selected as number | null) ?? 1)}
        </Select.Value>
        <Select.Icon className="ui-select-icon" aria-hidden="true">
          <ChevronDown size={14} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner className="ui-select-positioner" sideOffset={4}>
          <Select.Popup className="ui-select-popup">
            {SCALE_OPTIONS.map((scale) => (
              <Select.Item key={scale} value={scale} className="ui-select-item">
                <Select.ItemText>{scaleLabel(scale)}</Select.ItemText>
                <Select.ItemIndicator className="ui-select-check">
                  <Check size={13} aria-hidden="true" />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

function GeneralSettings({
  settings,
  onUpdate,
}: {
  settings: SettingsModel;
  onUpdate: (patch: Partial<SettingsModel>) => void;
}) {
  return (
    <SettingsGroup
      title="Bundle discovery"
      description="Discovery stays bounded to the folder you opened and skips generated directories."
    >
      <SettingRow
        id="setting-scan-depth"
        title="Bundle scan depth"
        description="How many folder levels autodetect examines below the folder you opened."
        control={(
          <NumberField.Root
            value={settings.scanMaxDepth}
            min={1}
            max={64}
            onValueChange={(value) => {
              if (value != null) onUpdate({ scanMaxDepth: Math.floor(value) });
            }}
          >
            <NumberField.Group className="ui-numberfield-group">
              <NumberField.Decrement className="ui-numberfield-btn" aria-label="Decrease scan depth">
                &minus;
              </NumberField.Decrement>
              <NumberField.Input className="ui-numberfield-input" aria-label="Bundle scan depth" />
              <NumberField.Increment className="ui-numberfield-btn" aria-label="Increase scan depth">
                +
              </NumberField.Increment>
            </NumberField.Group>
          </NumberField.Root>
        )}
      />
    </SettingsGroup>
  );
}

function AppearanceSettings({
  settings,
  onUpdate,
}: {
  settings: SettingsModel;
  onUpdate: (patch: Partial<SettingsModel>) => void;
}) {
  return (
    <SettingsGroup
      title="Interface"
      description="Appearance follows the operating system by default and remains local to Studio."
    >
      <SettingRow
        id="setting-theme"
        title="Theme"
        description="Follow the operating system or keep Studio light or dark."
        control={<ThemeSelect value={settings.theme} onChange={(theme) => onUpdate({ theme })} />}
      />
      <SettingRow
        id="setting-jarvis-mode"
        title="Jarvis Mode"
        description="Stage each agent turn as a sequence of panels naming what it retrieved, what it dropped, and why. Reduce motion still applies."
        control={(
          <SettingsToggle
            label="Jarvis Mode"
            checked={settings.jarvisMode}
            onCheckedChange={(jarvisMode) => onUpdate({ jarvisMode })}
          />
        )}
      />
      <SettingRow
        id="setting-reduce-motion"
        title="Reduce motion"
        description="Limit transitions and animated movement throughout the interface."
        control={(
          <SettingsToggle
            label="Reduce motion"
            checked={settings.reduceMotion}
            onCheckedChange={(reduceMotion) => onUpdate({ reduceMotion })}
          />
        )}
      />
    </SettingsGroup>
  );
}

function ReadingSettings({
  settings,
  onUpdate,
}: {
  settings: SettingsModel;
  onUpdate: (patch: Partial<SettingsModel>) => void;
}) {
  return (
    <SettingsGroup
      title="Concept reader"
      description="Reading preferences affect concept prose. The graph and application chrome keep their size."
    >
      <SettingRow
        id="setting-reader-size"
        title="Reader text size"
        description="Ctrl/Cmd +, -, and 0 adjust the same setting when focus is outside the graph."
        control={(
          <ReaderScaleSelect
            value={settings.readerScale}
            onChange={(readerScale) => onUpdate({ readerScale })}
          />
        )}
      />
    </SettingsGroup>
  );
}

function AgentSettings({
  settings,
  notificationBusy,
  notificationError,
  onNotificationChange,
  onUpdate,
}: {
  settings: SettingsModel;
  notificationBusy: boolean;
  notificationError: string | null;
  onNotificationChange: (checked: boolean) => void;
  onUpdate: (patch: Partial<SettingsModel>) => void;
}) {
  return (
    <>
      <SettingsGroup
        title="Attention"
        description="Notifications reveal only the bounded thread title, agent, and completion or permission state."
      >
        <SettingRow
          id="setting-agent-notifications"
          title="Background agent notifications"
          description="Request operating-system permission when enabling this setting. Studio stays silent while focused."
          control={(
            <SettingsToggle
              label="Background agent notifications"
              checked={settings.agentNotifications}
              disabled={notificationBusy}
              onCheckedChange={onNotificationChange}
            />
          )}
        />
        <SettingRow
          id="setting-notification-sound"
          title="Notification sound"
          description="Allow sound when notifications are enabled. Operating-system focus and sound settings still win."
          control={(
            <SettingsToggle
              label="Notification sound"
              checked={settings.agentNotificationSound}
              disabled={!settings.agentNotifications || notificationBusy}
              onCheckedChange={(agentNotificationSound) => onUpdate({ agentNotificationSound })}
            />
          )}
        />
        {notificationError && <p className="settings-inline-error" role="alert">{notificationError}</p>}
      </SettingsGroup>

      <div id="setting-okf-capabilities" className="settings-anchor" tabIndex={-1}>
        <OkfCapabilitySettings />
      </div>
    </>
  );
}

function KnowledgeSettings({ activeRoot, bundle }: { activeRoot: string | null; bundle: Bundle | null }) {
  if (!activeRoot || !bundle) {
    return (
      <SettingsEmptyState
        id="setting-knowledge-scope"
        title="Open a bundle to manage its knowledge settings"
        description="Workspace memory, local routines, and one-shot external access are always scoped to one open bundle."
        icon={Database}
      />
    );
  }

  return (
    <div className="settings-bundle-scope">
      <div className="settings-bundle-scope__header">
        <span>Active bundle</span>
        <strong>{bundle.name}</strong>
      </div>
      <div id="setting-workspace-memory" className="settings-anchor" tabIndex={-1}>
        <WorkspaceMemorySettings
          bundleRoot={activeRoot}
          bundleName={bundle.name}
          fingerprint={bundleContextFingerprint(activeRoot, bundle.concepts, bundle.issues)}
        />
      </div>
      <div id="setting-local-routines" className="settings-anchor" tabIndex={-1}>
        <OkfRoutineSettings bundleRoot={activeRoot} bundleName={bundle.name} />
      </div>
      <div id="setting-external-access" className="settings-anchor" tabIndex={-1}>
        <OkfMcpGrantSettings bundleRoot={activeRoot} />
      </div>
    </div>
  );
}

function UpdateSettings({
  status,
  settings,
  onUpdate,
  onCheck,
  onInstall,
  onDownload,
}: {
  status: UpdateStatus;
  settings: SettingsModel;
  onUpdate: (patch: Partial<SettingsModel>) => void;
  onCheck: () => void;
  onInstall: (version: string) => void;
  onDownload: (version: string) => void;
}) {
  const isBusy = status.kind === "checking" || status.kind === "installing";
  let control;
  if (status.kind === "available") {
    control = status.canInstall ? (
      <button type="button" className="btn primary" onClick={() => onInstall(status.version)}>
        Install v{status.version} and restart
      </button>
    ) : (
      <button type="button" className="btn primary" onClick={() => onDownload(status.version)}>
        Download v{status.version}
      </button>
    );
  } else {
    control = (
      <button type="button" className="btn" disabled={isBusy} onClick={onCheck}>
        {status.kind === "checking"
          ? "Checking..."
          : status.kind === "installing"
            ? `Installing v${status.version}...`
            : "Check for updates"}
      </button>
    );
  }

  return (
    <SettingsGroup
      title="Application updates"
      description="Installing or downloading a release is always your explicit action. The one quiet network call is the launch check below, and it can be turned off."
    >
      <SettingRow
        id="setting-application-updates"
        title="Current release"
        description={updateHint(status, settings.updateNotify)}
        control={control}
      />
      <SettingRow
        id="setting-update-notify"
        title="New release badge"
        description="Look for a new release once shortly after launch and show a quiet dot on the settings icon. Nothing downloads or installs on its own."
        control={(
          <SettingsToggle
            label="New release badge"
            checked={settings.updateNotify}
            onCheckedChange={(updateNotify) => onUpdate({ updateNotify })}
          />
        )}
      />
    </SettingsGroup>
  );
}

function SettingsSearchResults({
  results,
  onSelect,
}: {
  results: readonly SettingsSearchItem[];
  onSelect: (item: SettingsSearchItem) => void;
}) {
  if (results.length === 0) {
    return (
      <SettingsEmptyState
        title="No settings found"
        description="Try a broader term such as theme, reader, agent, memory, routine, or update."
      />
    );
  }

  return (
    <ul className="settings-search-results">
      {results.map((item) => (
        <li key={item.id}>
          <button type="button" className="settings-search-result" onClick={() => onSelect(item)}>
            <span>
              <small>{sectionLabel(item.section)}</small>
              <strong>{item.title}</strong>
              <span>{item.description}</span>
            </span>
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}

export interface SettingsProps {
  initialSection?: SettingsSectionId;
  initialQuery?: string;
}

export function Settings({
  initialSection = "general",
  initialQuery = "",
}: SettingsProps = {}) {
  const { state, actions } = useApp();
  const settings = state.settings;
  const [activeSection, setActiveSection] = useState<SettingsSectionId>(initialSection);
  const [query, setQuery] = useState(initialQuery);
  const [focusTarget, setFocusTarget] = useState<string | null>(null);
  // Updater state lives in the store (fed by the quiet launch check too), so
  // this dialog and the activity-bar badge always tell the same story.
  const update = state.updateStatus;
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [notificationBusy, setNotificationBusy] = useState(false);

  // The badge trail continues on the Updates nav item, and viewing that
  // section is the acknowledgment: the release counts as seen, the dots go
  // away, and they stay away for this version.
  const showUpdateBadge = hasUnseenUpdate(state);
  const sections = showUpdateBadge
    ? SETTINGS_SECTIONS.map((section) =>
        section.id === "updates" ? { ...section, badge: true } : section)
    : SETTINGS_SECTIONS;
  useEffect(() => {
    if (!state.settingsOpen || activeSection !== "updates") return;
    if (update.kind === "available" && update.version !== state.updateSeenVersion) {
      actions.markUpdateSeen(update.version);
    }
  }, [state.settingsOpen, activeSection, update, state.updateSeenVersion, actions]);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const searchResults = normalizedQuery.length === 0
    ? []
    : SETTINGS_SEARCH_ITEMS.filter((item) => {
        const category = sectionLabel(item.section);
        return `${item.title} ${item.description} ${item.keywords} ${category}`
          .toLocaleLowerCase()
          .includes(normalizedQuery);
      });

  useEffect(() => {
    const onZoom = (event: Event): void => {
      const intent = (event as CustomEvent<ZoomIntent>).detail;
      if (intent === 0) {
        actions.updateSettings({ readerScale: 1 });
        return;
      }
      const next = clampScale(settings.readerScale + intent * READER_SCALE_STEP);
      actions.updateSettings({ readerScale: roundScale(next) });
    };
    window.addEventListener(ZOOM_EVENT, onZoom);
    return () => window.removeEventListener(ZOOM_EVENT, onZoom);
  }, [settings.readerScale, actions]);

  useEffect(() => {
    if (!state.activeRoot) return;
    let active = true;
    const poll = () => void runDueOkfRoutines().then((runs) => {
      const count = attentionRuns(runs).length;
      if (active && settings.agentNotifications && count > 0) {
        void sendRoutineAttentionNotification({
          count,
          sound: settings.agentNotificationSound,
        });
      }
    }).catch(() => {
      // Rust records blocked and revoked routine runs in the local ledger.
    });
    poll();
    const timer = window.setInterval(poll, 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [state.activeRoot, settings.agentNotificationSound, settings.agentNotifications]);

  useEffect(() => {
    if (!focusTarget || query.length > 0) return;
    const frame = window.requestAnimationFrame(() => {
      const target = document.getElementById(`setting-${focusTarget}`)
        ?? document.getElementById("settings-content-title");
      target?.focus();
      setFocusTarget(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeSection, focusTarget, query]);

  async function changeNotifications(checked: boolean) {
    if (notificationBusy) return;
    setNotificationBusy(true);
    setNotificationError(null);
    try {
      if (!checked) {
        actions.updateSettings({ agentNotifications: false });
      } else if (await requestAgentNotificationPermission()) {
        actions.updateSettings({ agentNotifications: true });
      } else {
        setNotificationError(
          "Desktop notifications remain off because the operating system denied permission.",
        );
      }
    } catch {
      setNotificationError("Studio could not request desktop notification permission.");
    }
    setNotificationBusy(false);
  }

  function changeSection(section: SettingsSectionId) {
    setActiveSection(section);
    setQuery("");
    setFocusTarget(null);
  }

  function selectSearchResult(item: SettingsSearchItem) {
    setActiveSection(item.section);
    setFocusTarget(
      item.section === "knowledge" && (!state.activeRoot || !state.bundle)
        ? "knowledge-scope"
        : item.id,
    );
    setQuery("");
  }

  let content;
  if (normalizedQuery.length > 0) {
    content = <SettingsSearchResults results={searchResults} onSelect={selectSearchResult} />;
  } else {
    switch (activeSection) {
      case "general":
        content = <GeneralSettings settings={settings} onUpdate={(patch) => actions.updateSettings(patch)} />;
        break;
      case "appearance":
        content = <AppearanceSettings settings={settings} onUpdate={(patch) => actions.updateSettings(patch)} />;
        break;
      case "reading":
        content = <ReadingSettings settings={settings} onUpdate={(patch) => actions.updateSettings(patch)} />;
        break;
      case "agents":
        content = (
          <AgentSettings
            settings={settings}
            notificationBusy={notificationBusy}
            notificationError={notificationError}
            onNotificationChange={(checked) => void changeNotifications(checked)}
            onUpdate={(patch) => actions.updateSettings(patch)}
          />
        );
        break;
      case "knowledge":
        content = <KnowledgeSettings activeRoot={state.activeRoot} bundle={state.bundle} />;
        break;
      case "updates":
        content = (
          <UpdateSettings
            status={update}
            settings={settings}
            onUpdate={(patch) => actions.updateSettings(patch)}
            onCheck={() => void checkForUpdate((s) => actions.setUpdateStatus(s))}
            onInstall={(version) => void installUpdate((s) => actions.setUpdateStatus(s), version)}
            onDownload={() => actions.openExternal(RELEASES_URL)}
          />
        );
        break;
    }
  }

  return (
    <Dialog.Root open={state.settingsOpen} onOpenChange={(open) => actions.setSettingsOpen(open)}>
      <Dialog.Portal>
        <Dialog.Backdrop className="ui-backdrop" />
        <Dialog.Popup className="ui-dialog settings-dialog">
          <SettingsWorkspace
            sections={sections}
            activeSection={activeSection}
            query={query}
            resultCount={searchResults.length}
            onQueryChange={setQuery}
            onSectionChange={changeSection}
            onReset={() => actions.updateSettings(DEFAULT_SETTINGS)}
          >
            {content}
          </SettingsWorkspace>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
