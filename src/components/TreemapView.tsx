// Treemap View: a space-filling rectangle layout of the bundle hierarchy
// (nivo). Tile area is the concept's body word count, fill is the app-wide
// type color; group tiles stay neutral and carry their identity in the parent
// label. Clicking a group drills into it (VizPane owns the breadcrumb trail);
// clicking a leaf opens the concept in the reader. Pure over
// HierarchyVizProps — drill position and selection live in VizPane, so
// switching to Sunburst or Circle Packing keeps your place. See
// docs/features/viz-views.md.
//
// React Compiler is enabled: no manual useMemo/useCallback/memo.

import {
  ResponsiveTreeMap,
  type ComputedNodeWithoutStyles,
  type CustomLayerProps,
} from "@nivo/treemap";
import { findVizNode, type VizNode } from "@/viz/hierarchy.ts";
import { fitLabel, inkOn, labelFits } from "@/viz/labels.ts";
import { nivoTheme } from "@/viz/nivoTheme.ts";
import type { HierarchyVizProps } from "@/viz/props.ts";
import { VizSvgLabel } from "@/components/VizSvgLabel.tsx";
import { VizTooltip } from "@/components/VizTooltip.tsx";

export function TreemapView(props: HierarchyVizProps) {
  // Re-root on drill; a filter change can remove the drilled node, so fall
  // back to the whole tree rather than rendering nothing.
  const root = findVizNode(props.tree, props.rootId) ?? props.tree;

  // Group tiles are recessive — a faint neutral wash, never a categorical hue;
  // the parent label names them. Leaves wear the type color, faded (not
  // removed) when the text query rules them out, so the bundle's shape stays
  // stable while searching.
  const groupFill = `color-mix(in srgb, ${props.colors.textDim} 8%, transparent)`;
  const fillFor = (n: ComputedNodeWithoutStyles<VizNode>): string => {
    if (!n.isLeaf) return groupFill;
    const base = props.colorForType(n.data.type ?? "");
    return props.dimmedIds.has(n.data.id)
      ? `color-mix(in srgb, ${base} 25%, transparent)`
      : base;
  };

  // Custom label layer: each leaf name at the largest font (10–18px) whose
  // wrapped lines fit the tile, in luminance-picked ink — a big tile gets a
  // big readable name, a tile that can't hold its name stays quiet (the
  // tooltip carries it). Dimmed (query-filtered-out) tiles stay unlabeled.
  const leafLabels = ({ nodes }: CustomLayerProps<VizNode>) => (
    <g>
      {nodes.map((n) => {
        if (!n.isLeaf || props.dimmedIds.has(n.data.id)) return null;
        const fit = fitLabel(n.data.name, n.width - 12, n.height - 10);
        if (!fit) return null;
        return (
          <VizSvgLabel
            key={n.path}
            x={n.x + n.width / 2}
            y={n.y + n.height / 2}
            fit={fit}
            fill={inkOn(n.color, props.colors, props.dark)}
          />
        );
      })}
    </g>
  );

  return (
    <div className="viz-chart">
      <ResponsiveTreeMap<VizNode>
        data={root}
        identity="id"
        value={(n) => n.value ?? 0}
        // Room for the floating toolbar chrome (top) and breathing space.
        margin={{ top: 56, right: 12, bottom: 12, left: 12 }}
        colors={fillFor}
        nodeOpacity={1}
        // Tiles separate via padding gaps in the surface color, not borders;
        // the only drawn border is the selection ring on the active concept.
        innerPadding={2}
        outerPadding={4}
        borderWidth={2}
        borderColor={(n) =>
          n.data.id === props.selectedId ? props.colors.accent : "transparent"
        }
        // Leaf names render via the custom layer below — sized to their tile,
        // wrapped, horizontal — instead of nivo's fixed-11px (often rotated)
        // labels, which read teeny on a big tile.
        enableLabel={false}
        layers={["nodes", leafLabels]}
        enableParentLabel
        // A group band that can't hold its name stays quiet (breadcrumb +
        // tooltip name it) rather than clipping.
        parentLabel={(n) => (labelFits(n.data.name, n.width) ? n.data.name : "")}
        parentLabelPosition="top"
        parentLabelPadding={8}
        parentLabelTextColor={props.colors.text}
        onClick={(node) => {
          if (node.isLeaf) props.onSelect(node.data.id);
          else props.onDrill(node.data.id);
        }}
        tooltip={({ node }) => (
          <VizTooltip
            name={node.data.name}
            dot={
              node.isLeaf
                ? props.colorForType(node.data.type ?? "")
                : undefined
            }
            meta={
              node.isLeaf
                ? `${node.data.type ?? "untyped"} · ~${node.value} words`
                : `${countLeaves(findVizNode(root, node.data.id))} concepts · ~${node.value} words`
            }
          />
        )}
        theme={nivoTheme(props.colors)}
        animate={!props.reduceMotion}
        motionConfig="gentle"
        role="img"
        ariaLabel="Treemap of the bundle hierarchy"
      />
    </div>
  );
}

/** Concepts under a group — nivo strips `children` from `node.data`, so the
 *  tooltip counts on the raw subtree instead. */
function countLeaves(n: VizNode | null): number {
  if (!n) return 0;
  if (!n.children) return 1;
  let total = 0;
  for (const c of n.children) total += countLeaves(c);
  return total;
}

