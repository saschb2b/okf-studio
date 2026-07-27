// OKF v0.2's answer to "should I believe this, and is it still true?", in the
// Reader's rail.
//
// The ordering is the argument. Freshness comes first, because a deprecated or
// stale concept should stop a reader before they weigh how well-sourced it is.
// Then the trust tier, then who wrote it and who confirmed it, then the sources
// those confirmations rest on. A reader who stops after the first line has still
// learned the thing most likely to change their mind.
//
// Nothing here is rendered when a concept declares none of it. A v0.1 bundle is
// consumable, and an empty "Trust" panel on every concept would read as an
// accusation rather than an absence.

import { BadgeCheck, CircleSlash, Clock, ShieldQuestion, UserCheck } from "lucide-react";
import type { Concept } from "@/shared/types.ts";
import {
  authoredAt,
  freshnessNotice,
  isHuman,
  sourceSignals,
  TIER_LABEL,
  TIER_MEANING,
  trustTier,
} from "@/features/bundle/trust.ts";
import "@/shared/styles/chrome.css";
import "./ConceptTrust.css";

const TIER_ICON = {
  "unverified": ShieldQuestion,
  "machine-confirmed": BadgeCheck,
  "human-reviewed": UserCheck,
} as const;

interface ConceptTrustProps {
  concept: Concept;
  /** Injected so a story or a test can pin the day staleness is judged against. */
  today?: string;
  /**
   * Opens a followable source in the system browser.
   *
   * Passed in rather than rendering an `<a href>`: this is a webview, so a plain
   * anchor navigates the app away from itself. Absent, a resource is shown as
   * text — which is what a source the reader cannot follow gets anyway.
   */
  onOpenResource?: (resource: string) => void;
}

/** Whether this concept says anything a trust panel would show. */
export function hasTrustSignals(concept: Concept): boolean {
  return (
    concept.generated !== null ||
    concept.verified.length > 0 ||
    concept.sources.length > 0 ||
    concept.staleAfter !== null ||
    concept.status !== "stable"
  );
}

export function ConceptTrust({ concept, today, onOpenResource }: ConceptTrustProps) {
  if (!hasTrustSignals(concept)) return null;

  const tier = trustTier(concept);
  const TierIcon = TIER_ICON[tier];
  const notice = today === undefined
    ? freshnessNotice(concept)
    : freshnessNotice(concept, today);
  const written = authoredAt(concept);

  return (
    <div className="concept-trust">
      {notice && (
        <p
          className="concept-trust__notice"
          data-severity={concept.status === "deprecated" ? "deprecated" : "warning"}
          // A notice a reader must not miss, but not an error in the bundle:
          // status is a fact about the knowledge, not a defect in the file.
          role="note"
        >
          {concept.status === "deprecated"
            ? <CircleSlash size={14} aria-hidden="true" />
            : <Clock size={14} aria-hidden="true" />}
          {notice}
        </p>
      )}

      <p className="concept-trust__tier" data-tier={tier}>
        <TierIcon size={14} aria-hidden="true" />
        <span className="concept-trust__tier-label">{TIER_LABEL[tier]}</span>
      </p>
      <p className="concept-trust__meaning">{TIER_MEANING[tier]}</p>

      <dl className="concept-trust__facts">
        {concept.generated && (
          <div className="concept-trust__fact">
            <dt>Written by</dt>
            <dd>
              <code>{concept.generated.by}</code>
              {written && (
                <>
                  {" "}
                  <time dateTime={written}>{written}</time>
                </>
              )}
            </dd>
          </div>
        )}
        {concept.verified.length > 0 && (
          <div className="concept-trust__fact">
            <dt>Confirmed by</dt>
            <dd>
              <ul className="concept-trust__verifiers">
                {concept.verified.map((verification) => (
                  <li key={`${verification.by}-${verification.at ?? ""}`}>
                    {/* Marked because the human sign-off is what raises the
                        tier, so it is worth seeing which entry did it. */}
                    <code data-human={isHuman(verification) ? "true" : undefined}>
                      {verification.by}
                    </code>
                    {verification.at && (
                      <>
                        {" "}
                        <time dateTime={verification.at}>{verification.at}</time>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        )}
      </dl>

      {concept.sources.length > 0 && (
        <div className="concept-trust__sources">
          <h4>Sources</h4>
          <ul>
            {concept.sources.map((source, index) => {
              const signals = sourceSignals(concept, source);
              const followable = /^https?:\/\//.test(source.resource);
              return (
                <li key={source.id ?? `${source.resource}-${index}`}>
                  <span className="concept-trust__source-title">
                    {source.title ?? source.resource}
                  </span>
                  {/* A resource can be a population the reader cannot follow —
                      "all queries in BigQuery project X" — so it is shown as
                      text unless it is genuinely openable. */}
                  {source.title && (
                    <span className="concept-trust__source-resource">
                      {followable && onOpenResource
                        ? (
                          <button
                            type="button"
                            className="link-btn concept-trust__open"
                            onClick={() => onOpenResource(source.resource)}
                          >
                            {source.resource}
                          </button>
                        )
                        : source.resource}
                    </span>
                  )}
                  {signals.length > 0 && (
                    <span className="concept-trust__signals">{signals.join(" · ")}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
