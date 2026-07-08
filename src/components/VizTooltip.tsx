// Hover card for the hierarchy visualizations — a real elevated surface (the
// peek-card tier) rather than nivo's themed text, so the tooltip is always
// legible regardless of the fill it floats over. Non-interactive by design.
//
// React Compiler is enabled: no manual useMemo/useCallback/memo.

import { useLayoutEffect, useRef } from "react";
import "./VizPane.css";

export function VizTooltip({
  name,
  meta,
  dot,
}: {
  /** Display name (bold line). */
  name: string;
  /** Quiet second line: type · size, or group stats. */
  meta?: string;
  /** Type color swatch beside the name — identity via a mark, not colored text. */
  dot?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Nivo anchors its tooltip wrapper to the cursor, which can push the card
  // past the pane edge where overflow:hidden clips it. Clamp the card back
  // inside the pane, and re-clamp whenever nivo moves the wrapper (it updates
  // the wrapper's inline style on every mousemove without re-rendering us).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const pane = el.closest(".viz-chart");
    if (!pane) return;

    const clamp = () => {
      el.style.transform = ""; // measure the uncorrected position
      const r = el.getBoundingClientRect();
      const p = pane.getBoundingClientRect();
      const pad = 8;
      let dx = 0;
      if (r.left < p.left + pad) dx = p.left + pad - r.left;
      else if (r.right > p.right - pad) dx = p.right - pad - r.right;
      let dy = 0;
      if (r.top < p.top + pad) dy = p.top + pad - r.top;
      else if (r.bottom > p.bottom - pad) dy = p.bottom - pad - r.bottom;
      if (dx || dy) el.style.transform = `translate(${dx}px, ${dy}px)`;
    };

    clamp();
    const wrapper = el.parentElement;
    if (!wrapper) return;
    const observer = new MutationObserver(clamp);
    observer.observe(wrapper, { attributes: true, attributeFilter: ["style"] });
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="viz-tooltip">
      <div className="viz-tooltip-name">
        {dot && <span className="viz-tooltip-dot" style={{ background: dot }} />}
        {name}
      </div>
      {meta && <div className="viz-tooltip-meta">{meta}</div>}
    </div>
  );
}
