// A visual-consistency audit that runs after every story.
//
// There are 297 stories. Reviewing them by screenshot does not scale, and the
// defects worth catching here are measurable rather than matters of taste:
// spacing that is not on the scale, prose with no reading measure, repeated rows
// that do not agree on their height, a hit target too small to hit, and content
// wider than the box holding it. Each check reports an element and a number, so
// a finding is a fact rather than an opinion.
//
// Scoped by story title so it can be adopted an area at a time instead of
// landing 297 failures at once.

/** px values the spacing scale defines, plus the hairlines used deliberately. */
const SCALE = new Set([0, 1, 2, 3, 4, 6, 8, 10, 12, 16, 20, 24, 32, 40]);

/** Story titles this audit is enforced for. */
const ENFORCED = [/^Agent\//];

const SPACING_PROPS = [
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "rowGap",
  "columnGap",
] as const;

export interface Finding {
  check: string;
  detail: string;
}

/** Visually hidden by design: 1×1, clipped, and never laid out for a reader. */
function isScreenReaderOnly(el: Element): boolean {
  return el.closest(".sr-only") !== null;
}

/** Enough to find the element in the source: its own class if it has one, and
 *  otherwise the nearest classed ancestor, since a bare `p` is unlocatable. */
function describe(el: Element): string {
  const own = typeof el.className === "string" ? el.className.trim().split(/\s+/)[0] : "";
  const tag = el.tagName.toLowerCase();
  if (own) return `${tag}.${own}`;
  for (let node = el.parentElement; node; node = node.parentElement) {
    const cls = typeof node.className === "string" ? node.className.trim().split(/\s+/)[0] : "";
    if (cls) return `${cls} > ${tag}`;
  }
  return tag;
}

/** Spacing that is not a scale step. Off-scale values are how a layout drifts. */
function offScaleSpacing(root: Element): Finding[] {
  const out: Finding[] = [];
  for (const el of root.querySelectorAll<HTMLElement>("*")) {
    if (isScreenReaderOnly(el)) continue;
    // <option> and the select internals carry Chromium's own gap (0.4375em,
    // which lands on 7px), not a value from this codebase.
    if (el.tagName === "OPTION" || el.tagName === "OPTGROUP") continue;
    const cs = getComputedStyle(el);
    for (const prop of SPACING_PROPS) {
      const raw = cs[prop];
      if (!raw.endsWith("px")) continue; // %, em, and normal are the caller's call
      const px = Number.parseFloat(raw);
      if (Number.isNaN(px) || SCALE.has(Math.round(px))) continue;
      // Sub-pixel values come from layout rounding, not from a declaration.
      if (Math.abs(px - Math.round(px)) > 0.01) continue;
      out.push({ check: "off-scale spacing", detail: `${describe(el)} ${prop}: ${raw}` });
    }
  }
  return out;
}

/** A paragraph with no measure runs as wide as its container allows. */
function unboundedProse(root: Element): Finding[] {
  const out: Finding[] = [];
  for (const el of root.querySelectorAll<HTMLElement>("p, li, dd")) {
    if (isScreenReaderOnly(el)) continue;
    if (el.querySelector("*") && el.textContent!.trim().length < 80) continue;
    const text = el.textContent?.trim() ?? "";
    if (text.length < 90) continue; // too short to need a measure
    const cs = getComputedStyle(el);
    const ch = Number.parseFloat(cs.fontSize) * 0.5; // ≈ one character
    const widthInCh = el.getBoundingClientRect().width / ch;
    if (widthInCh > 95) {
      out.push({
        check: "prose with no measure",
        detail: `${describe(el)} is ${Math.round(widthInCh)}ch wide`,
      });
    }
  }
  return out;
}

/** Repeated rows that disagree on height read as a ragged list. */
function unevenSiblings(root: Element): Finding[] {
  const out: Finding[] = [];
  for (const parent of root.querySelectorAll<HTMLElement>("*")) {
    const kids = [...parent.children] as HTMLElement[];
    if (kids.length < 3 || isScreenReaderOnly(parent)) continue;
    const cls = kids[0].className;
    if (typeof cls !== "string" || !cls) continue;
    if (!kids.every((k) => k.className === cls)) continue;
    // Rows whose own content legitimately varies in height are exempt.
    if (kids.some((k) => k.querySelector("img, textarea, pre, svg"))) continue;
    const heights = kids.map((k) => Math.round(k.getBoundingClientRect().height));
    const spread = Math.max(...heights) - Math.min(...heights);
    // Only flag single-line rows: a row that wraps is meant to be taller.
    const lineHeight = Number.parseFloat(getComputedStyle(kids[0]).lineHeight) || 20;
    if (spread > 2 && Math.max(...heights) < lineHeight * 2.6) {
      out.push({
        check: "uneven repeated rows",
        detail: `${kids.length}× ${describe(kids[0])} heights ${Math.min(...heights)}–${Math.max(...heights)}px`,
      });
    }
  }
  return out;
}

/** A control smaller than 24px is hard to hit and fails the project's floor. */
function smallHitTargets(root: Element): Finding[] {
  const out: Finding[] = [];
  const seen = new Set<string>();
  for (const el of root.querySelectorAll<HTMLElement>(
    'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])',
  )) {
    if (isScreenReaderOnly(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue; // not rendered
    if (getComputedStyle(el).display === "contents") continue;
    // A splitter's hit area is a widened pseudo-element, so its own box is a
    // hairline by design (see .pane-divider::before).
    if (el.getAttribute("role") === "separator") continue;
    const small = Math.min(r.width, r.height);
    if (small >= 24) continue;
    const key = `${describe(el)}:${Math.round(r.width)}x${Math.round(r.height)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      check: "hit target under 24px",
      detail: `${describe(el)} is ${Math.round(r.width)}×${Math.round(r.height)}px`,
    });
  }
  return out;
}

/** Content wider than the box holding it, with no way to reach the overflow. */
function horizontalOverflow(root: Element): Finding[] {
  const out: Finding[] = [];
  for (const el of root.querySelectorAll<HTMLElement>("*")) {
    if (isScreenReaderOnly(el)) continue;
    if (el.scrollWidth <= el.clientWidth + 1) continue;
    const cs = getComputedStyle(el);
    if (cs.overflowX !== "hidden" && cs.overflowX !== "clip") continue;
    if (cs.textOverflow === "ellipsis") continue; // deliberate truncation
    out.push({
      check: "content clipped with no affordance",
      detail: `${describe(el)} overflows by ${el.scrollWidth - el.clientWidth}px`,
    });
  }
  return out;
}

/** Run every check over a story's rendered root. */
export function auditVisualConsistency(root: Element): Finding[] {
  return [
    ...offScaleSpacing(root),
    ...unboundedProse(root),
    ...unevenSiblings(root),
    ...smallHitTargets(root),
    ...horizontalOverflow(root),
  ];
}

export function isEnforced(title: string): boolean {
  return ENFORCED.some((re) => re.test(title));
}

/** Group findings into one readable failure message. */
export function formatFindings(findings: readonly Finding[]): string {
  const byCheck = new Map<string, string[]>();
  for (const f of findings) {
    const list = byCheck.get(f.check) ?? [];
    list.push(f.detail);
    byCheck.set(f.check, list);
  }
  return [...byCheck]
    .map(([check, details]) => {
      const unique = [...new Set(details)];
      const shown = unique.slice(0, 6);
      const more = unique.length > shown.length ? `\n      …and ${unique.length - shown.length} more` : "";
      return `  ${check} (${unique.length}):\n${shown.map((d) => `      ${d}`).join("\n")}${more}`;
    })
    .join("\n");
}
