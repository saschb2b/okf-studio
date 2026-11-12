import { describe, it, expect } from "vitest";
import { parseRemoteSource } from "./remoteSource.ts";

describe("parseRemoteSource", () => {
  it("parses standard github web urls", () => {
    const src = parseRemoteSource("https://github.com/saschb2b/okf-studio");
    expect(src).not.toBeNull();
    expect(src?.kind).toBe("github");
    expect(src?.owner).toBe("saschb2b");
    expect(src?.repo).toBe("okf-studio");
    expect(src?.ref).toBeUndefined();
    expect(src?.subpath).toBeUndefined();
  });

  it("parses github urls with tree and subpath", () => {
    const src = parseRemoteSource("https://github.com/saschb2b/okf-studio/tree/main/docs");
    expect(src).not.toBeNull();
    expect(src?.kind).toBe("github");
    expect(src?.owner).toBe("saschb2b");
    expect(src?.repo).toBe("okf-studio");
    expect(src?.ref).toBe("main");
    expect(src?.subpath).toBe("docs");
  });

  it("parses SSH git urls (git@github.com:owner/repo)", () => {
    const src = parseRemoteSource("git@github.com:lutfi-zain/multica-marketing-agency.git");
    expect(src).not.toBeNull();
    expect(src?.kind).toBe("github");
    expect(src?.owner).toBe("lutfi-zain");
    expect(src?.repo).toBe("multica-marketing-agency");
    expect(src?.host).toBe("github.com");
  });

  it("parses SSH git urls without .git suffix", () => {
    const src = parseRemoteSource("git@github.com:lutfi-zain/multica-marketing-agency");
    expect(src).not.toBeNull();
    expect(src?.kind).toBe("github");
    expect(src?.owner).toBe("lutfi-zain");
    expect(src?.repo).toBe("multica-marketing-agency");
  });

  it("parses archive urls", () => {
    const src = parseRemoteSource("https://example.com/bundle.tar.gz");
    expect(src).not.toBeNull();
    expect(src?.kind).toBe("archive");
  });

  it("returns null for non-fetchable inputs", () => {
    expect(parseRemoteSource("not-a-url")).toBeNull();
    expect(parseRemoteSource("ftp://example.com/repo")).toBeNull();
  });
});
