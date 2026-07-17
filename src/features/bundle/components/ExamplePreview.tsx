// ExamplePreview — renders an ODSF concept's companion example assets
// (*.example.html and the *.do.html / *.dont.html of a do/don't pair) as live
// previews in the reader. Each asset is read via read_asset, the stylesheets it
// links are inlined (so it renders truthfully to the system's tokens), and the
// result is shown in a sandboxed, script-free iframe with a Preview / Code
// toggle. Renders nothing when a concept declares no examples, so a plain OKF
// concept is unaffected. See docs/features/design-system-rendering.md.

import { useEffect, useRef, useState } from "react";
import type { Bundle, Concept } from "@/shared/types.ts";
import { conceptExamples, exampleKind } from "@/shared/odsf.ts";
import type { ExampleKind } from "@/shared/odsf.ts";
import { resolveAssetHref } from "@/shared/render/markdown.ts";
import { readAsset } from "@/shared/ipc.ts";
import "./ExamplePreview.css";

interface PreviewItem {
  path: string;
  kind: ExampleKind;
  raw: string;
  /** The HTML with its linked stylesheets inlined, ready for the iframe. */
  doc: string;
  /** A linked stylesheet (`.css`): shown as code only, no rendered preview. */
  codeOnly: boolean;
}

const KIND_LABEL: Record<ExampleKind, string> = {
  do: "Do",
  dont: "Don't",
  example: "Example",
};

/** Replace each `<link rel="stylesheet">` with the stylesheet's text inlined as
 *  a `<style>`, resolved relative to the asset. A missing sheet is dropped. */
async function inlineStylesheets(html: string, assetPath: string, root: string): Promise<string> {
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].filter((m) =>
    /rel\s*=\s*["']?stylesheet/i.test(m[0]),
  );
  let out = html;
  for (const m of links) {
    const hrefMatch = /href\s*=\s*["']([^"']+)["']/i.exec(m[0]);
    if (!hrefMatch) continue;
    const rel = resolveAssetHref(hrefMatch[1], assetPath);
    const css = rel ? await readAsset(root, rel) : null;
    out = out.replace(m[0], css != null ? `<style>${css}</style>` : "");
  }
  return out;
}

/** Collect the asset paths a concept declares (frontmatter `examples`) or links
 *  to in the body — `.html` (rendered) and `.css` (shown as code) — as
 *  normalized bundle-relative paths. */
function exampleAssetPaths(concept: Concept): string[] {
  const paths = new Set<string>();
  for (const ex of conceptExamples(concept)) {
    const p = resolveAssetHref(ex, concept.id);
    if (p && /\.(html|css)$/i.test(p)) paths.add(p);
  }
  for (const m of concept.body.matchAll(/\]\(([^)\s#]+\.(?:html|css))\)/gi)) {
    const p = resolveAssetHref(m[1], concept.id);
    if (p) paths.add(p);
  }
  return [...paths];
}

export function ExamplePreview({ concept, bundle }: { concept: Concept; bundle: Bundle | null }) {
  const [items, setItems] = useState<PreviewItem[]>([]);

  // Load asynchronously and set state only after the await — never
  // synchronously in the effect body. The component is keyed by concept id at
  // the call site, so each concept mounts fresh (no stale-preview reset here).
  // A mutable guard (not a `let` flag) avoids dropping a late result onto an
  // unmounted/re-run instance.
  useEffect(() => {
    const live = { current: true };
    if (bundle) {
      const root = bundle.root;
      void (async () => {
        const loaded: PreviewItem[] = [];
        try {
          for (const path of exampleAssetPaths(concept)) {
            const raw = await readAsset(root, path);
            if (raw == null) continue;
            if (/\.css$/i.test(path)) {
              // A linked stylesheet has no rendered form; show it as code.
              loaded.push({ path, kind: "example", raw, doc: "", codeOnly: true });
            } else {
              const doc = await inlineStylesheets(raw, path, root);
              loaded.push({ path, kind: exampleKind(path), raw, doc, codeOnly: false });
            }
          }
        } catch {
          // One asset's read *rejected* (vs. was merely absent → null) — fall
          // through and commit whatever loaded, so a single IPC error can't
          // blank the whole Examples section.
        }
        if (live.current) setItems(loaded);
      })();
    }
    return () => {
      live.current = false;
    };
    // Re-run per concept (id covers the selection) and bundle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [concept.id, bundle?.root]);

  if (items.length === 0) return null;
  return (
    <section className="examples" aria-label="Examples">
      {items.map((item) => (
        <ExampleFrame key={item.path} item={item} />
      ))}
    </section>
  );
}

function ExampleFrame({ item }: { item: PreviewItem }) {
  const [tab, setTab] = useState<"preview" | "code">("preview");
  const frameRef = useRef<HTMLIFrameElement>(null);

  function fitHeight() {
    const frame = frameRef.current;
    try {
      const h = frame?.contentDocument?.documentElement.scrollHeight;
      if (frame && h) frame.style.height = `${h + 2}px`;
    } catch {
      if (frame) frame.style.height = "240px";
    }
  }

  // A linked stylesheet: there is nothing to render, so show it as code only.
  if (item.codeOnly) {
    return (
      <figure className="example example-code-only">
        <figcaption className="example-head">
          <span className="example-kind kind-stylesheet">Stylesheet</span>
          <span className="example-path">{item.path}</span>
        </figcaption>
        <pre className="example-code">
          <code>{item.raw}</code>
        </pre>
      </figure>
    );
  }

  return (
    <figure className={`example example-${item.kind}`}>
      <figcaption className="example-head">
        {item.kind !== "example" && (
          <span className={`example-kind kind-${item.kind}`}>{KIND_LABEL[item.kind]}</span>
        )}
        <div className="example-tabs" role="tablist" aria-label="Preview or code">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "preview"}
            className={`example-tab${tab === "preview" ? " is-active" : ""}`}
            onClick={() => setTab("preview")}
          >
            Preview
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "code"}
            className={`example-tab${tab === "code" ? " is-active" : ""}`}
            onClick={() => setTab("code")}
          >
            Code
          </button>
        </div>
        <span className="example-path">{item.path}</span>
      </figcaption>
      {/* Sandboxed and script-free: no allow-scripts, so the static HTML/CSS
          renders but no JS runs. allow-same-origin lets us measure its height. */}
      <iframe
        ref={frameRef}
        className="example-frame"
        title={item.path}
        sandbox="allow-same-origin"
        srcDoc={item.doc}
        hidden={tab !== "preview"}
        onLoad={fitHeight}
      />
      {tab === "code" && (
        <pre className="example-code">
          <code>{item.raw}</code>
        </pre>
      )}
    </figure>
  );
}
