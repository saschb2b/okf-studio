// The reader header's overflow menu: the concept-lifecycle actions that are
// rare, consequential, and open a reviewed transaction rather than doing
// anything on click — Move and Retire.
//
// Five actions in one header row is past the point where a toolbar is scanned
// rather than read, and the guidance is consistent: keep the frequent,
// non-destructive actions in view and put the infrequent ones one click away,
// on the right, behind a labelled trigger. Reading actions stay visible because
// reading is what this pane is for; these two are maintenance a reader does
// occasionally and deliberately.
//
// The menu owns both dialogs so the focus contract survives the move: the item
// that opened a dialog unmounts with the menu, so `finalFocus` names this
// trigger instead, and cancelling still lands on the control that opened it.
// See docs/features/concept-reader.md.

import { useRef, useState } from "react";
import { Menu } from "@base-ui/react/menu";
import { Archive, MoreHorizontal, MoveRight } from "lucide-react";
import { ConceptMoveDialog } from "@/features/reader/components/ConceptMoveDialog.tsx";
import { ConceptRetirementDialog } from "@/features/reader/components/ConceptRetirementDialog.tsx";
import type { Bundle, Concept } from "@/shared/types.ts";
import "@/shared/styles/baseui.css";
import "./ConceptActionsMenu.css";

export interface ConceptActionsMenuProps {
  bundle: Bundle | null;
  concept: Concept;
  /** Open another concept — a move's new path, or a retirement's replacement. */
  onSelectConcept: (conceptId: string) => void;
  /** Render with the menu already open. For stories of the open state. */
  defaultOpen?: boolean;
}

export function ConceptActionsMenu({
  bundle,
  concept,
  onSelectConcept,
  defaultOpen,
}: ConceptActionsMenuProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [retirementOpen, setRetirementOpen] = useState(false);

  return (
    <>
      <Menu.Root defaultOpen={defaultOpen}>
        <Menu.Trigger
          ref={triggerRef}
          id="reader-concept-actions"
          className="reader-concept-actions"
          aria-label="More concept actions"
          // A bare glyph carries no meaning on its own, so it is named twice —
          // once for assistive technology and once on hover.
          title="More concept actions"
        >
          <MoreHorizontal size={16} aria-hidden="true" />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner
            className="ui-popover-positioner"
            side="bottom"
            align="end"
            sideOffset={6}
          >
            <Menu.Popup className="ui-popover reader-actions-menu" aria-label="Concept actions">
              <Menu.Item
                className="reader-actions-menu__item"
                disabled={!bundle}
                onClick={() => setMoveOpen(true)}
              >
                <MoveRight size={14} aria-hidden="true" />
                <span>Move concept…</span>
              </Menu.Item>
              <Menu.Item
                className="reader-actions-menu__item"
                disabled={!bundle}
                onClick={() => setRetirementOpen(true)}
              >
                <Archive size={14} aria-hidden="true" />
                <span>Retire concept…</span>
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>

      {moveOpen && bundle ? (
        <ConceptMoveDialog
          open
          bundleRoot={bundle.root}
          concept={concept}
          finalFocus={triggerRef}
          onOpenChange={setMoveOpen}
          onOpenMovedConcept={(conceptId) => {
            setMoveOpen(false);
            onSelectConcept(conceptId);
          }}
        />
      ) : null}

      {retirementOpen && bundle ? (
        <ConceptRetirementDialog
          open
          bundle={bundle}
          concept={concept}
          finalFocus={triggerRef}
          onOpenChange={setRetirementOpen}
          onOpenConcept={(conceptId) => {
            setRetirementOpen(false);
            onSelectConcept(conceptId);
          }}
        />
      ) : null}
    </>
  );
}
