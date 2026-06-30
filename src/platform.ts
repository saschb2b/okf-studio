// Platform detection for keyboard-hint display (⌘ vs Ctrl). Guarded for
// non-browser (test) envs. Prefers the modern User-Agent Client Hints
// (`navigator.userAgentData`) and falls back to the user-agent string, avoiding
// the deprecated `navigator.platform`.

interface UADataNavigator {
  userAgentData?: { platform?: string };
}

/** True on macOS / iOS, where shortcut hints use the ⌘ key. */
export const isMac: boolean =
  typeof navigator !== "undefined" &&
  /mac|iphone|ipad|ipod/i.test(
    (navigator as Navigator & UADataNavigator).userAgentData?.platform ??
      navigator.userAgent,
  );

/** The modifier-key label for this platform: "⌘" on macOS/iOS, else "Ctrl". */
export const modKey: string = isMac ? "⌘" : "Ctrl";
