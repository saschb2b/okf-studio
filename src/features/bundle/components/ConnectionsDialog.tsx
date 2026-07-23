import { Dialog } from "@base-ui/react/dialog";
import { Link2, X } from "lucide-react";
import { useApp } from "@/shared/store.tsx";
import type { Bundle } from "@/shared/types.ts";
import { BundleConnectionsWorkspace } from "./BundleConnections.tsx";
import "@/shared/styles/baseui.css";
import "@/shared/styles/chrome.css";
import "./ConnectionsDialog.css";

export function ConnectionsDialog({
  open,
  bundle,
  onOpenChange,
}: {
  open: boolean;
  bundle: Bundle;
  onOpenChange: (open: boolean) => void;
}) {
  const { actions } = useApp();

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="ui-backdrop" />
        <Dialog.Popup className="ui-dialog connections-dialog">
          <header className="ui-dialog-head connections-dialog__head">
            <span className="connections-dialog__icon" aria-hidden="true">
              <Link2 size={18} />
            </span>
            <div>
              <Dialog.Title className="ui-dialog-title">Bundle connections</Dialog.Title>
              <Dialog.Description className="connections-dialog__description">
                Resolve external knowledge, exchange relationships, and inspect optional
                conventions for {bundle.name}.
              </Dialog.Description>
            </div>
            <Dialog.Close className="btn ghost icon" aria-label="Close bundle connections">
              <X size={16} />
            </Dialog.Close>
          </header>

          <div className="connections-dialog__body">
            <BundleConnectionsWorkspace
              bundle={bundle}
              onOpenConcept={(conceptId) => {
                onOpenChange(false);
                actions.selectConcept(conceptId);
              }}
              onReviewExternal={(url) => {
                onOpenChange(false);
                actions.setRemoteOpen(true, url);
              }}
            />
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
