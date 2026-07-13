import { describe, expect, it } from "vitest";
import catalog from "./catalog.json";
import {
  authMethodLabel,
  catalogEntries,
  runtimeLabel,
  type AgentCatalogDocument,
} from "./catalog.ts";

describe("agent connection catalog", () => {
  it("keeps featured providers unique and explicit about their runtime", () => {
    const entries = catalogEntries(catalog as AgentCatalogDocument);
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(entries.length);
    expect(entries.filter((entry) => entry.runtime === "external-acp")).toHaveLength(2);
    expect(entries.filter((entry) => entry.runtime === "studio-native")).toHaveLength(1);
    expect(entries.filter((entry) => entry.distribution !== null)).toHaveLength(2);
    expect(entries.find((entry) => entry.id === "studio-api")?.availability)
      .toBe("configurable");
    expect(catalog.nodeRuntime.version).toBe("v24.11.0");
    expect(catalog.nodeRuntime.distributions).toHaveLength(5);
    for (const distribution of catalog.nodeRuntime.distributions) {
      expect(distribution.url).toMatch(/^https:\/\/nodejs\.org\/dist\//);
      expect(distribution.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(distribution.downloadSize).toBeGreaterThan(30_000_000);
    }
  });

  it("labels authentication and runtime choices for display", () => {
    expect(authMethodLabel("subscription")).toBe("Subscription");
    expect(authMethodLabel("api-key")).toBe("API key");
    expect(authMethodLabel("none")).toBe("No cloud account");
    expect(runtimeLabel("external-acp")).toBe("External ACP agent");
    expect(runtimeLabel("studio-native")).toBe("Studio runtime");
  });
});
