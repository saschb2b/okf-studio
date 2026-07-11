import { describe, expect, it } from "vitest";
import { AGENT_CATALOG, authMethodLabel, runtimeLabel } from "./catalog.ts";

describe("agent connection catalog", () => {
  it("keeps featured providers unique and explicit about their runtime", () => {
    expect(new Set(AGENT_CATALOG.map((entry) => entry.id)).size).toBe(
      AGENT_CATALOG.length,
    );
    expect(AGENT_CATALOG.filter((entry) => entry.runtime === "external-acp")).toHaveLength(2);
    expect(AGENT_CATALOG.filter((entry) => entry.runtime === "studio-native")).toHaveLength(2);
  });

  it("labels authentication and runtime choices for display", () => {
    expect(authMethodLabel("subscription")).toBe("Subscription");
    expect(authMethodLabel("api-key")).toBe("API key");
    expect(authMethodLabel("none")).toBe("No cloud account");
    expect(runtimeLabel("external-acp")).toBe("External ACP agent");
    expect(runtimeLabel("studio-native")).toBe("Studio runtime");
  });
});
