import { Menu } from "@base-ui/react/menu";
import { Bot, MessageSquarePlus, Plus, RefreshCw, TerminalSquare } from "lucide-react";
import { useRef, useState } from "react";
import type * as React from "react";
import {
  catalogEntries,
  catalogProfileId,
  type AgentCatalogEntry,
} from "../agent/catalog.ts";
import type { AgentConnectionInfo } from "../agent/connection.ts";
import type { CustomAgentProfile } from "../agent/custom.ts";
import {
  agentCatalog,
  agentInstallPreflight,
  connectCatalogAgent,
  connectCustomAgent,
  customAgents,
} from "../ipc.ts";
import { isInstallable } from "./AgentRegistryRow.tsx";

type MenuAgents =
  | { status: "loading" }
  | { status: "ready"; installed: readonly AgentCatalogEntry[]; custom: readonly CustomAgentProfile[] }
  | { status: "error"; message: string };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function loadMenuAgents(): Promise<MenuAgents> {
  try {
    const [document, custom] = await Promise.all([agentCatalog(), customAgents()]);
    const installable = catalogEntries(document).filter(isInstallable);
    const installed = await Promise.all(
      installable.map(async (entry) => {
        try {
          const preflight = await agentInstallPreflight(entry.id);
          return preflight.packageInstalled ? entry : null;
        } catch {
          return null;
        }
      }),
    );
    return {
      status: "ready",
      installed: installed.filter((entry) => entry !== null),
      custom,
    };
  } catch (error: unknown) {
    return { status: "error", message: errorMessage(error) };
  }
}

/**
 * The "+" popover in the connection switcher: start another thread with a
 * connected agent, connect an installed agent in one step, or jump to the
 * full catalog. Connecting stays an explicit choice — nothing starts on open.
 */
export function NewAgentThreadMenu({
  bundleRoot,
  connections,
  onNewThread,
  onConnected,
  onOpenCatalog,
}: {
  bundleRoot: string | null;
  connections: readonly AgentConnectionInfo[];
  onNewThread: (connectionId: string) => void;
  onConnected: (connection: AgentConnectionInfo) => void;
  onOpenCatalog: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [agents, setAgents] = useState<MenuAgents>({ status: "loading" });
  const [pendingProfileId, setPendingProfileId] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const loadVersion = useRef(0);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    setConnectError(null);
    setPendingProfileId(null);
    if (!nextOpen) return;
    const version = ++loadVersion.current;
    setAgents({ status: "loading" });
    void loadMenuAgents().then((next) => {
      if (loadVersion.current === version) setAgents(next);
    });
  }

  async function connect(profileId: string, start: () => Promise<AgentConnectionInfo>) {
    if (!bundleRoot || pendingProfileId) return;
    setPendingProfileId(profileId);
    setConnectError(null);
    try {
      const info = await start();
      setOpen(false);
      setPendingProfileId(null);
      onConnected(info);
    } catch (error: unknown) {
      setPendingProfileId(null);
      setConnectError(errorMessage(error));
    }
  }

  const connectionOf = (profileId: string) =>
    connections.find((connection) => connection.profileId === profileId);
  const installedEntries = agents.status === "ready" ? agents.installed : [];
  const customProfiles = agents.status === "ready" ? agents.custom : [];
  const disconnectedInstalled = installedEntries.filter(
    (entry) => !connectionOf(catalogProfileId(entry.id)),
  );
  const disconnectedCustom = customProfiles.filter(
    (profile) => !connectionOf(profile.id),
  );

  return (
    <Menu.Root open={open} onOpenChange={handleOpenChange}>
      <Menu.Trigger
        className="btn ghost agent-panel__connection agent-panel__connection--add"
        aria-label="Connect another agent"
        title="Connect another agent"
        onFocus={revealTrigger}
      >
        <Plus size={16} aria-hidden="true" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner
          className="ui-popover-positioner"
          side="bottom"
          align="start"
          sideOffset={6}
        >
          <Menu.Popup className="ui-popover agent-launch-menu" aria-label="Agents">
            {connections.length > 0 && (
              <Menu.Group>
                <Menu.GroupLabel className="agent-launch-menu__label">
                  New thread
                </Menu.GroupLabel>
                {connections.map((connection) => (
                  <Menu.Item
                    className="agent-launch-menu__item"
                    key={connection.connectionId}
                    onClick={() => onNewThread(connection.connectionId)}
                  >
                    <MessageSquarePlus aria-hidden="true" size={14} />
                    <span>{connection.agent?.title ?? connection.agent?.name ?? "Agent"}</span>
                  </Menu.Item>
                ))}
              </Menu.Group>
            )}

            {agents.status === "loading" && (
              <div className="agent-launch-menu__status" role="status">
                <RefreshCw aria-hidden="true" size={14} />
                <span>Checking installed agents…</span>
              </div>
            )}

            {agents.status === "error" && (
              <p className="agent-launch-menu__error" role="alert">{agents.message}</p>
            )}

            {(disconnectedInstalled.length > 0 || disconnectedCustom.length > 0) && (
              <Menu.Group>
                <Menu.GroupLabel className="agent-launch-menu__label">
                  Connect an installed agent
                </Menu.GroupLabel>
                {disconnectedInstalled.map((entry) => {
                  const profileId = catalogProfileId(entry.id);
                  return (
                    <Menu.Item
                      className="agent-launch-menu__item"
                      key={entry.id}
                      closeOnClick={false}
                      disabled={!bundleRoot || pendingProfileId !== null}
                      title={bundleRoot ? undefined : "Open an OKF bundle to connect."}
                      onClick={() =>
                        void connect(profileId, () => connectCatalogAgent(entry.id, bundleRoot ?? ""))
                      }
                    >
                      <TerminalSquare aria-hidden="true" size={14} />
                      <span>
                        {pendingProfileId === profileId ? `Connecting ${entry.name}…` : entry.name}
                      </span>
                    </Menu.Item>
                  );
                })}
                {disconnectedCustom.map((profile) => (
                  <Menu.Item
                    className="agent-launch-menu__item"
                    key={profile.id}
                    closeOnClick={false}
                    disabled={!bundleRoot || pendingProfileId !== null}
                    title={bundleRoot ? undefined : "Open an OKF bundle to connect."}
                    onClick={() =>
                      void connect(profile.id, () =>
                        connectCustomAgent(profile.id, bundleRoot ?? "", "standard"),
                      )
                    }
                  >
                    <Bot aria-hidden="true" size={14} />
                    <span>
                      {pendingProfileId === profile.id
                        ? `Connecting ${profile.name}…`
                        : profile.name}
                    </span>
                  </Menu.Item>
                ))}
              </Menu.Group>
            )}

            {connectError && (
              <p className="agent-launch-menu__error" role="alert">{connectError}</p>
            )}

            <Menu.Separator className="agent-launch-menu__separator" />
            <Menu.Item className="agent-launch-menu__item" onClick={onOpenCatalog}>
              <Plus aria-hidden="true" size={14} />
              <span>Add more agents</span>
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

function revealTrigger(event: React.FocusEvent<HTMLButtonElement>): void {
  event.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" });
}
