// The three hierarchy views over one fixture tree, on the app's real type
// palette and role colors. Colors resolve from the live document, so the
// toolbar theme toggle re-themes the charts like the app does.
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { buildTypePalette } from "@/shared/theme.ts";
import { readVizColors } from "@/features/viz/nivoTheme.ts";
import type { VizNode } from "@/features/viz/hierarchy.ts";
import { PackView } from "./PackView.tsx";
import { SunburstView } from "./SunburstView.tsx";
import { TreemapView } from "./TreemapView.tsx";

const tree: VizNode = {
  id: "",
  name: "Sample bundle",
  children: [
    {
      id: "product",
      name: "Product",
      children: [
        {
          id: "@index-section/product/1",
          name: "Foundations",
          children: [
            { id: "product/overview", name: "Overview", type: "Product", value: 420 },
            { id: "product/principles", name: "Principles", type: "Product", value: 380 },
          ],
        },
        {
          id: "@index-section/product/2",
          name: "Roadmaps",
          children: [
            { id: "product/transformation", name: "Transformation", type: "Roadmap", value: 340 },
            { id: "product/evolution", name: "Evolution", type: "Roadmap", value: 260 },
          ],
        },
      ],
    },
    {
      id: "architecture",
      name: "Architecture",
      children: [
        {
          id: "@index-section/architecture/1",
          name: "Core and rendering",
          children: [
            { id: "architecture/system", name: "System", type: "Architecture", value: 640 },
            { id: "architecture/model", name: "Data model", type: "Architecture", value: 420 },
          ],
        },
        {
          id: "@index-section/architecture/2",
          name: "Safety and operations",
          children: [
            { id: "architecture/ipc", name: "IPC & Security", type: "Architecture", value: 510 },
            { id: "architecture/testing", name: "Testing", type: "Architecture", value: 300 },
          ],
        },
      ],
    },
    {
      id: "metrics",
      name: "Metrics",
      children: [
        { id: "metrics/weekly-active", name: "Weekly active users", type: "Metric", value: 220 },
        { id: "metrics/ltv", name: "Lifetime value", type: "Metric", value: 160 },
      ],
    },
    { id: "glossary", name: "Glossary", type: "Glossary", value: 90 },
  ],
};

const types = ["Product", "Architecture", "Metric", "Glossary"];

interface HierarchyStoryProps {
  view: "treemap" | "sunburst" | "pack";
  rootId: string;
  dimmed: readonly string[];
}

/** Builds theme-dependent props at render, so the toolbar toggle re-themes. */
function HierarchyView({ view, rootId, dimmed }: HierarchyStoryProps) {
  const dark = document.documentElement.dataset.theme !== "light";
  const palette = buildTypePalette(types, dark);
  const props = {
    tree,
    rootId,
    onDrill: fn(),
    onSelect: fn(),
    selectedId: "architecture/system",
    dimmedIds: new Set(dimmed),
    colorForType: (type: string) => palette.color(type),
    colors: readVizColors(),
    dark,
    reduceMotion: true,
  };
  const View = view === "treemap" ? TreemapView : view === "sunburst" ? SunburstView : PackView;
  return (
    <div style={{ width: 640, height: 420 }}>
      <View {...props} />
    </div>
  );
}

const meta = {
  title: "Viz/HierarchyViews",
  component: HierarchyView,
  args: { view: "treemap", rootId: "", dimmed: [] },
  parameters: {
    // The charts fill their container; padded layout would starve them.
    layout: "fullscreen",
  },
} satisfies Meta<typeof HierarchyView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Treemap: Story = {};

export const Sunburst: Story = { args: { view: "sunburst" } };

export const CirclePacking: Story = { args: { view: "pack" } };

/** A text query dims non-matching concepts across all views. */
export const TreemapWithDimmedQuery: Story = {
  args: {
    dimmed: [
      "product/overview",
      "product/principles",
      "metrics/weekly-active",
      "metrics/ltv",
      "glossary",
    ],
  },
};

/** Drilled into one group — breadcrumb state lives outside, the view re-roots. */
export const TreemapDrilled: Story = { args: { rootId: "architecture" } };
