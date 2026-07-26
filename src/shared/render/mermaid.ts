// Mermaid diagrams for ```mermaid fenced blocks, following the same lean,
// offline, CSP-friendly stance as Shiki (highlight.ts) and KaTeX (math.ts):
// the library is **dynamically imported**, so its large chunks load (from the
// app origin, under `default-src 'self'`) only when a concept actually has a
// diagram. `securityLevel: "strict"` keeps labels sanitized and click/href
// interactions disabled — an untrusted bundle must stay safe to open.
//
// Mermaid bakes its theme's colors into the SVG, so each diagram is rendered
// TWICE — once per theme — into `.mermaid-light` / `.mermaid-dark` wrappers;
// Reader.css shows the one matching `data-theme`. That keeps the result a
// static HTML string (the reader's bake-once contract) with no re-render
// needed on theme switch.

import type { Mermaid } from "mermaid";

import { readTokenPairs } from "@/shared/theme.ts";

let mermaidPromise: Promise<Mermaid> | null = null;

// The role variables the diagram palette is built from. All resolve to literal
// colors; a token whose value is itself a var() or a color-mix() would reach
// Mermaid unevaluated and break the color math it does on these.
const ROLES = [
  "--bg",
  "--bg-elev",
  "--bg-sunken",
  "--text",
  "--text-dim",
  "--border",
  "--border-strong",
  "--accent",
  "--error",
  "--warn",
  "--ui",
] as const;

/**
 * Mermaid's own `default` and `dark` themes are a third palette in the window,
 * next to the app's and the syntax highlighter's — grays and pastels that
 * belong to no surface we have. `theme: "base"` plus `themeVariables` is the
 * documented way to drive it from a design system instead, so a diagram reads
 * as part of the concept it sits in.
 *
 * Nodes take the recessed surface with the emphasized border, the way an inset
 * control does elsewhere; edges and their labels take the dim text role; a
 * subgraph takes the frame color so it groups without becoming a second card.
 */
function themeVariables(t: Record<string, string>, darkMode: boolean) {
  return {
    // Mermaid derives a few shades itself; this tells it which way to go.
    darkMode,
    background: t["--bg-elev"],
    fontFamily: t["--ui"],
    fontSize: "14px",

    // Nodes.
    primaryColor: t["--bg-sunken"],
    primaryTextColor: t["--text"],
    primaryBorderColor: t["--border-strong"],
    mainBkg: t["--bg-sunken"],
    nodeBorder: t["--border-strong"],
    nodeTextColor: t["--text"],
    secondaryColor: t["--bg"],
    tertiaryColor: t["--bg-elev"],

    // Edges, labels, and the surrounding text.
    lineColor: t["--text-dim"],
    textColor: t["--text"],
    titleColor: t["--text"],
    edgeLabelBackground: t["--bg-elev"],

    // Subgraphs and notes.
    clusterBkg: t["--bg"],
    clusterBorder: t["--border"],
    noteBkgColor: t["--bg-sunken"],
    noteTextColor: t["--text"],
    noteBorderColor: t["--border"],

    errorBkgColor: t["--error"],
    errorTextColor: t["--text"],
  };
}

/** The two baked palettes, resolved once from the token layer. */
let palettes: { light: Record<string, string>; dark: Record<string, string> } | null = null;

function getPalettes() {
  if (!palettes) {
    const pairs = readTokenPairs(ROLES);
    const side = (which: "light" | "dark") =>
      Object.fromEntries(ROLES.map((r) => [r, pairs[r][which]]));
    palettes = { light: side("light"), dark: side("dark") };
  }
  return palettes;
}

/** Lazily load (once) Mermaid, configured for static, sanitized rendering. */
async function getMermaid(): Promise<Mermaid> {
  mermaidPromise ??= import("mermaid").then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      // On error we keep the authored code block; never inject error art.
      suppressErrorRendering: true,
    });
    return mermaid;
  });
  return mermaidPromise;
}

// Unique render ids for the SVGs' internal id namespace (markers, clip paths):
// two diagrams — or one diagram's two theme renders — must never collide.
let renderSeq = 0;

/**
 * Replace every ` ```mermaid ` code block under `root` with its rendered
 * diagram — a `<figure class="mermaid-diagram">` holding a light and a dark
 * render (CSS picks one). The SVG comes from the trusted library in strict
 * mode, generated from the block's text, so — like Shiki's and KaTeX's output —
 * it needs no re-sanitizing. A diagram that fails to render (bad syntax, or an
 * environment Mermaid can't measure text in) keeps its source code block —
 * the authored content is never lost. Runs BEFORE syntax highlighting, which
 * would otherwise consume the block. No-ops when there are no diagrams.
 */
export async function renderMermaidBlocks(root: ParentNode): Promise<void> {
  const blocks = Array.from(root.querySelectorAll("pre > code.language-mermaid"));
  if (blocks.length === 0) return;
  let mermaid: Mermaid;
  try {
    mermaid = await getMermaid();
  } catch {
    return; // renderer unavailable → leave all blocks as code
  }
  if (typeof document === "undefined") return;

  for (const code of blocks) {
    const pre = code.parentElement;
    if (!pre) continue;
    const source = code.textContent.trim();
    const seq = renderSeq++;
    try {
      // Theme is global Mermaid config; re-initialize between the two passes.
      const p = getPalettes();
      mermaid.initialize({ theme: "base", themeVariables: themeVariables(p.light, false) });
      const light = (await mermaid.render(`mmd-l-${seq}`, source)).svg;
      mermaid.initialize({ theme: "base", themeVariables: themeVariables(p.dark, true) });
      const dark = (await mermaid.render(`mmd-d-${seq}`, source)).svg;

      const figure = document.createElement("figure");
      figure.className = "mermaid-diagram";
      const lightWrap = document.createElement("span");
      lightWrap.className = "mermaid-light";
      lightWrap.innerHTML = light;
      const darkWrap = document.createElement("span");
      darkWrap.className = "mermaid-dark";
      darkWrap.innerHTML = dark;
      figure.append(lightWrap, darkWrap);
      pre.replaceWith(figure);
    } catch {
      // Keep the source block; the highlight pass renders it as plain code.
    }
  }
}
