// Sunburst View: a radial space-filling chart of the bundle hierarchy —
// directory groups form the inner rings, concepts the outer arcs, sized by
// body word count. Nivo has no native zoom, so drilling re-roots the rendered
// subtree (nivo's own documented pattern); the drill position itself lives in
// VizPane and arrives via rootId/onDrill, so it survives switching views.
// See docs/features/viz-views.md.
//
// React Compiler is enabled: no manual useMemo/useCallback/memo.

import {
  ResponsiveSunburst,
  type ComputedDatum,
  type SunburstCustomLayerProps,
} from "@nivo/sunburst";
import { findVizNode, vizPath, type VizNode } from "../viz/hierarchy.ts";
import { fitLabel, inkOn } from "../viz/labels.ts";
import { nivoTheme } from "../viz/nivoTheme.ts";
import type { HierarchyVizProps } from "../viz/props.ts";
import { VizSvgLabel } from "./VizSvgLabel.tsx";
import { VizTooltip } from "./VizTooltip.tsx";

// Clear the floating toolbar (top) and breathe against the pane edges.
const MARGIN = { top: 56, right: 12, bottom: 12, left: 12 };

export function SunburstView(props: HierarchyVizProps) {
  // Re-root to the drilled group; a filter change can remove it (VizPane
  // clamps rootId, but stay tolerant) — fall back to the whole tree.
  const root = findVizNode(props.tree, props.rootId) ?? props.tree;
  // A childless root shouldn't happen (VizPane guards empty bundles), but a
  // sunburst of nothing would just be a blank disc — render nothing instead.
  if (!root.children || root.children.length === 0) return null;

  // Fill per arc. Leaves wear their concept type's hue (faded when the text
  // query dims them); group rings stay a neutral, recessive gray so the
  // categorical colors are reserved for concepts, with deeper rings fading
  // toward the surface so structure reads at a glance.
  const fillFor = (node: VizNode, depth: number): string => {
    if (node.children) {
      const strength = Math.max(30 - (depth - 1) * 8, 12);
      return `color-mix(in srgb, ${props.colors.textDim} ${strength}%, ${props.colors.bg})`;
    }
    const color = props.colorForType(node.type ?? "");
    return props.dimmedIds.has(node.id)
      ? `color-mix(in srgb, ${color} 25%, transparent)`
      : color;
  };

  // Custom label layer with the canonical sunburst treatment: each label is
  // ROTATED TO ITS ARC, in whichever orientation fits it larger — along the
  // arc (tangential; suits the wide group sectors) or along the radius
  // (radial; suits thin slivers, where ring thickness is the line budget).
  // Both flip on their far half so nothing reads upside-down. Horizontal
  // text only suits a ring near 12/6 o'clock and overflows everywhere else,
  // which is what made the holistic view unreadable.
  const arcLabels = ({
    nodes,
    centerX,
    centerY,
  }: SunburstCustomLayerProps<VizNode>) => (
    <g>
      {nodes.map((d) => {
        if (!d.data.children && props.dimmedIds.has(d.data.id)) return null;
        const { innerRadius, outerRadius, startAngle, endAngle } = d.arc;
        const midAngle = (startAngle + endAngle) / 2; // radians, 0 at 12 o'clock
        const midR = (innerRadius + outerRadius) / 2;
        const thick = outerRadius - innerRadius;
        const arcSpan = midR * (endAngle - startAngle);
        const degTan = (midAngle * 180) / Math.PI;

        // Tangential: line length along the arc, capped by the straight
        // chord that stays inside the annulus; lines stack across the ring.
        const chordCap =
          2 * Math.sqrt(Math.max(0, outerRadius * outerRadius - midR * midR));
        const fitTan = fitLabel(
          d.data.name,
          Math.min(arcSpan * 0.85, chordCap),
          thick * 0.85,
          { maxFont: 13 },
        );
        // Radial: ring thickness is the line length; lines stack along the arc.
        const fitRad = fitLabel(d.data.name, thick * 0.85, arcSpan * 0.8, {
          maxFont: 13,
        });

        const useTan =
          fitTan !== null &&
          (fitRad === null || fitTan.fontSize >= fitRad.fontSize);
        const fit = useTan ? fitTan : fitRad;
        if (!fit) return null;
        const rotate = useTan
          ? // Tangential: flipped through the bottom half to stay upright.
            midAngle > Math.PI / 2 && midAngle < (3 * Math.PI) / 2
            ? degTan + 180
            : degTan
          : // Radial: flipped on the left half.
            midAngle > Math.PI
            ? degTan + 90
            : degTan - 90;
        return (
          <VizSvgLabel
            key={String(d.id)}
            x={centerX + Math.sin(midAngle) * midR}
            y={centerY - Math.cos(midAngle) * midR}
            fit={fit}
            rotate={rotate}
            fill={inkOn(d.color, props.colors, props.dark)}
          />
        );
      })}
    </g>
  );

  // Center layer: the donut hole names the current root (with its size) and,
  // when drilled, is clickable to go up one level — the standard zoomable-
  // sunburst interaction, complementing the breadcrumb.
  const centerInfo = ({
    nodes,
    centerX,
    centerY,
  }: SunburstCustomLayerProps<VizNode>) => {
    if (nodes.length === 0) return null;
    const holeR = Math.min(...nodes.map((n) => n.arc.innerRadius));
    const fit = fitLabel(root.name, holeR * 1.5, holeR, { maxFont: 16 });
    const drilled = props.rootId !== "";
    const up = () => {
      const path = vizPath(props.tree, props.rootId);
      props.onDrill(path && path.length > 1 ? path[path.length - 2].id : "");
    };
    return (
      // The breadcrumb is the keyboard path; this click affordance is a
      // bonus, hidden from assistive tech.
      <g
        onClick={drilled ? up : undefined}
        style={{ cursor: drilled ? "pointer" : "default" }}
        aria-hidden="true"
      >
        <circle cx={centerX} cy={centerY} r={holeR} fill="transparent">
          {drilled && <title>Back to the level above</title>}
        </circle>
        {fit && (
          <VizSvgLabel
            x={centerX}
            y={centerY - (drilled ? 8 : 0)}
            fit={fit}
            fill={props.colors.text}
          />
        )}
        {drilled && fit && (
          <text
            x={centerX}
            y={centerY + fit.lines.length * 10 + 8}
            textAnchor="middle"
            style={{ fontSize: 10, fill: props.colors.textDim }}
          >
            click to go up
          </text>
        )}
      </g>
    );
  };

  return (
    // 0.99's Sunburst forwards `role` but has no ariaLabel prop, so the
    // accessible name lives on the wrapper (children read as presentational).
    <div
      className="viz-chart"
      role="img"
      aria-label="Sunburst of the bundle hierarchy"
    >
      <ResponsiveSunburst<VizNode>
        data={root}
        id="id"
        value="value"
        margin={MARGIN}
        theme={nivoTheme(props.colors)}
        colors={(d) => fillFor(d.data, d.depth)}
        // Off: the default copies the parent ring's color onto every arc
        // below depth 1, which would erase the per-type leaf colors above.
        inheritColorFromParent={false}
        cornerRadius={2}
        // The 2px ring/arc separation is a gap in the surface color — the
        // dataviz spacer rule — doubling as the selection ring in accent.
        borderWidth={2}
        borderColor={(d: ComputedDatum<VizNode>) =>
          d.data.id === props.selectedId ? props.colors.accent : props.colors.bg
        }
        // Arc names render via the custom layer (nivo's arc labels are a
        // fixed 11px regardless of arc size): each label takes the largest
        // font whose wrapped lines fit its sector, in luminance-picked ink,
        // and a sector that can't hold its name stays quiet (tooltip carries
        // it; drilling in reveals more names).
        layers={["arcs", arcLabels, centerInfo]}
        tooltip={(d: ComputedDatum<VizNode>) => (
          <VizTooltip
            name={d.data.name}
            dot={
              d.data.children
                ? undefined
                : props.colorForType(d.data.type ?? "")
            }
            meta={
              d.data.children
                ? `${d.percentage.toFixed(1)}% of this ring`
                : `${d.data.type ?? "untyped"} · ~${d.value} words`
            }
          />
        )}
        onClick={(d) => {
          if (d.data.children) props.onDrill(d.data.id);
          else props.onSelect(d.data.id);
        }}
        animate={!props.reduceMotion}
        motionConfig="gentle"
        transitionMode="pushIn"
      />
    </div>
  );
}
