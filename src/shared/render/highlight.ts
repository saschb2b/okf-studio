// Syntax highlighting for code blocks, via Shiki (the TextMate-grammar engine
// behind VS Code). Three deliberate choices keep it lean, offline, and
// CSP-friendly:
//   - the **JavaScript** regex engine (not the WASM oniguruma one), so no
//     `wasm-unsafe-eval` is needed in the CSP and there is no WASM chunk;
//   - the **fine-grained core** with a *curated* language set, so the bundle
//     carries ~a dozen grammars, not Shiki's ~200 (and no full registry);
//   - everything is **dynamically imported** inside the highlighter factory, so
//     Shiki, the grammars, and the themes are code-split out of the initial
//     bundle and loaded (from the app origin, under `default-src 'self'`) only
//     when a concept actually has code.
// Dual light/dark themes are emitted as CSS variables and switched by the app's
// `data-theme` (see Reader.css). See docs/features/concept-reader.md.

// Type-only import (erased at build, so no bundle cost) of Shiki's real
// highlighter type — the runtime `createHighlighterCore` is still dynamic.
import type { HighlighterCore } from "shiki/core";

// One Dark Pro is the Atom One palette Zed ships as its default: softer than
// GitHub's, and in the same blue/violet/salmon family as our accent and our
// generated type colors, so a code block stops reading as a transplant from a
// different product. Measured against the code-block surface (--bg-sunken), its
// median token contrast is 7.7:1 where github-dark's is 10.7 — GitHub's palette
// is tuned for a lighter editor and glares on our near-black well.
//
// Light does NOT take Zed's One Light, on the same evidence: One Light is built
// for a #FAFAFA editor, and on our darker #edeff3 well three of its scopes fall
// under 3:1 (comments at 2.24). github-light-default measures best there — a
// 3.95 floor and a 6.4 median, against plain github-light's 3.03 floor.
const THEMES = { light: "github-light-default", dark: "one-dark-pro" } as const;

// Every syntax theme deliberately under-contrasts comments, and every one of
// them lands below the 4.5:1 that body text owes: 3.95 for github-light-default
// and 3.13 for one-dark-pro on our surface. Comments in a spec bundle carry
// real explanation, so both are lifted to clear 4.5 with the hue left alone.
// Nothing else is patched — see docs/ux/theming.md for the scopes that remain
// under 4.5 and why re-tinting a whole theme is not the answer.
const COMMENT_INK = { "github-light-default": "#5f6874", "one-dark-pro": "#767e8b" } as const;

/** Raise a theme's comment scopes to `ink`, leaving every other token alone. */
function liftComments<T extends { name?: string; tokenColors?: unknown[] }>(theme: T, ink: string): T {
  const scopes = theme.tokenColors as
    | { scope?: string | string[]; settings?: { foreground?: string } }[]
    | undefined;
  for (const s of scopes ?? []) {
    const scope = Array.isArray(s.scope) ? s.scope.join(" ") : (s.scope ?? "");
    if (/\bcomment\b/.test(scope) && s.settings?.foreground) s.settings.foreground = ink;
  }
  return theme;
}

// The languages a design-system / docs bundle realistically uses. An unknown
// language falls back to a plain themed block — coverage, not completeness.
const LANGS: Record<string, () => Promise<unknown>> = {
  html: () => import("shiki/langs/html.mjs"),
  css: () => import("shiki/langs/css.mjs"),
  scss: () => import("shiki/langs/scss.mjs"),
  javascript: () => import("shiki/langs/javascript.mjs"),
  typescript: () => import("shiki/langs/typescript.mjs"),
  jsx: () => import("shiki/langs/jsx.mjs"),
  tsx: () => import("shiki/langs/tsx.mjs"),
  json: () => import("shiki/langs/json.mjs"),
  bash: () => import("shiki/langs/bash.mjs"),
  yaml: () => import("shiki/langs/yaml.mjs"),
  markdown: () => import("shiki/langs/markdown.mjs"),
  rust: () => import("shiki/langs/rust.mjs"),
  python: () => import("shiki/langs/python.mjs"),
  toml: () => import("shiki/langs/toml.mjs"),
  diff: () => import("shiki/langs/diff.mjs"),
  sql: () => import("shiki/langs/sql.mjs"),
};

// Common fence aliases → one of the curated languages above.
const ALIASES: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  yml: "yaml",
  md: "markdown",
  py: "python",
  rs: "rust",
};

let highlighterPromise: Promise<HighlighterCore> | null = null;

/** Lazily create (once) a fine-grained Shiki highlighter with the WASM-free JS
 *  engine and only the curated grammars/themes — all dynamically imported. */
async function getHighlighter(): Promise<HighlighterCore> {
  highlighterPromise ??= (async () => {
    const [{ createHighlighterCore }, { createJavaScriptRegexEngine }, light, dark, ...langs] =
      await Promise.all([
        import("shiki/core"),
        import("shiki/engine/javascript"),
        import("shiki/themes/github-light-default.mjs"),
        import("shiki/themes/one-dark-pro.mjs"),
        ...Object.values(LANGS).map((load) => load()),
      ]);
    const hl = await createHighlighterCore({
      themes: [
        liftComments(light.default, COMMENT_INK[THEMES.light]),
        liftComments(dark.default, COMMENT_INK[THEMES.dark]),
      ],
      langs: langs as Parameters<typeof createHighlighterCore>[0]["langs"],
      engine: createJavaScriptRegexEngine(),
    });
    return hl;
  })();
  return highlighterPromise;
}

/** The fence language from a `<code class="language-…">`, normalized via aliases. */
function langOf(code: Element): string {
  const m = /language-([\w-]+)/.exec(code.getAttribute("class") ?? "");
  const raw = (m?.[1] ?? "").toLowerCase();
  return raw in ALIASES ? ALIASES[raw] : raw;
}

/**
 * Highlight every `<pre><code>` under `root` in place, replacing each with
 * Shiki's themed markup. A language outside the curated set falls back to a
 * plain themed block, then to the original — a code block is never lost. Returns
 * without doing anything when there are no code blocks.
 */
export async function highlightCodeBlocks(root: ParentNode): Promise<void> {
  const blocks = Array.from(root.querySelectorAll("pre > code"));
  if (blocks.length === 0) return;
  let hl: HighlighterCore;
  try {
    hl = await getHighlighter();
  } catch {
    return; // highlighter unavailable → leave all blocks as-is
  }
  // The lazy-load await can outlive the caller's environment (a test's DOM is
  // torn down mid-flight); bail instead of touching a dead document.
  if (typeof document === "undefined") return;

  for (const code of blocks) {
    const pre = code.parentElement;
    if (!pre) continue;
    const html = renderBlock(hl, code.textContent, langOf(code));
    if (!html) continue;
    const tpl = document.createElement("template");
    tpl.innerHTML = html;
    const shikiPre = tpl.content.firstElementChild;
    if (shikiPre) pre.replaceWith(shikiPre);
  }
}

/** Highlight one block, falling back to a plain themed block, then to null. */
function renderBlock(hl: HighlighterCore, text: string, lang: string): string | null {
  const opts = { themes: THEMES, defaultColor: false } as const;
  if (lang && hl.getLoadedLanguages().includes(lang)) {
    try {
      return hl.codeToHtml(text, { ...opts, lang });
    } catch {
      // Grammar the JS engine can't handle → fall through to a plain block.
    }
  }
  try {
    return hl.codeToHtml(text, { ...opts, lang: "text" });
  } catch {
    return null;
  }
}
