import type {
  ProfileRelationshipEdge,
  ProfileReport,
} from "@/shared/types.ts";

export interface ConceptRelationship {
  edge: ProfileRelationshipEdge;
  direction: "outgoing" | "incoming";
  otherId: string;
  label: string;
}

export function relationshipsForConcept(
  report: ProfileReport | null,
  conceptId: string,
): ConceptRelationship[] {
  if (!report) return [];
  return report.edges
    .flatMap((edge): ConceptRelationship[] => {
      if (edge.sourceId === conceptId) {
        return [{
          edge,
          direction: "outgoing",
          otherId: edge.targetId,
          label: edge.label,
        }];
      }
      if (edge.targetId === conceptId) {
        return [{
          edge,
          direction: "incoming",
          otherId: edge.sourceId,
          label: edge.inverse ?? `${edge.label} (incoming)`,
        }];
      }
      return [];
    })
    .sort((left, right) =>
      left.label.localeCompare(right.label)
      || left.otherId.localeCompare(right.otherId)
      || left.edge.namespace.localeCompare(right.edge.namespace)
    );
}
