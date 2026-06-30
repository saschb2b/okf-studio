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

// Shiki's highlighter type is heavy to import; we only need the call shape.
interface Highlighter {
  getLoadedLanguages: () => string[];
  codeToHtml: (code: string, options: Record<string, unknown>) => string;
}

const THEMES = { light: "github-light", dark: "github-dark" } as const;

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

let highlighterPromise: Promise<Highlighter> | null = null;

/** Lazily create (once) a fine-grained Shiki highlighter with the WASM-free JS
 *  engine and only the curated grammars/themes — all dynamically imported. */
async function getHighlighter(): Promise<Highlighter> {
  highlighterPromise ??= (async () => {
    const [{ createHighlighterCore }, { createJavaScriptRegexEngine }, light, dark, ...langs] =
      await Promise.all([
        import("shiki/core"),
        import("shiki/engine/javascript"),
        import("shiki/themes/github-light.mjs"),
        import("shiki/themes/github-dark.mjs"),
        ...Object.values(LANGS).map((load) => load()),
      ]);
    const hl = await createHighlighterCore({
      themes: [light.default, dark.default],
      langs: langs as Parameters<typeof createHighlighterCore>[0]["langs"],
      engine: createJavaScriptRegexEngine(),
    });
    return hl as unknown as Highlighter;
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
  let hl: Highlighter;
  try {
    hl = await getHighlighter();
  } catch {
    return; // highlighter unavailable → leave all blocks as-is
  }

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
function renderBlock(hl: Highlighter, text: string, lang: string): string | null {
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
