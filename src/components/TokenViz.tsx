// TokenViz — visualizes a concept's design tokens (ODSF `tokens` frontmatter)
// by the concept's type: color swatches, type specimens, spacing/radius/
// elevation scales, a motion table, or a generic token table with color dots.
// Pure presentation over the logic in odsf.ts; renders nothing when a concept
// has no tokens, so a plain OKF concept is unaffected. The only literal colors
// here are the *token values themselves* (data), never chrome — chrome is theme
// variables. See docs/features/design-system-rendering.md.

import { useState } from "react";
import type { ReactNode } from "react";
import type { Concept } from "@/types.ts";
import type { TokenGroup, TokenValue } from "@/odsf.ts";
import {
  conceptTokens,
  isColorValue,
  prefersDarkInk,
  resolveTokenRefs,
  tokenVizKind,
} from "@/odsf.ts";
import "./TokenViz.css";

interface Props {
  concept: Concept;
  /** Bundle-wide token index for resolving `{group.name}` references. */
  index: Record<string, string>;
}

/** A group's entries whose value is a leaf string (scale/color tokens). */
function leafEntries(group: TokenGroup | null): [string, string][] {
  if (!group) return [];
  return Object.entries(group).filter(
    (e): e is [string, string] => typeof e[1] === "string",
  );
}

/** A group's entries whose value is a composite map (type styles). */
function compositeEntries(group: TokenGroup | null): [string, Record<string, TokenValue>][] {
  if (!group) return [];
  return Object.entries(group).filter(
    (e): e is [string, Record<string, TokenValue>] => typeof e[1] === "object",
  );
}

/** A named group if the tokens tree has one, else undefined (a real lookup, so
 *  the `?? fallback` below is genuinely conditional, not dead). */
function pickGroup(tokens: Record<string, TokenGroup>, name: string): TokenGroup | undefined {
  return Object.prototype.hasOwnProperty.call(tokens, name) ? tokens[name] : undefined;
}

/** Flatten every group into one name→value map (fallback when no named group). */
function flattenLeaves(tokens: Record<string, TokenGroup>): TokenGroup {
  const out: TokenGroup = {};
  for (const group of Object.values(tokens)) {
    for (const [k, v] of Object.entries(group)) out[k] = v;
  }
  return out;
}

export function TokenViz({ concept, index }: Props) {
  const tokens = conceptTokens(concept);
  if (!tokens) return null;
  const kind = tokenVizKind(concept.type);
  const resolve = (v: string) => resolveTokenRefs(v, index);

  switch (kind) {
    case "color":
      return <ColorViz group={pickGroup(tokens, "colors") ?? flattenLeaves(tokens)} resolve={resolve} />;
    case "typography":
      // Fallback to the whole tree so role groups (composites) survive.
      return <TypographyViz group={pickGroup(tokens, "typography") ?? tokens} resolve={resolve} />;
    case "spacing":
      return <ScaleViz title="Scale" group={pickGroup(tokens, "spacing") ?? flattenLeaves(tokens)} resolve={resolve} />;
    case "shape":
      return <BoxViz title="Radius" group={pickGroup(tokens, "radius") ?? flattenLeaves(tokens)} resolve={resolve} demo="radius" />;
    case "elevation":
      return <BoxViz title="Elevation" group={pickGroup(tokens, "elevation") ?? flattenLeaves(tokens)} resolve={resolve} demo="shadow" />;
    case "motion":
      return <KvViz title="Motion" group={pickGroup(tokens, "motion") ?? flattenLeaves(tokens)} resolve={resolve} />;
    default:
      return <TokenTableViz tokens={tokens} resolve={resolve} />;
  }
}

/** A single click-to-copy color swatch with a transient "Copied" state. */
function Swatch({ name, value }: { name: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const ink = prefersDarkInk(value) ? "#1f2328" : "#ffffff";
  function copy() {
    const clipboard = navigator.clipboard as Clipboard | undefined;
    if (!clipboard) return;
    void clipboard.writeText(value).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1100);
    });
  }
  return (
    <button type="button" className="swatch" onClick={copy} title={`Copy ${value}`}>
      <span className="swatch-chip" style={{ background: value, color: ink }}>
        {copied && <span className="swatch-copied">Copied</span>}
      </span>
      <span className="swatch-meta">
        <span className="swatch-name">{name}</span>
        <span className="swatch-val">{value}</span>
      </span>
    </button>
  );
}

function VizSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="token-viz">
      <h2 className="token-viz-title">{title}</h2>
      {children}
    </section>
  );
}

