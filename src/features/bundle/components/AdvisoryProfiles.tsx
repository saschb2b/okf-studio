import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";
import { readProfileReport } from "@/shared/ipc.ts";
import type {
  ProfileDiagnostic,
  ProfileReport,
  ProfileResolution,
} from "@/shared/types.ts";
import "./AdvisoryProfiles.css";

type ProfileReportState =
  | { status: "loading"; bundleRoot: string }
  | { status: "ready"; bundleRoot: string; report: ProfileReport }
  | { status: "error"; bundleRoot: string; message: string };

function profileDiagnostics(
  report: ProfileReport,
  profile: ProfileResolution,
): ProfileDiagnostic[] {
  return report.diagnostics.filter((diagnostic) => diagnostic.namespace === profile.namespace);
}

function ProfileCard({
  profile,
  diagnostics,
  onOpenConcept,
  onReviewMigration,
}: {
  profile: ProfileResolution;
  diagnostics: ProfileDiagnostic[];
  onOpenConcept?: (conceptId: string) => void;
  onReviewMigration?: (diagnostic: ProfileDiagnostic, focusId: string) => void;
}) {
  const active = profile.status === "active";
  const descriptor = profile.descriptor;

  return (
    <li className={`profile-card is-${profile.status}`}>
      <header className="profile-card-head">
        <span className="profile-state-icon" aria-hidden="true">
          {active ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
        </span>
        <span className="profile-identity">
          <code>{profile.namespace}</code>
          {profile.version ? <span>v{profile.version}</span> : null}
        </span>
        <span className="profile-state">{active ? "Active" : "Unavailable"}</span>
      </header>

      <p className="profile-message">{profile.message}</p>
      {profile.descriptorPath ? <code className="profile-path">{profile.descriptorPath}</code> : null}

      {descriptor ? (
        <>
          <div className="profile-title-row">
            <h3>{descriptor.title}</h3>
            <span>{descriptor.description}</span>
          </div>
          <dl className="profile-counts" aria-label={`${profile.namespace} descriptor contents`}>
            <div>
              <dt>Fields</dt>
              <dd>{descriptor.fields.length}</dd>
            </div>
            <div>
              <dt>Relationships</dt>
              <dd>{descriptor.relationships.length}</dd>
            </div>
            <div>
              <dt>Checks</dt>
              <dd>{descriptor.checks.length}</dd>
            </div>
          </dl>
        </>
      ) : null}

      {diagnostics.length > 0 ? (
        <div className="profile-diagnostics">
          <h4>Profile advice · {diagnostics.length}</h4>
          <ul>
            {diagnostics.slice(0, 8).map((diagnostic) => {
              const target = diagnostic.conceptId;
              const migrationId = [
                "profile-migration",
                diagnostic.namespace,
                diagnostic.ruleId,
                diagnostic.file,
              ].join(":");
              const content = (
                <>
                  <span className={`profile-diagnostic-level is-${diagnostic.level}`}>
                    {diagnostic.level}
                  </span>
                  <span>{diagnostic.message}</span>
                  <span className="profile-diagnostic-source">
                    <code>{diagnostic.file}</code>
                    <code>{diagnostic.ruleId}</code>
                  </span>
                </>
              );
              return (
                <li key={`${diagnostic.ruleId}:${diagnostic.file}:${diagnostic.field}`}>
                  <div className="profile-diagnostic-entry">
                    <div className="profile-diagnostic-content">
                      {content}
                    </div>
                    {(target && onOpenConcept) || onReviewMigration ? (
                      <div className="profile-diagnostic-actions">
                        {target && onOpenConcept ? (
                          <button type="button" onClick={() => onOpenConcept(target)}>
                            Open concept
                          </button>
                        ) : null}
                        {onReviewMigration ? (
                          <button
                            id={migrationId}
                            type="button"
                            onClick={() => onReviewMigration(diagnostic, migrationId)}
                          >
                            Review migration
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
          {diagnostics.length > 8 ? (
            <p className="profile-omitted">{diagnostics.length - 8} more findings omitted here.</p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export function AdvisoryProfilesView({
  report,
  onOpenConcept,
  onReviewMigration,
}: {
  report: ProfileReport;
  onOpenConcept?: (conceptId: string) => void;
  onReviewMigration?: (diagnostic: ProfileDiagnostic, focusId: string) => void;
}) {
  if (report.profiles.length === 0) return null;

  return (
    <section className="advisory-profiles" aria-labelledby="advisory-profiles-title">
      <header className="advisory-profiles-head">
        <div>
          <h2 id="advisory-profiles-title">Advisory profiles</h2>
          <p>Team conventions from local, version-pinned descriptors.</p>
        </div>
        <span className="profile-boundary">Not OKF validation</span>
      </header>
      <ul className="profile-list">
        {report.profiles.map((profile) => (
          <ProfileCard
            key={profile.namespace}
            profile={profile}
            diagnostics={profileDiagnostics(report, profile)}
            onOpenConcept={onOpenConcept}
            onReviewMigration={onReviewMigration}
          />
        ))}
      </ul>
      {report.truncated ? (
        <p className="profile-omitted">Additional declarations were omitted at the 16-profile limit.</p>
      ) : null}
    </section>
  );
}

export function AdvisoryProfiles({
  bundleRoot,
  onOpenConcept,
  onReviewMigration,
}: {
  bundleRoot: string;
  onOpenConcept?: (conceptId: string) => void;
  onReviewMigration?: (diagnostic: ProfileDiagnostic, focusId: string) => void;
}) {
  const [state, setState] = useState<ProfileReportState>({
    status: "loading",
    bundleRoot,
  });

  useEffect(() => {
    let ignore = false;
    void readProfileReport(bundleRoot).then(
      (report) => {
        if (!ignore) setState({ status: "ready", bundleRoot, report });
      },
      (error: unknown) => {
        if (!ignore) {
          setState({
            status: "error",
            bundleRoot,
            message: error instanceof Error
              ? error.message
              : "Studio could not resolve the bundle's advisory profiles.",
          });
        }
      },
    );
    return () => {
      ignore = true;
    };
  }, [bundleRoot]);

  if (state.status === "loading" || state.bundleRoot !== bundleRoot) {
    return <p className="profile-loading" role="status">Resolving advisory profiles…</p>;
  }
  if (state.status === "error") {
    return (
      <section className="advisory-profiles is-error" aria-labelledby="advisory-profiles-error-title">
        <header className="advisory-profiles-head">
          <div>
            <h2 id="advisory-profiles-error-title">Advisory profiles unavailable</h2>
            <p>{state.message}</p>
          </div>
          <span className="profile-boundary">Bundle remains open</span>
        </header>
      </section>
    );
  }
  return (
    <AdvisoryProfilesView
      report={state.report}
      onOpenConcept={onOpenConcept}
      onReviewMigration={onReviewMigration}
    />
  );
}
