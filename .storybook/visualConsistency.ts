// A visual-consistency audit that runs after every story.
//
// There are 297 stories. Reviewing them by screenshot does not scale, and the
// defects worth catching here are measurable rather than matters of taste:
// spacing that is not on the scale, prose with no reading measure, repeated rows
// that do not agree on their height, a hit target too small to hit, and content
// wider than the box holding it. Each check reports an element and a number, so
// a finding is a fact rather than an opinion.
//
// Enforced for every story. It was scoped to Agent/* while the checks were
// being tuned, so one area could be brought clean before the rest inherited it.

/** px values the spacing scale defines, plus the hairlines used deliberately. */
const SCALE = new Set([0, 1, 2, 3, 4, 6, 8, 10, 12, 16, 20, 24, 32, 40]);

/** Story titles this audit is enforced for. Every area, now that the agent
 *  surfaces are clean and the checks have stopped reporting noise. */
const ENFORCED = [/./];

// Gaps only. Padding is routinely composed with calc() to align to a control
// column — `calc(var(--space-8) + 6rem)` and `calc(24px + var(--space-6))` are
// both deliberate and both land off the scale — and a computed style cannot be
// told apart from a magic number. A gap is almost never composed, so an
// off-scale one there is the real smell.
const SPACING_PROPS = ["rowGap", "columnGap"] as const;

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

/**
 * The box a pointer actually has to hit. For a checkbox or radio that is its
 * label, not the 13px replaced element: clicking the label toggles the control,
 * so the label is the target. Measuring the input alone reported every
 * label-wrapped checkbox in the app as a failure while the real target was
 * comfortably over the floor.
 */
function effectiveTarget(el: HTMLElement): DOMRect {
  const own = el.getBoundingClientRect();
  const tag = el.tagName.toLowerCase();
  const type = el.getAttribute("type");
  const labelled = tag === "input" && (type === "checkbox" || type === "radio");
  if (!labelled) return own;
  const wrapping = el.closest("label");
  const associated = el.id
    ? el.ownerDocument.querySelector<HTMLElement>(`label[for="${el.id}"]`)
    : null;
  const candidates = [wrapping, associated].filter((n): n is HTMLElement => n !== null);
  let best = own;
  for (const node of candidates) {
    const r = node.getBoundingClientRect();
    if (Math.min(r.width, r.height) > Math.min(best.width, best.height)) best = r;
  }
  return best;
}

/**
 * A link inside running text is exempt. WCAG 2.5.8 carves out targets "in a
 * sentence or block of text", because a link's size is its type size and
 * padding it out would break the prose around it.
 */
function isInlineInText(el: HTMLElement): boolean {
  if (el.tagName !== "A") return false;
  const display = getComputedStyle(el).display;
  if (display !== "inline" && display !== "inline-block") return false;
  const parent = el.parentElement;
  if (!parent) return false;
  // Text beyond the link itself means the link sits in a sentence.
  return (parent.textContent ?? "").trim().length > (el.textContent ?? "").trim().length;
}

/** A control smaller than 24px is hard to hit and fails the project's floor. */
function smallHitTargets(root: Element): Finding[] {
  const out: Finding[] = [];
  const seen = new Set<string>();
  for (const el of root.querySelectorAll<HTMLElement>(
    'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])',
  )) {
    if (isScreenReaderOnly(el) || isInlineInText(el)) continue;
    const r = effectiveTarget(el);
    if (r.width === 0 && r.height === 0) continue; // not rendered
    // Base UI puts a 1×1 focus guard at each end of a portal. Nothing designed
    // is two pixels across, so this is a library internal rather than a target.
    if (r.width <= 2 && r.height <= 2) continue;
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
