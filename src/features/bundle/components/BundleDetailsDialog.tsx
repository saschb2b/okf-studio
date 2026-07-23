import { Dialog } from "@base-ui/react/dialog";
import { FileText, FolderOpen, X } from "lucide-react";
import { useApp } from "@/shared/store.tsx";
import type { Bundle } from "@/shared/types.ts";
import { MetadataInspector } from "@/features/reader/components/MetadataInspector.tsx";
import { AdvisoryProfiles } from "./AdvisoryProfiles.tsx";
import { IgnoreRules } from "./IgnoreRules.tsx";
import { BUNDLE_DETAILS_OPENER_ID } from "@/features/bundle/bundleDetailsFocus.ts";
import "@/shared/styles/baseui.css";
import "@/shared/styles/chrome.css";
import "./BundleDetailsDialog.css";

interface BundleDetailsDialogProps {
  open: boolean;
  bundle: Bundle;
  onOpenChange: (open: boolean) => void;
}

export function BundleDetailsDialog({
  open,
  bundle,
  onOpenChange,
}: BundleDetailsDialogProps) {
  const { actions } = useApp();
  const formatVersions = [
    bundle.odsfVersion ? `ODSF ${bundle.odsfVersion}` : null,
    bundle.okfVersion ? `OKF ${bundle.okfVersion}` : null,
  ].filter((version): version is string => version !== null);
  const hasMetadata = Object.keys(bundle.extra).length > 0;
  const hasProfiles = Object.hasOwn(bundle.extra, "profiles");

  function openConcept(conceptId: string) {
    onOpenChange(false);
    actions.selectConcept(conceptId);
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="ui-backdrop" />
        <Dialog.Popup className="ui-dialog bundle-details-dialog">
          <header className="ui-dialog-head bundle-details-dialog__head">
            <div>
              <Dialog.Title className="ui-dialog-title">Bundle details</Dialog.Title>
              <Dialog.Description className="bundle-details-dialog__description">
                Format, metadata, and rules for {bundle.name}.
              </Dialog.Description>
            </div>
            <Dialog.Close className="btn ghost icon" aria-label="Close bundle details">
              <X size={16} />
            </Dialog.Close>
          </header>

          <div className="bundle-details-dialog__body">
            <section className="bundle-details-summary" aria-labelledby="bundle-details-summary-title">
              <div className="bundle-details-summary__identity">
                <span className="bundle-details-summary__icon" aria-hidden="true">
                  <FolderOpen size={18} />
                </span>
                <div>
                  <h2 id="bundle-details-summary-title">{bundle.name}</h2>
                  <code title={bundle.root}>{bundle.root}</code>
                </div>
              </div>
              <dl>
                <div>
                  <dt>Format</dt>
                  <dd>{formatVersions.length > 0 ? formatVersions.join(" · ") : "Not declared"}</dd>
                </div>
                <div>
                  <dt>Contents</dt>
                  <dd>{bundle.concepts.length} concept{bundle.concepts.length === 1 ? "" : "s"}</dd>
                </div>
              </dl>
            </section>

            <section className="bundle-details-section" aria-labelledby="bundle-metadata-title">
              <header>
                <span aria-hidden="true"><FileText size={16} /></span>
                <div>
                  <h2 id="bundle-metadata-title">Bundle metadata</h2>
                  <p>Additional fields authored in the root <code>index.md</code>.</p>
                </div>
              </header>
              {hasMetadata ? (
                <MetadataInspector
                  title="Fields"
                  source="index.md"
                  values={bundle.extra}
                />
              ) : (
                <p className="bundle-details-empty">No additional bundle metadata is declared.</p>
              )}
            </section>

            <IgnoreRules bundleRoot={bundle.root} />

            {hasProfiles ? (
              <AdvisoryProfiles
                bundleRoot={bundle.root}
                onOpenConcept={openConcept}
                onReviewMigration={(diagnostic) => {
                  onOpenChange(false);
                  actions.openOkfTaskLauncher({
                    kind: "profile-finding",
                    id: `${diagnostic.namespace}:${diagnostic.ruleId}:${diagnostic.file}`,
                    title: diagnostic.message,
                    conceptId: diagnostic.conceptId,
                    diagnostic,
                  }, {
                    preferredTaskId: "okf-migrate",
                    returnFocusId: BUNDLE_DETAILS_OPENER_ID,
                  });
                }}
              />
            ) : (
              <section className="bundle-details-section" aria-labelledby="bundle-profiles-title">
                <header>
                  <div>
                    <h2 id="bundle-profiles-title">Advisory profiles</h2>
                    <p>Optional, version-pinned team conventions.</p>
                  </div>
                  <span className="bundle-details-boundary">Not OKF validation</span>
                </header>
                <p className="bundle-details-empty">No advisory profiles are declared.</p>
              </section>
            )}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
