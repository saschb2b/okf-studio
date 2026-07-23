import type { MouseEvent } from "react";
import { titleOf } from "@/shared/selectors.ts";
import {
  relationshipsForConcept,
  type ConceptRelationship,
} from "@/shared/relationships.ts";
import type { Bundle, ProfileReport } from "@/shared/types.ts";
import "./Reader.css";

export function TypedRelationships({
  bundle,
  conceptId,
  hasMetadata,
  status,
  report,
  message,
  onSelect,
  onPeek,
  onPeekEnd,
}: {
  bundle: Bundle | null;
  conceptId: string;
  hasMetadata: boolean;
  status: "idle" | "loading" | "ready" | "error";
  report: ProfileReport | null;
  message: string;
  onSelect: (id: string, event?: MouseEvent<HTMLElement>) => void;
  onPeek: (id: string, element: HTMLElement) => void;
  onPeekEnd: () => void;
}) {
  const relationships = relationshipsForConcept(report, conceptId);
  if (!hasMetadata && relationships.length === 0) return null;

  return (
    <section className="rail-module" aria-label="Typed relationships">
      <h3 className="rail-title">
        Typed relationships
        <span className="rail-count">{relationships.length}</span>
      </h3>
      {status === "loading" ? (
        <p className="typed-rel-state">Reading profile annotations…</p>
      ) : status === "error" ? (
        <p className="typed-rel-state is-warning">{message}</p>
      ) : relationships.length > 0 ? (
        <TypedRelationshipRows
          bundle={bundle}
          relationships={relationships}
          onSelect={onSelect}
          onPeek={onPeek}
          onPeekEnd={onPeekEnd}
        />
      ) : (
        <p className="typed-rel-state is-warning">
          No usable annotations. Check profile advice.
        </p>
      )}
    </section>
  );
}

function TypedRelationshipRows({
  bundle,
  relationships,
  onSelect,
  onPeek,
  onPeekEnd,
}: {
  bundle: Bundle | null;
  relationships: ConceptRelationship[];
  onSelect: (id: string, event?: MouseEvent<HTMLElement>) => void;
  onPeek: (id: string, element: HTMLElement) => void;
  onPeekEnd: () => void;
}) {
  return (
    <ul className="rel-list typed-rel-list">
      {relationships.map((relationship) => {
        const { edge } = relationship;
        const key = `${edge.sourceId}:${edge.namespace}:${edge.type}:${edge.targetId}`;
        const content = (
          <>
            <span
              className="typed-rel-kind"
              title={`${edge.namespace}.${edge.type}`}
            >
              {relationship.direction === "outgoing"
                ? `${relationship.label} →`
                : `← ${relationship.label}`}
            </span>
            <span className="typed-rel-title">
              {titleOf(bundle, relationship.otherId)}
            </span>
            <span className="typed-rel-flags">
              {!edge.recognized ? <small>Unknown type</small> : null}
              {!edge.portableLink ? <small>No prose link</small> : null}
              {!edge.targetExists ? <small>Missing target</small> : null}
            </span>
          </>
        );
        return (
          <li key={key}>
            {edge.targetExists ? (
              <button
                type="button"
                className="typed-rel-link"
                onClick={(event) => onSelect(relationship.otherId, event)}
                onMouseEnter={(event) => onPeek(relationship.otherId, event.currentTarget)}
                onMouseLeave={onPeekEnd}
                onFocus={(event) => onPeek(relationship.otherId, event.currentTarget)}
                onBlur={onPeekEnd}
              >
                {content}
              </button>
            ) : (
              <div className="typed-rel-link is-missing">{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
