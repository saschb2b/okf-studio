import type {
  ProfileRelationshipEdge,
  ProfileReport,
} from "@/shared/types.ts";

export interface RelationshipGroup {
  key: string;
  namespace: string;
  type: string;
  label: string;
  recognized: boolean;
  count: number;
  conceptIds: string[];
}

export interface ConceptRelationship {
  edge: ProfileRelationshipEdge;
  direction: "outgoing" | "incoming";
  otherId: string;
  label: string;
}

export function relationshipKey(namespace: string, type: string): string {
  return `${namespace}::${type}`;
}

export function relationshipGroups(report: ProfileReport | null): RelationshipGroup[] {
  if (!report) return [];
  const groups = new Map<string, RelationshipGroup>();
  for (const edge of report.edges) {
    const key = relationshipKey(edge.namespace, edge.type);
    const current = groups.get(key) ?? {
      key,
      namespace: edge.namespace,
      type: edge.type,
      label: edge.label,
      recognized: edge.recognized,
      count: 0,
      conceptIds: [],
    };
    current.count += 1;
    current.recognized ||= edge.recognized;
    if (edge.targetExists && edge.portableLink) {
      if (!current.conceptIds.includes(edge.sourceId)) current.conceptIds.push(edge.sourceId);
      if (!current.conceptIds.includes(edge.targetId)) current.conceptIds.push(edge.targetId);
    }
    groups.set(key, current);
  }
  return [...groups.values()].sort((left, right) =>
    Number(right.recognized) - Number(left.recognized)
    || left.label.localeCompare(right.label)
    || left.namespace.localeCompare(right.namespace)
    || left.type.localeCompare(right.type)
  );
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
