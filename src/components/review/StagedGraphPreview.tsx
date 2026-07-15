import type { AgentStagedGraphPreview } from "@/agent/connection.ts";

interface StagedGraphPreviewProps {
  preview: AgentStagedGraphPreview;
}

interface GraphPosition {
  x: number;
  y: number;
}

const VIEWBOX_WIDTH = 320;
const VIEWBOX_HEIGHT = 190;
const VIEWBOX_MARGIN = 24;

export function StagedGraphPreview({ preview }: StagedGraphPreviewProps) {
  const positions = graphPositions(preview.nodes.length);
  const positionsById = new Map(
    preview.nodes.map((node, index) => [node.id, positions[index]]),
  );
  const showLabels = preview.nodes.length <= 12;

  return (
    <section className="staged-graph" aria-label="Staged graph preview">
      <header>
        <strong>Graph preview</strong>
        <span>{conceptCount(preview.totalNodes)} · {linkCount(preview.totalEdges)}</span>
      </header>
      {preview.nodes.length === 0 ? (
        <p>No concepts remain in the selected draft.</p>
      ) : (
        <>
          <svg
            className="staged-graph__canvas"
            viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
            role="img"
            aria-label={`Validated graph with ${conceptCount(preview.totalNodes)} and ${linkCount(preview.totalEdges)}.`}
          >
            {preview.edges.map((edge, index) => {
              const source = positionsById.get(edge.source);
              const target = positionsById.get(edge.target);
              if (!source || !target) return null;
              return (
                <line
                  className="staged-graph__edge"
                  key={`${edge.source}-${edge.target}-${index}`}
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                />
              );
            })}
            {preview.nodes.map((node, index) => {
              const position = positions[index];
              return (
                <g key={node.id}>
                  <circle
                    className={`staged-graph__node${node.staged ? " staged-graph__node--staged" : ""}`}
                    cx={position.x}
                    cy={position.y}
                    r={preview.nodes.length > 32 ? 4 : 7}
                  />
                  <title>{node.title} ({node.conceptType}, {node.staged ? "staged" : "existing"})</title>
                  {showLabels && (
                    <text
                      x={position.x}
                      y={position.y + 17}
                      textAnchor={labelAnchor(position.x)}
                    >
                      {shortLabel(node.title)}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          <ul className="sr-only">
            {preview.nodes.map((node) => (
              <li key={node.id}>
                {node.title}, {node.conceptType}, {node.staged ? "staged" : "existing"}
              </li>
            ))}
            {preview.edges.map((edge, index) => (
              <li key={`${edge.source}-${edge.target}-${index}`}>
                Link from {edge.source} to {edge.target}
              </li>
            ))}
          </ul>
        </>
      )}
      {preview.truncated && (
        <p>Preview limited to the first 128 concepts and 512 links. Totals include the full graph.</p>
      )}
      <p><span className="staged-graph__key" aria-hidden="true" /> Filled nodes are staged changes.</p>
    </section>
  );
}

function graphPositions(nodeCount: number): GraphPosition[] {
  if (nodeCount === 0) return [];
  if (nodeCount === 1) {
    return [{ x: VIEWBOX_WIDTH / 2, y: VIEWBOX_HEIGHT / 2 - 8 }];
  }

  const availableWidth = VIEWBOX_WIDTH - VIEWBOX_MARGIN * 2;
  const availableHeight = VIEWBOX_HEIGHT - VIEWBOX_MARGIN * 2;
  const columns = Math.ceil(Math.sqrt(nodeCount * (availableWidth / availableHeight)));
  const rows = Math.ceil(nodeCount / columns);

  return Array.from({ length: nodeCount }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const rowNodeCount = Math.min(columns, nodeCount - row * columns);
    const rowWidth = rowNodeCount === 1 ? 0 : availableWidth;
    const rowStart = (VIEWBOX_WIDTH - rowWidth) / 2;
    return {
      x: rowNodeCount === 1 ? VIEWBOX_WIDTH / 2 : rowStart + column * rowWidth / (rowNodeCount - 1),
      y: rows === 1
        ? VIEWBOX_HEIGHT / 2 - 8
        : VIEWBOX_MARGIN + row * availableHeight / (rows - 1),
    };
  });
}

function shortLabel(value: string): string {
  return value.length > 20 ? `${value.slice(0, 19)}…` : value;
}

function labelAnchor(x: number): "start" | "middle" | "end" {
  if (x <= VIEWBOX_MARGIN) return "start";
  if (x >= VIEWBOX_WIDTH - VIEWBOX_MARGIN) return "end";
  return "middle";
}

function conceptCount(count: number): string {
  return `${count} concept${count === 1 ? "" : "s"}`;
}

function linkCount(count: number): string {
  return `${count} link${count === 1 ? "" : "s"}`;
}
