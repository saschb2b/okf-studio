import { describe, it, expect } from "vitest";
import { renderMarkdown, resolveAssetHref } from "./markdown.ts";

describe("resolveAssetHref", () => {
  it("resolves a relative asset against the concept's directory", () => {
    expect(resolveAssetHref("button.example.html", "components/button")).toBe(
      "components/button.example.html",
    );
    expect(resolveAssetHref("../styles/tokens.css", "components/button.example.html")).toBe(
      "styles/tokens.css",
    );
  });

  it("resolves a bundle-absolute asset from the root", () => {
    expect(resolveAssetHref("/styles/tokens.css", "components/button")).toBe(
      "styles/tokens.css",
    );
  });

  it("keeps the extension (unlike concept-id resolution)", () => {
    expect(resolveAssetHref("x.css", "a/b")).toBe("a/x.css");
  });

  it("strips a trailing anchor or query", () => {
    expect(resolveAssetHref("button.example.html#anchor", "components/button")).toBe(
      "components/button.example.html",
    );
  });

  it("rejects external, data, and root-escaping hrefs", () => {
    expect(resolveAssetHref("https://example.com/x.css", "a/b")).toBeNull();
    expect(resolveAssetHref("data:text/css,body{}", "a/b")).toBeNull();
    expect(resolveAssetHref("../../etc/passwd", "a/b")).toBeNull();
    expect(resolveAssetHref("", "a/b")).toBeNull();
  });
});

describe("renderMarkdown color decoration", () => {
  it("prefixes a color-valued inline code with a swatch chip", () => {
    const html = renderMarkdown("The accent is `#0969da` today.");
    expect(html).toContain('class="color-chip"');
    expect(html).toContain("background:#0969da");
  });

  it("decorates rgb()/hsl() colors", () => {
    expect(renderMarkdown("`rgb(9, 105, 218)`")).toContain("class=\"color-chip\"");
    expect(renderMarkdown("`hsl(212, 92%, 45%)`")).toContain("class=\"color-chip\"");
  });

  it("leaves non-color code untouched", () => {
    const html = renderMarkdown("Reference `fgColor-default`, not a hex.");
    expect(html).not.toContain("color-chip");
  });

  it("does not inline an unsafe value as a style", () => {
    // A code span that is not a clean color gets no chip and no style attribute;
    // the raw text survives only as escaped code content, never as CSS.
    const html = renderMarkdown("`#fff;background:url(evil)`");
    expect(html).not.toContain("color-chip");
    expect(html).not.toContain('style="background');
  });
});
