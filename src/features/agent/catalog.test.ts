import { describe, expect, it } from "vitest";
import catalog from "@/features/agent/catalog.json";
import {
  authMethodLabel,
  catalogEntries,
  runtimeLabel,
  type AgentCatalogDocument,
} from "@/features/agent/catalog.ts";

describe("agent connection catalog", () => {
  it("keeps featured providers unique and explicit about their runtime", () => {
    const entries = catalogEntries(catalog as AgentCatalogDocument);
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(entries.length);
    expect(entries.filter((entry) => entry.runtime === "external-acp")).toHaveLength(12);
    expect(entries.filter((entry) => entry.runtime === "studio-native")).toHaveLength(1);
    expect(entries.filter((entry) => entry.distribution !== null)).toHaveLength(9);
    expect(entries.find((entry) => entry.id === "studio-api")?.availability)
      .toBe("configurable");
    expect(catalog.nodeRuntime.version).toBe("v24.18.0");
    expect(catalog.nodeRuntime.distributions).toHaveLength(5);
    for (const distribution of catalog.nodeRuntime.distributions) {
      expect(distribution.url).toMatch(/^https:\/\/nodejs\.org\/dist\//);
      expect(distribution.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(distribution.downloadSize).toBeGreaterThan(30_000_000);
    }
  });

  it("pins every installable distribution to a verified archive", () => {
    const entries = catalogEntries(catalog as AgentCatalogDocument);
    const nonInstallable = entries.filter((entry) => entry.availability !== "installable");
    expect(nonInstallable.map((entry) => entry.distribution))
      .toEqual(nonInstallable.map(() => null));

    const distributions = entries
      .filter((entry) => entry.availability === "installable")
      .map((entry) => {
        const { distribution } = entry;
        if (!distribution) throw new Error(`${entry.id} is installable without a distribution`);
        return distribution;
      });

    const binaries = distributions.filter((distribution) => distribution.kind === "binary");
    expect(binaries).toHaveLength(1);
    for (const distribution of binaries) {
      const targets = Object.entries(distribution.targets);
      expect(targets.length).toBeGreaterThan(0);
      for (const [name, target] of targets) {
        expect(name).toMatch(/^(windows|linux|macos)-(x86_64|aarch64)$/);
        expect(target.url).toMatch(/^https:\/\//);
        expect(target.sha256).toMatch(/^[0-9a-f]{64}$/);
        expect(target.downloadSize).toBeGreaterThan(0);
        expect(target.downloadSize).toBeLessThanOrEqual(256 * 1024 * 1024);
        expect(target.unpackedSize).toBeGreaterThanOrEqual(target.downloadSize);
        expect(target.executable.startsWith(`${target.root}/`)).toBe(true);
        for (const path of target.pathArguments) {
          expect(path.startsWith(`${target.root}/`)).toBe(true);
        }
      }
    }

    const npmPackages = distributions.filter((distribution) => distribution.kind === "npm");
    expect(npmPackages).toHaveLength(8);
    for (const distribution of npmPackages) {
      expect(distribution.kind).toBe("npm");
      expect(distribution.tarball).toMatch(/^https:\/\/registry\.npmjs\.org\//);
      expect(distribution.integrity).toMatch(/^sha512-/);
      expect(distribution.downloadSize).toBeGreaterThan(0);
      expect(distribution.downloadSize).toBeLessThanOrEqual(64 * 1024 * 1024);
      expect(distribution.unpackedSize).toBeGreaterThanOrEqual(distribution.downloadSize);
      expect(distribution.entrypoint.length).toBeGreaterThan(0);
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
