// The contract between VizPane (which owns the tree, drill state, and chrome)
// and the three hierarchy visualizations (which only render a chart). Keeping
// the views pure over these props means drill position and selection survive
// switching between Treemap, Sunburst, and Circle Packing.

import type { VizColors } from "./nivoTheme.ts";
import type { VizNode } from "./hierarchy.ts";

export interface HierarchyVizProps {
  /** The full (filtered) tree — never re-rooted; drill via rootId. */
  tree: VizNode;
  /** Id of the node the view is drilled into; "" is the bundle root. */
  rootId: string;
  /** Drill to a group (breadcrumbs pass ancestors; "" returns to the root). */
  onDrill(id: string): void;
  /** A leaf (concept) was activated — open it in the reader. */
  onSelect(conceptId: string): void;
  /** The app-wide selected concept, ringed/accented by the view. */
  selectedId: string | null;
  /** Concept ids that do NOT match the active text query — render dimmed. */
  dimmedIds: ReadonlySet<string>;
  /** Fill color for a concept type (the app-wide type palette). */
  colorForType(type: string): string;
  /** Resolved role colors (theme-reactive; also keys nivo's theme). */
  colors: VizColors;
  /** True when the app theme resolves dark. */
  dark: boolean;
  /** Skip/shorten animated transitions. */
  reduceMotion: boolean;
}
