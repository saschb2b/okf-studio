import { ShieldAlert } from "lucide-react";
import type { AccessHints } from "@/shared/access.ts";
import "./AccessNotice.css";

export function AccessNotice({ hints }: { hints: AccessHints }) {
  if (!hints.hasMetadata) return null;

  return (
    <aside className="access-notice" aria-label="Handling guidance">
      <header>
        <strong>
          <ShieldAlert size={14} aria-hidden="true" />
          Handling guidance
        </strong>
        <span>Advisory profile</span>
      </header>
      <dl>
        {hints.sensitivity && (
          <div>
            <dt>Sensitivity</dt>
            <dd>{hints.sensitivity}</dd>
          </div>
        )}
        {hints.audiences.length > 0 && (
          <div>
            <dt>Intended audience</dt>
            <dd>{hints.audiences.join(", ")}</dd>
          </div>
        )}
        {hints.handlingNotes && (
          <div>
            <dt>Handling notes</dt>
            <dd>{hints.handlingNotes}</dd>
          </div>
        )}
      </dl>
      {hints.diagnostics.map((diagnostic) => (
        <p className="access-notice__diagnostic" key={diagnostic}>{diagnostic}</p>
      ))}
      <p>
        These labels guide review and projection. They do not grant access or
        change filesystem permissions.
      </p>
    </aside>
  );
}