function ColorViz({ group, resolve }: { group: TokenGroup; resolve: (v: string) => string }) {
  const entries = leafEntries(group);
  if (entries.length === 0) return null;
  return (
    <VizSection title="Swatches">
      <div className="swatches">
        {entries.map(([name, value]) => (
          <Swatch key={name} name={name} value={resolve(value)} />
        ))}
      </div>
    </VizSection>
  );
}

function TypographyViz({ group, resolve }: { group: TokenGroup; resolve: (v: string) => string }) {
  const base = typeof group.fontFamily === "string" ? resolve(group.fontFamily) : "inherit";
  const roles = compositeEntries(group);
  if (roles.length === 0) return null;
  const prop = (props: Record<string, TokenValue>, k: string): string | undefined =>
    typeof props[k] === "string" ? resolve(props[k]) : undefined;
  return (
    <VizSection title="Specimens">
      <div className="specimens">
        {roles.map(([role, props]) => {
          const fs = prop(props, "fontSize") ?? "16px";
          const fw = prop(props, "fontWeight") ?? "400";
          const lh = prop(props, "lineHeight") ?? "1.4";
          const fam = prop(props, "fontFamily") ?? base;
          const ls = prop(props, "letterSpacing");
          return (
            <div key={role} className="specimen">
              <div className="specimen-label">
                {role} · {fs} / {fw} / {lh}
              </div>
              <div
                className="specimen-sample"
                style={{
                  fontFamily: fam,
                  fontSize: fs,
                  fontWeight: fw,
                  lineHeight: lh,
                  ...(ls ? { letterSpacing: ls } : {}),
                }}
              >
                The quick brown fox jumps over the lazy dog
              </div>
            </div>
          );
        })}
      </div>
    </VizSection>
  );
}

function ScaleViz({
  title,
  group,
  resolve,
}: {
  title: string;
  group: TokenGroup;
  resolve: (v: string) => string;
}) {
  const entries = leafEntries(group);
  if (entries.length === 0) return null;
  return (
    <VizSection title={title}>
      <div className="scale">
        {entries.map(([name, value]) => {
          const v = resolve(value);
          return (
            <div key={name} className="scale-row">
              <div className="scale-key">
                {name} · {v}
              </div>
              <div className="scale-track">
                <div className="scale-bar" style={{ width: v }} />
              </div>
            </div>
          );
        })}
      </div>
    </VizSection>
  );
}

function BoxViz({
  title,
  group,
  resolve,
  demo,
}: {
  title: string;
  group: TokenGroup;
  resolve: (v: string) => string;
  demo: "radius" | "shadow";
}) {
  const entries = leafEntries(group);
  if (entries.length === 0) return null;
  return (
    <VizSection title={title}>
      <div className="boxes">
        {entries.map(([name, value]) => {
          const v = resolve(value);
          const style =
            demo === "radius" ? { borderRadius: v } : { boxShadow: v };
          return (
            <div key={name} className="box">
              <div className="box-demo" style={style} />
              <div className="box-key">{name}</div>
              <div className="box-val">{v}</div>
            </div>
          );
        })}
      </div>
    </VizSection>
  );
}

function KvViz({
  title,
  group,
  resolve,
}: {
  title: string;
  group: TokenGroup;
  resolve: (v: string) => string;
}) {
  const entries = leafEntries(group);
  if (entries.length === 0) return null;
  return (
    <VizSection title={title}>
      <table className="token-table">
        <tbody>
          {entries.map(([name, value]) => (
            <tr key={name}>
              <td className="tok">{name}</td>
              <td className="tok">{resolve(value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </VizSection>
  );
}

/** Generic table for component tokens: name, raw value, and resolved value. */
function TokenTableViz({
  tokens,
  resolve,
}: {
  tokens: Record<string, TokenGroup>;
  resolve: (v: string) => string;
}) {
  const rows: { key: string; raw: string }[] = [];
  const walk = (node: TokenValue, prefix: string) => {
    if (typeof node === "string") {
      rows.push({ key: prefix, raw: node });
      return;
    }
    for (const [k, v] of Object.entries(node)) {
      walk(v, prefix ? `${prefix}.${k}` : k);
    }
  };
  for (const [group, members] of Object.entries(tokens)) walk(members, group);
  if (rows.length === 0) return null;
  return (
    <VizSection title="Tokens">
      <table className="token-table">
        <thead>
          <tr>
            <th>Token</th>
            <th>Value</th>
            <th>Resolves to</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ key, raw }) => {
            const res = resolve(raw);
            const resolved = res === raw ? "" : res;
            return (
              <tr key={key}>
                <td className="tok">{key}</td>
                <td className="tok">{raw}</td>
                <td className="tok">
                  {isColorValue(res) && (
                    <span className="tok-dot" style={{ background: res }} aria-hidden="true" />
                  )}
                  {resolved}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </VizSection>
  );
}
