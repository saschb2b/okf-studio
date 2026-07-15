// Circle Packing view: the bundle hierarchy as nested circles — containment
// (not hue) conveys nesting, leaf area conveys body size. A pure chart over
// HierarchyVizProps: VizPane owns the tree, the drill state, and the chrome
// (switcher + breadcrumb). Unlike the treemap/sunburst, nivo's circle packing
// has native controlled zoom, so drilling never re-roots the tree — the full
// hierarchy always renders and `zoomedId` animates the view into the drilled
// group, keeping the surrounding context visible. See
// docs/features/viz-views.md.
//
// React Compiler is enabled: no manual useMemo/useCallback/memo.

import {
  ResponsiveCirclePacking,
  type CirclePackingCustomLayerProps,
} from "@nivo/circle-packing";
import { vizPath, type VizNode } from "@/viz/hierarchy.ts";
import { fitLabel, inkOn } from "@/viz/labels.ts";
import { nivoTheme } from "@/viz/nivoTheme.ts";
import type { HierarchyVizProps } from "@/viz/props.ts";
import { VizSvgLabel } from "@/components/VizSvgLabel.tsx";
import { VizTooltip } from "@/components/VizTooltip.tsx";

// Clear the floating toolbar (top) and breathe at the edges.
const MARGIN = { top: 56, right: 12, bottom: 12, left: 12 };

/** ~25% alpha version of a color — dimmed non-matches keep their hue, quietly. */
function faded(color: string): string {
  return `color-mix(in srgb, ${color} 25%, transparent)`;
}

export function PackView(props: HierarchyVizProps) {
  // Group circles stay neutral and recessive — a faint wash of the dim text
  // color — so the type hues belong to leaves alone and nesting reads from
  // containment rather than competing fills.
  const groupFill = `color-mix(in srgb, ${props.colors.textDim} 8%, transparent)`;

  // Custom label layer: undimmed leaves whose name fits their circle, at the
  // largest wrapped font that does. The usable box is the near-inscribed
  // square (side ≈ r·√2, trimmed for breathing room).
  //
  // Nivo quirk: built-in layers receive ZOOMED node positions, custom layers
  // the un-zoomed ones — so the zoom transform is re-derived here from the
  // root circle's geometry (d3 pack centers the root at (w/2, h/2) with
  // radius min(w,h)/2, which is exactly what nivo's zoom math needs).
  const circleLabels = ({ nodes }: CirclePackingCustomLayerProps<VizNode>) => {
    const root = nodes.find((n) => n.depth === 0);
    const zoomed = props.rootId
      ? nodes.find((n) => n.data.id === props.rootId)
      : undefined;
    const ratio = root && zoomed ? root.radius / zoomed.radius : 1;
    const dx = root && zoomed ? root.x - zoomed.x * ratio : 0;
    const dy = root && zoomed ? root.y - zoomed.y * ratio : 0;
    return (
      <g>
        {nodes.map((n) => {
          if (n.height !== 0 || props.dimmedIds.has(n.data.id)) return null;
          const r = n.radius * ratio;
          if (r < 12) return null;
          const fit = fitLabel(n.data.name, r * 1.5, r * 1.2);
          if (!fit) return null;
          return (
            <VizSvgLabel
              key={n.id}
              x={n.x * ratio + dx}
              y={n.y * ratio + dy}
              fit={fit}
              fill={inkOn(n.color, props.colors, props.dark)}
            />
          );
        })}
      </g>
    );
  };

  return (
    <div
      className="viz-chart"
      role="img"
      aria-label="Circle packing of the bundle hierarchy"
    >
      <ResponsiveCirclePacking<VizNode>
        data={props.tree}
        id="id"
        value="value"
        margin={MARGIN}
        padding={3}
        // The drill position maps to nivo's controlled zoom ("" = root = no
        // zoom); the animation itself is the drill-down affordance, and the
        // breadcrumb in VizPane navigates back out.
        zoomedId={props.rootId || null}
        colors={(node) => {
          if (node.height > 0) return groupFill;
          const fill = props.colorForType(node.data.type ?? "");
          return props.dimmedIds.has(node.data.id) ? faded(fill) : fill;
        }}
        inheritColorFromParent={false}
        // The 2px surface ring separates siblings; the selected concept's ring
        // switches to the accent so the app-wide selection reads here too.
        borderWidth={2}
        borderColor={(node) =>
          node.data.id === props.selectedId
            ? props.colors.accent
            : props.colors.bg
        }
        // Leaf names render via the custom layer below (nivo's labels are a
        // fixed 11px regardless of circle size): the largest wrapped font
        // that fits each circle, luminance-picked ink. A circle that can't
        // hold its name stays quiet — the tooltip carries it, and zooming in
        // reveals more labels, the graph view's level-of-detail idea.
        enableLabels={false}
        layers={["circles", circleLabels]}
        tooltip={(node) => (
          <VizTooltip
            name={node.data.name}
            dot={
              node.height === 0
                ? props.colorForType(node.data.type ?? "")
                : undefined
            }
            meta={
              node.height === 0
                ? `${node.data.type ?? "untyped"} · ~${node.value} ${node.value === 1 ? "word" : "words"}`
                : `${node.data.children?.length ?? 0} item${(node.data.children?.length ?? 0) === 1 ? "" : "s"} · ${Math.round(node.percentage)}%`
            }
          />
        )}
        onClick={(node) => {
          if (node.height === 0) {
            props.onSelect(node.data.id);
            return;
          }
          if (node.data.id === props.rootId) {
            // Clicking the group we're already zoomed into backs out one
            // level (the root's parent is "", i.e. no zoom).
            const path = vizPath(props.tree, node.data.id);
            const parent = path && path.length > 1 ? path[path.length - 2] : null;
            props.onDrill(parent?.id ?? "");
            return;
          }
          props.onDrill(node.data.id);
        }}
        theme={nivoTheme(props.colors)}
        animate={!props.reduceMotion}
        motionConfig="gentle"
        role="img"
      />
    </div>
  );
}
