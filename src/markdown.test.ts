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

  it("decorates a hex color that appears in plain prose", () => {
    // The value is in parentheses, not in backticks (the Primer Border case).
    const html = renderMarkdown("`borderColor-default` (#d1d9e0) hairlines.");
    expect(html).toContain("background:#d1d9e0");
    expect(html).toContain("color-token");
    // The literal text is preserved beside the chip.
    expect(html).toContain("#d1d9e0");
  });

  it("decorates 8-digit (alpha) hex in prose and leaves a 5-digit run alone", () => {
    expect(renderMarkdown("translucent #818b981f fill")).toContain("background:#818b981f");
    expect(renderMarkdown("not a color #abcde here")).not.toContain("color-chip");
  });

  it("does not decorate hex inside code or links twice", () => {
    // Inside a link, the hex is left as text (links are skipped).
    const html = renderMarkdown("[see #ffffff](https://x.com)");
    expect(html).not.toContain("color-token");
  });

  it("does not inline an unsafe value as a style", () => {
    // A code span that is not a clean color gets no chip and no style attribute;
    // the raw text survives only as escaped code content, never as CSS.
    const html = renderMarkdown("`#fff;background:url(evil)`");
    expect(html).not.toContain("color-chip");
    expect(html).not.toContain('style="background');
  });
});

describe("renderMarkdown token-reference resolution", () => {
  const index = { "colors.primary": "#1f883d", "spacing.md": "16px" };

  it("resolves a color {ref} with a chip and a resolves-to title", () => {
    const html = renderMarkdown("Use `{colors.primary}` here.", index);
    expect(html).toContain("color-chip");
    expect(html).toContain("background:#1f883d");
    expect(html).toContain('title="resolves to #1f883d"');
  });

  it("annotates a non-color {ref} with its value, no chip", () => {
    const html = renderMarkdown("Pad by `{spacing.md}`.", index);
    expect(html).toContain('title="resolves to 16px"');
    expect(html).not.toContain("color-chip");
  });

  it("leaves an unknown {ref} untouched", () => {
    const html = renderMarkdown("`{nope.missing}`", index);
    expect(html).not.toContain("resolves to");
    expect(html).not.toContain("color-chip");
  });

  it("leaves {refs} untouched when no index is given", () => {
    expect(renderMarkdown("`{colors.primary}`")).not.toContain("resolves to");
  });
});
