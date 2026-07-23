import { Dialog } from "@base-ui/react/dialog";
import { Tabs } from "@base-ui/react/tabs";
import {
  Check,
  EyeOff,
  FileText,
  FolderOpen,
  ListChecks,
  TriangleAlert,
  X,
} from "lucide-react";
import { useApp } from "@/shared/store.tsx";
import type { Bundle } from "@/shared/types.ts";
import { MetadataInspector } from "@/features/reader/components/MetadataInspector.tsx";
import { AdvisoryProfiles } from "./AdvisoryProfiles.tsx";
import { IgnoreRules } from "./IgnoreRules.tsx";
import { getBundleConformance } from "@/features/bundle/bundleConformance.ts";
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
  const conformance = getBundleConformance(bundle.issues);

  function openConcept(conceptId: string) {
    onOpenChange(false);
    actions.selectConcept(conceptId);
  }

  function openValidationReport() {
    onOpenChange(false);
    actions.togglePanel("validation", true);
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
                Identity, health, metadata, and rules for {bundle.name}.
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
                <div className="bundle-details-summary__status">
                  <dt>OKF status</dt>
                  <dd>
                    <button
                      type="button"
                      className={`bundle-details-summary__health is-${conformance.kind}`}
                      aria-label={`Open validation report: ${conformance.label}, ${conformance.detail}`}
                      onClick={openValidationReport}
                    >
                      <span aria-hidden="true">
                        {conformance.kind === "error" ? (
                          <X size={14} />
                        ) : conformance.kind === "warning" ? (
                          <TriangleAlert size={14} />
                        ) : (
                          <Check size={14} />
                        )}
                      </span>
                      <span>
                        <strong>{conformance.label}</strong>
                        <small>{conformance.detail} · View report</small>
                      </span>
                    </button>
                  </dd>
                </div>
              </dl>
            </section>

            <Tabs.Root defaultValue="metadata" className="bundle-details-tabs">
              <Tabs.List className="bundle-details-tabs__list" activateOnFocus>
                <Tabs.Tab className="bundle-details-tabs__tab" value="metadata">
                  <FileText size={15} aria-hidden="true" />
                  Metadata
                </Tabs.Tab>
                <Tabs.Tab className="bundle-details-tabs__tab" value="ignore">
                  <EyeOff size={15} aria-hidden="true" />
                  Ignore rules
                </Tabs.Tab>
                <Tabs.Tab className="bundle-details-tabs__tab" value="profiles">
                  <ListChecks size={15} aria-hidden="true" />
                  Profiles
                </Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel className="bundle-details-panel" value="metadata">
                <section className="bundle-details-section" aria-labelledby="bundle-metadata-title">
                  <header className="bundle-details-section__head">
                    <div>
                      <h2 id="bundle-metadata-title">Bundle metadata</h2>
                      <p>Additional fields authored in the root <code>index.md</code>.</p>
                    </div>
                    <code>index.md</code>
                  </header>
                  {hasMetadata ? (
                    <MetadataInspector
                      title="Root fields"
                      source="index.md"
                      values={bundle.extra}
                    />
                  ) : (
                    <p className="bundle-details-empty">No additional bundle metadata is declared.</p>
                  )}
                </section>
              </Tabs.Panel>

              <Tabs.Panel className="bundle-details-panel" value="ignore">
                <IgnoreRules bundleRoot={bundle.root} />
              </Tabs.Panel>

              <Tabs.Panel className="bundle-details-panel" value="profiles">
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
                    <header className="bundle-details-section__head">
                      <div>
                        <h2 id="bundle-profiles-title">Advisory profiles</h2>
                        <p>Optional, version-pinned team conventions.</p>
                      </div>
                      <span className="bundle-details-boundary">Not OKF validation</span>
                    </header>
                    <p className="bundle-details-empty">No advisory profiles are declared.</p>
                  </section>
                )}
              </Tabs.Panel>
            </Tabs.Root>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
