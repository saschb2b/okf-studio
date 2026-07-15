// Multi-line SVG label centered on a point — the render half of
// viz/labels.ts's fitLabel. Shared by the custom label layers of the three
// hierarchy views so every chart wraps and sizes names the same way.

import type { FittedLabel } from "@/features/viz/labels.ts";

const LINE_HEIGHT = 1.2;

export function VizSvgLabel({
  x,
  y,
  fit,
  fill,
  rotate,
}: {
  x: number;
  y: number;
  fit: FittedLabel;
  fill: string;
  /** Degrees around (x, y) — radial sunburst labels rotate per arc. */
  rotate?: number;
}) {
  const lh = fit.fontSize * LINE_HEIGHT;
  const y0 = y - ((fit.lines.length - 1) * lh) / 2;
  return (
    <text
      textAnchor="middle"
      dominantBaseline="central"
      transform={rotate ? `rotate(${rotate} ${x} ${y})` : undefined}
      style={{
        fontSize: fit.fontSize,
        fontWeight: 600,
        fill,
        pointerEvents: "none",
        userSelect: "none",
      }}
    >
      {fit.lines.map((line, i) => (
        <tspan key={i} x={x} y={y0 + i * lh}>
          {line}
        </tspan>
      ))}
    </text>
  );
}
