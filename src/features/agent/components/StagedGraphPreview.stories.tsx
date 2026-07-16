// The staged-draft graph thumbnail: staged vs existing nodes, the label
// cutoff at 12 nodes, the truncation note, and the emptied-draft fallback.
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { AgentStagedGraphPreview } from "@/features/agent/connection.ts";
import { StagedGraphPreview } from "./StagedGraphPreview.tsx";

function graph(nodeCount: number, over?: Partial<AgentStagedGraphPreview>): AgentStagedGraphPreview {
  const nodes = Array.from({ length: nodeCount }, (_, index) => ({
    id: `concepts/node-${index}`,
    title: `Concept ${index + 1}`,
    conceptType: index % 3 === 0 ? "Product" : index % 3 === 1 ? "Architecture" : "Metric",
    staged: index % 2 === 0,
  }));
  const edges = nodes.slice(1).map((node, index) => ({
    source: nodes[index].id,
    target: node.id,
  }));
  return {
    nodes,
    edges,
    totalNodes: nodeCount,
    totalEdges: edges.length,
    truncated: false,
    ...over,
  };
}

const meta = {
  title: "Agent/Staging/StagedGraphPreview",
  component: StagedGraphPreview,
} satisfies Meta<typeof StagedGraphPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Small draft: labels visible, staged nodes distinguished from existing. */
export const SmallDraft: Story = {
  args: { preview: graph(6) },
};

/** Above 12 nodes the labels drop to keep the thumbnail legible. */
export const DenseDraft: Story = {
  args: { preview: graph(16) },
};

/** The preview was truncated by the host — the counts say what it holds. */
export const Truncated: Story = {
  args: { preview: graph(12, { totalNodes: 64, totalEdges: 118, truncated: true }) },
};

export const EmptiedDraft: Story = {
  args: {
    preview: { nodes: [], edges: [], totalNodes: 0, totalEdges: 0, truncated: false },
  },
};
