// The graph's Controls popover — renderer, link density, color mode, appearance,
// and layout forces. A pure presentational view: it renders from props and
// reports every change back through setters, so it holds no engine state and
// drops into a story or test without the canvas/sim behind it.

import type { Dispatch, ReactNode, SetStateAction } from "react";
import { Popover } from "@base-ui/react/popover";
import { Slider as BaseSlider } from "@base-ui/react/slider";
import type { LinkDensity } from "@/store.tsx";
import type { Display, Forces } from "@/graph/renderModel.ts";
import { DEFAULT_DISPLAY, GRAPH_FORCES } from "@/graph/renderModel.ts";

// Plain-language explanations of the *currently selected* option, shown under
// each segmented control so the panel teaches instead of just labelling.
const RENDERER_HINTS: Record<"canvas" | "gpu", string> = {
  canvas: "Default renderer — crisp and full-featured.",
  gpu: "WebGL — for very large graphs. Needs hardware support.",
};
const DENSITY_HINTS: Record<LinkDensity, string> = {
  sparse: "Only each concept's strongest links — clearest structure.",
  balanced: "A clean structural backbone. Recommended.",
  all: "Every cross-link — dense bundles can tangle.",
};
const COLOR_HINTS: Record<"cluster" | "type", string> = {
  cluster: "By detected community — groups of densely-linked concepts.",
  type: "By concept type (Feature, Reference, …).",
};

interface GraphControlsProps {
  renderer: "canvas" | "gpu";
  setRenderer: Dispatch<SetStateAction<"canvas" | "gpu">>;
  linkDensity: LinkDensity;
  setLinkDensity: (d: LinkDensity) => void;
  display: Display;
  setDisplay: Dispatch<SetStateAction<Display>>;
  forces: Forces;
  setForces: Dispatch<SetStateAction<Forces>>;
}

