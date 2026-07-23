import type { ReliabilityAssessment } from "@/shared/reliability.ts";

const STATE_LABEL: Record<ReliabilityAssessment["state"], string> = {
  current: "Current",
  uncertain: "Uncertain",
  contradicted: "Contradicted",
  "review-overdue": "Review overdue",
  "not-yet-effective": "Not yet effective",
  expired: "Outside effective period",
  deprecated: "Deprecated",
  superseded: "Superseded",
  retired: "Retired",
};

export function ReliabilityNotice({
  assessment,
}: {
  assessment: ReliabilityAssessment;
}) {
  if (!assessment.hasMetadata) return null;
  const details = [
    assessment.confidence !== null
      ? `Authored confidence: ${Math.round(assessment.confidence * 100)}%`
      : null,
    assessment.reviewAfter ? `Review after: ${assessment.reviewAfter}` : null,
    assessment.effectiveFrom ? `Effective from: ${assessment.effectiveFrom}` : null,
    assessment.effectiveUntil ? `Effective until: ${assessment.effectiveUntil}` : null,
    assessment.supersededBy.length
      ? `Replacement: ${assessment.supersededBy.join(", ")}`
      : null,
    assessment.contradictedBy.length
      ? `Contradicted by: ${assessment.contradictedBy.join(", ")}`
      : null,
  ].filter((item): item is string => item !== null);

  return (
    <aside
      className="reliability-notice"
      data-state={assessment.state}
      aria-label="Reliability advisory"
    >
      <header>
        <strong>{STATE_LABEL[assessment.state]}</strong>
        <span>Advisory profile</span>
      </header>
      {details.length > 0 && (
        <ul>
          {details.map((detail) => <li key={detail}>{detail}</li>)}
        </ul>
      )}
      {assessment.diagnostics.map((diagnostic) => (
        <p key={diagnostic} className="reliability-notice__diagnostic">{diagnostic}</p>
      ))}
      <p>Studio reports authored signals; it has not verified the claim itself.</p>
    </aside>
  );
}
