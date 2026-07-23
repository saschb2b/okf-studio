import type { AgentStagedGraphNode } from "@/features/agent/connection.ts";
import "./StagedAccessSummary.css";

export function StagedAccessSummary({
  nodes,
}: {
  nodes: readonly AgentStagedGraphNode[];
}) {
  const guided = nodes.filter((node) => node.staged && node.access?.hasMetadata);
  if (guided.length === 0) return null;

  return (
    <section className="staged-access-summary" aria-label="Staged handling guidance">
      <header>
        <strong>Handling guidance in staged files</strong>
        <span>Not access control</span>
      </header>
      <p>
        Review these authored labels with the diff. They neither authorize the
        write nor remove evidence from it.
      </p>
      <ul>
        {guided.map((node) => {
          const access = node.access;
          if (!access) return null;
          return (
            <li key={node.id}>
              <strong>{node.title}</strong>
              <code>{node.id}.md</code>
              {access.sensitivity && <span>Sensitivity: {access.sensitivity}</span>}
              {access.audiences.length > 0 && (
                <span>Audience: {access.audiences.join(", ")}</span>
              )}
              {access.handlingNotes && <span>{access.handlingNotes}</span>}
              {access.diagnostics.map((diagnostic) => (
                <span className="staged-access-summary__diagnostic" key={diagnostic}>
                  {diagnostic}
                </span>
              ))}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
