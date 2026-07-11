import { useSyncExternalStore } from "react";
import { activeAgentConnections, subscribeAgentConnections } from "../ipc.ts";

export function useAgentConnections() {
  return useSyncExternalStore(
    subscribeAgentConnections,
    activeAgentConnections,
    activeAgentConnections,
  );
}
