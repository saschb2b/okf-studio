// Math typesetting for the `$…$` / `$$…$$` placeholders that the markdown
// pipeline bakes into a body (see the math extensions in src/markdown.ts).
// KaTeX and its stylesheet (fonts included, served from the app origin under
// `default-src 'self'`) are **dynamically imported**, so the ~large typesetting
// chunk loads only when a concept actually contains math — the same lean,
// offline, CSP-friendly stance as Shiki in src/highlight.ts.

import type katexType from "katex";

let katexPromise: Promise<typeof katexType> | null = null;

/** Lazily load (once) KaTeX plus its stylesheet. */
async function getKatex(): Promise<typeof katexType> {
  katexPromise ??= (async () => {
    const [katex] = await Promise.all([
      import("katex"),
      // Side-effect import: Vite code-splits the CSS (and its font assets)
      // alongside the JS chunk and injects it on load.
      import("katex/dist/katex.min.css"),
    ]);
    return katex.default;
  })();
  return katexPromise;
}

/**
 * Typeset every `.math` placeholder under `root` in place: the element's text
 * content is the raw TeX, replaced with KaTeX markup (`displayMode` for
 * `.math-block`). KaTeX's output is generated from that text by the trusted
 * library (with `trust` off, so `\href`/`\includegraphics` stay disabled) and
 * needs no re-sanitizing — like Shiki's. Invalid TeX renders best-effort
 * (`throwOnError: false`); if KaTeX itself fails to load or throws, the TeX
 * source stays visible — a formula is never lost. No-ops without math.
 */
export async function renderMathBlocks(root: ParentNode): Promise<void> {
  const nodes = Array.from(root.querySelectorAll(".math"));
  if (nodes.length === 0) return;
  let katex: typeof katexType;
  try {
    katex = await getKatex();
  } catch {
    return; // typesetter unavailable → leave the TeX source as-is
  }
  // The lazy-load await can outlive the caller's environment (a test's DOM is
  // torn down mid-flight); bail instead of touching a dead document.
  if (typeof document === "undefined") return;

  for (const el of nodes) {
    if (el.querySelector(".katex")) continue; // idempotent
    try {
      el.innerHTML = katex.renderToString(el.textContent, {
        displayMode: el.classList.contains("math-block"),
        throwOnError: false,
        output: "html",
      });
    } catch {
      // Even throwOnError:false can throw on non-parse errors — keep the TeX.
    }
  }
}
