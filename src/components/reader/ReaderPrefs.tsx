// The reader's "Aa" reading-preferences popover: text size, measure width,
// line spacing, font (sans/serif), and dyslexia-friendly reading aids. Each maps
// to a reader-scoped CSS variable and persists in settings. The keyboard zoom
// (Ctrl/Cmd +/-/0) drives the same text-size value. See
// docs/features/concept-reader.md.

import { Check } from "lucide-react";
import { Popover } from "@base-ui/react/popover";
import { Checkbox } from "@base-ui/react/checkbox";
import { useApp } from "@/store.tsx";
import type { ReaderFont } from "@/types.ts";
import "@/components/baseui.css";
import "./ReaderPrefs.css";

const SIZE_MIN = 0.8;
const SIZE_MAX = 1.6;
const SIZE_STEP = 0.1;

const MEASURES = [
  { label: "Narrow", v: 60 },
  { label: "Default", v: 72 },
  { label: "Wide", v: 88 },
];
const LEADINGS = [
  { label: "Tight", v: 1.5 },
  { label: "Normal", v: 1.7 },
  { label: "Loose", v: 1.9 },
];
const FONTS: { label: string; v: ReaderFont }[] = [
  { label: "Sans", v: "sans" },
  { label: "Serif", v: "serif" },
];

const round1 = (v: number) => Math.round(v * 10) / 10;

export function ReaderPrefs() {
  const { state, actions } = useApp();
  const s = state.settings;

  return (
    <Popover.Root>
      <Popover.Trigger
        render={
          <button type="button" className="btn ghost reader-prefs-btn" aria-label="Reading preferences">
            <span aria-hidden="true">Aa</span>
          </button>
        }
      />
      <Popover.Portal>
        <Popover.Positioner
          className="ui-popover-positioner"
          side="bottom"
          align="end"
          sideOffset={6}
        >
          <Popover.Popup
            className="ui-popover prefs-popup"
            aria-label="Reading preferences"
          >
            <div className="prefs-row">
              <span className="prefs-label">Text size</span>
              <div className="prefs-stepper">
                <button
                  type="button"
                  className="prefs-step"
                  aria-label="Smaller text"
                  onClick={() =>
                    actions.updateSettings({
                      readerScale: round1(Math.max(SIZE_MIN, s.readerScale - SIZE_STEP)),
                    })
                  }
                >
                  A−
                </button>
                <span className="prefs-value">{Math.round(s.readerScale * 100)}%</span>
                <button
                  type="button"
                  className="prefs-step"
                  aria-label="Larger text"
                  onClick={() =>
                    actions.updateSettings({
                      readerScale: round1(Math.min(SIZE_MAX, s.readerScale + SIZE_STEP)),
                    })
                  }
                >
                  A+
                </button>
              </div>
            </div>

            <Seg
              label="Width"
              value={s.readerMeasure}
              options={MEASURES}
              onChange={(v) => actions.updateSettings({ readerMeasure: v })}
            />
            <Seg
              label="Line spacing"
              value={s.readerLeading}
              options={LEADINGS}
              onChange={(v) => actions.updateSettings({ readerLeading: v })}
            />
            <Seg
              label="Font"
              value={s.readerFont}
              options={FONTS}
              onChange={(v) => actions.updateSettings({ readerFont: v })}
            />

            <label className="prefs-row prefs-check">
              <Checkbox.Root
                className="ui-checkbox"
                checked={s.readerAids}
                onCheckedChange={(checked) =>
                  actions.updateSettings({ readerAids: checked })
                }
              >
                <Checkbox.Indicator
                  className="ui-checkbox-indicator"
                  aria-hidden="true"
                >
                  <Check size={13} />
                </Checkbox.Indicator>
              </Checkbox.Root>
              <span className="prefs-label">Reading aids</span>
            </label>

            <button
              type="button"
              className="prefs-reset"
              onClick={() =>
                actions.updateSettings({
                  readerScale: 1,
                  readerMeasure: 72,
                  readerLeading: 1.7,
                  readerFont: "sans",
                  readerAids: false,
                })
              }
            >
              Reset reading
            </button>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** A small segmented control bound to a settings value. */
function Seg<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { label: string; v: T }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="prefs-row">
      <span className="prefs-label">{label}</span>
      <div className="prefs-seg" role="group" aria-label={label}>
        {options.map((o) => (
          <button
            key={String(o.v)}
            type="button"
            className={`prefs-seg-btn${value === o.v ? " is-active" : ""}`}
            aria-pressed={value === o.v}
            onClick={() => onChange(o.v)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
