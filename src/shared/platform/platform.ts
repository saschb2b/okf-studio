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

/** Shift's label: the glyph on macOS, the word everywhere else. Windows and
 *  Linux keyboards print "Shift" on the key, and a bare ⇧ there reads as an
 *  arrow rather than as a modifier. */
export const shiftKey: string = isMac ? "⇧" : "Shift";

/** Alt/Option, same convention. */
export const altKey: string = isMac ? "⌥" : "Alt";

/**
 * True in the Android build, where the shell is one full-screen activity.
 *
 * Everything the borderless desktop window needs (caption buttons, the drag
 * region, the resize handles, the rounded frame) has no meaning there: the
 * system owns the window, and those affordances would only take space and offer
 * dead controls. The Android system webview reports "Android" in its
 * user-agent, and reading it keeps this a zero-dependency check. The
 * alternative is the os plugin, plus a permission, plus an async boot hop.
 *
 * Deliberately not "is a touchscreen": a Windows tablet or a Linux laptop with
 * a touch panel still runs the desktop window and still needs its controls.
 *
 * A function rather than a constant, so it is read when a component renders
 * instead of when this module loads. As a constant, the only way to test either
 * shell was to reset the module registry and re-import the component graph,
 * which took seconds and timed out under a loaded suite.
 */
export function isAndroidShell(): boolean {
  return typeof navigator !== "undefined" && /android/i.test(navigator.userAgent);
}