export function GraphControls({
  renderer,
  setRenderer,
  linkDensity,
  setLinkDensity,
  display,
  setDisplay,
  forces,
  setForces,
}: GraphControlsProps) {
  return (
    <div className="graph-panel">
      <Popover.Root>
        <Popover.Trigger className="graph-panel-toggle">Controls</Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner
            className="ui-popover-positioner"
            side="bottom"
            align="start"
            sideOffset={6}
          >
            <Popover.Popup className="ui-popover graph-panel-body">
              <Section title="Renderer" desc="How the graph is drawn.">
                <Segmented
                  ariaLabel="Renderer"
                  options={[
                    { value: "canvas", text: "Canvas" },
                    { value: "gpu", text: "GPU" },
                  ]}
                  value={renderer}
                  onChange={setRenderer}
                />
                <p className="graph-hint">{RENDERER_HINTS[renderer]}</p>
              </Section>
              {renderer === "canvas" && (
                <>
                  <Section
                    title="Connections"
                    desc="A bundle can be densely cross-linked. Choose how many links to draw."
                  >
                    <Segmented
                      ariaLabel="Link density"
                      options={[
                        { value: "sparse", text: "Key" },
                        { value: "balanced", text: "Balanced" },
                        { value: "all", text: "All" },
                      ]}
                      value={linkDensity}
                      onChange={setLinkDensity}
                    />
                    <p className="graph-hint">{DENSITY_HINTS[linkDensity]}</p>
                  </Section>
                  <Section title="Color" desc="What a node's color means.">
                    <Segmented
                      ariaLabel="Color nodes by"
                      options={[
                        { value: "cluster", text: "Cluster" },
                        { value: "type", text: "Type" },
                      ]}
                      value={display.colorBy}
                      onChange={(v) => setDisplay((d) => ({ ...d, colorBy: v }))}
                    />
                    <p className="graph-hint">{COLOR_HINTS[display.colorBy]}</p>
                  </Section>
                  <Section title="Appearance" desc="Size and emphasis of nodes and links.">
                    <Slider
                      label="Node size" min={0.4} max={2.5} step={0.1} value={display.nodeScale}
                      format={(v) => `${v.toFixed(1)}×`}
                      onChange={(v) => setDisplay((d) => ({ ...d, nodeScale: v }))}
                    />
                    <Slider
                      label="Link thickness" min={0.5} max={4} step={0.5} value={display.linkThickness}
                      format={(v) => `${v.toFixed(1)}×`}
                      onChange={(v) => setDisplay((d) => ({ ...d, linkThickness: v }))}
                    />
                    <Slider
                      label="Link opacity" min={0.05} max={1} step={0.05} value={display.linkOpacity}
                      format={(v) => `${Math.round(v * 100)}%`}
                      onChange={(v) => setDisplay((d) => ({ ...d, linkOpacity: v }))}
                    />
                    <Slider
                      label="Label visibility"
                      hint="How early titles appear as you zoom in."
                      min={0.5} max={3} step={0.1} value={display.labelScale}
                      format={(v) => `${v.toFixed(1)}×`}
                      onChange={(v) => setDisplay((d) => ({ ...d, labelScale: v }))}
                    />
                  </Section>
                  <Section title="Layout" desc="Fine-tune how the graph arranges itself.">
                    <Slider
                      label="Spacing" hint="How strongly nodes push apart."
                      min={0} max={6000} step={50} value={forces.repulsion}
                      format={(v) => `${Math.round((v / 6000) * 100)}%`}
                      onChange={(v) => setForces((f) => ({ ...f, repulsion: v }))}
                    />
                    <Slider
                      label="Link length" hint="Resting distance between connected nodes."
                      min={20} max={250} step={5} value={forces.springLength}
                      format={(v) => `${Math.round(((v - 20) / 230) * 100)}%`}
                      onChange={(v) => setForces((f) => ({ ...f, springLength: v }))}
                    />
                    <Slider
                      label="Link pull" hint="How strongly links draw nodes together."
                      min={0} max={0.3} step={0.01} value={forces.springK}
                      format={(v) => `${Math.round((v / 0.3) * 100)}%`}
                      onChange={(v) => setForces((f) => ({ ...f, springK: v }))}
                    />
                    <Slider
                      label="Gravity" hint="Pull toward the center; keeps the graph compact."
                      min={0} max={0.2} step={0.005} value={forces.centering}
                      format={(v) => `${Math.round((v / 0.2) * 100)}%`}
                      onChange={(v) => setForces((f) => ({ ...f, centering: v }))}
                    />
                    <Slider
                      label="Cluster pull"
                      hint="Gathers each detected community around its own center."
                      min={0} max={0.25} step={0.01} value={forces.clusterStrength ?? 0}
                      format={(v) => `${Math.round((v / 0.25) * 100)}%`}
                      onChange={(v) => setForces((f) => ({ ...f, clusterStrength: v }))}
                    />
                  </Section>
                  <button
                    type="button"
                    className="graph-panel-reset"
                    onClick={() => {
                      setForces({ ...GRAPH_FORCES });
                      setDisplay(DEFAULT_DISPLAY);
                      setLinkDensity("balanced");
                    }}
                  >
                    Reset to defaults
                  </button>
                </>
              )}
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}

/** A titled, optionally-described group of controls in the panel. */
function Section({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="graph-section">
      <legend>{title}</legend>
      {desc && <p className="graph-section-desc">{desc}</p>}
      {children}
    </fieldset>
  );
}

/** A full-width segmented (single-choice) control. */
function Segmented<T extends string>({
  ariaLabel,
  options,
  value,
  onChange,
}: {
  ariaLabel: string;
  options: { value: T; text: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="graph-seg graph-seg-full" role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className="graph-seg-btn"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.text}
        </button>
      ))}
    </div>
  );
}

/**
 * A labelled slider with its current value shown alongside (so the value stays
 * visible while dragging) and an optional one-line hint explaining what it does.
 */
function Slider({
  label,
  hint,
  min,
  max,
  step,
  value,
  format,
  onChange,
}: {
  label: string;
  hint?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="graph-slider">
      <div className="graph-slider-head">
        <span className="graph-slider-label">{label}</span>
        <span className="graph-slider-value">{format ? format(value) : String(value)}</span>
      </div>
      <BaseSlider.Root
        value={value}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v)}
      >
        <BaseSlider.Control className="ui-slider-control">
          <BaseSlider.Track className="ui-slider-track">
            <BaseSlider.Indicator className="ui-slider-indicator" />
            <BaseSlider.Thumb className="ui-slider-thumb" />
          </BaseSlider.Track>
        </BaseSlider.Control>
      </BaseSlider.Root>
      {hint && <p className="graph-slider-hint">{hint}</p>}
    </div>
  );
}
