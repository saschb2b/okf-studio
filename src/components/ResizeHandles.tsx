// Invisible resize handles for the borderless window — thin strips at each edge
// and small squares at each corner that start a native resize drag. Only mounted
// inside a Tauri window; absent in the browser/dev preview. They sit within the
// top bar's padding at the top edge, so they never overlap the window controls.
// See docs/ux/browsing-layout.md.

import { isTauri } from "../ipc.ts";
import { startWindowResize } from "../window.ts";
import type { ResizeDir } from "../window.ts";
import "./ResizeHandles.css";

const HANDLES: { cls: string; dir: ResizeDir }[] = [
  { cls: "rz-n", dir: "North" },
  { cls: "rz-s", dir: "South" },
  { cls: "rz-e", dir: "East" },
  { cls: "rz-w", dir: "West" },
  { cls: "rz-ne", dir: "NorthEast" },
  { cls: "rz-nw", dir: "NorthWest" },
  { cls: "rz-se", dir: "SouthEast" },
  { cls: "rz-sw", dir: "SouthWest" },
];

export function ResizeHandles() {
  if (!isTauri()) return null;
  return (
    <>
      {HANDLES.map((h) => (
        // Invisible OS window-resize strips: pointer-only (the native frame's
        // own resize affordance), no keyboard equivalent, so hidden from
        // assistive tech rather than exposed as nameless controls.
        <div
          key={h.cls}
          className={`rz ${h.cls}`}
          aria-hidden="true"
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            void startWindowResize(h.dir);
          }}
        />
      ))}
    </>
  );
}
