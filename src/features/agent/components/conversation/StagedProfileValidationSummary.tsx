import type { AgentStagedProfileValidation } from "@/features/agent/connection.ts";
import type { OkfProfileTaskContext } from "@/features/agent/profileContext.ts";
import "./StagedProfileValidationSummary.css";

export function StagedProfileValidationSummary({
  profile,
  profileContext,
}: {
  profile: AgentStagedProfileValidation;
  profileContext: OkfProfileTaskContext | null;
}) {
  if (profile.declared === 0) return null;

  const requirementLabel = (namespace: string, field: string) =>
    profileContext?.profiles
      .find((candidate) => candidate.namespace === namespace)
      ?.fields.find((candidate) => candidate.key === field)
      ?.requirement ?? "Profile advice";

  return (
    <section
      className="staged-profile-validation"
      aria-label="Advisory profile check result"
    >
      <header>
        <strong>
          {profile.diagnostics.length === 0 && profile.unavailable === 0
            ? "Profile checks passed"
            : "Profile advice remains"}
        </strong>
        <span>Not OKF validation</span>
      </header>
      <p>
        {profile.active} active
        {" · "}
        {profile.unavailable} unavailable
        {" · "}
        {profile.source === "selected-source"
          ? "selected source profile"
          : "draft declaration"}
      </p>
      {profile.diagnostics.length > 0 && (
        <details>
          <summary>Review profile advice · {profile.diagnostics.length}</summary>
          <ul>
            {profile.diagnostics.map((diagnostic, index) => (
              <li
                key={[
                  diagnostic.namespace,
                  diagnostic.ruleId,
                  diagnostic.path,
                  diagnostic.field,
                  index,
                ].join(":")}
              >
                <span className="staged-profile-validation__requirement">
                  {requirementLabel(diagnostic.namespace, diagnostic.field)}
                </span>
                <span>
                  <code>{diagnostic.path}: </code>
                  {diagnostic.message}
                  <small>
                    {diagnostic.namespace} · {diagnostic.ruleId}
                  </small>
                </span>
              </li>
            ))}
          </ul>
          {profile.truncated && (
            <p>More profile advice was omitted at the display limit.</p>
          )}
        </details>
      )}
    </section>
  );
}
