import type { AgentToolLocationInfo } from "@/features/agent/connection.ts";

/**
 * Resolve one host-reduced tool location to an existing bundle concept.
 *
 * Rust owns the stronger filesystem boundary. This frontend check deliberately
 * accepts only the exact bundle-relative Markdown form already used by concept
 * IDs, so rendering a location can never become a general file-opening path.
 */
export function conceptIdForToolLocation(
  location: AgentToolLocationInfo,
  conceptIds: readonly string[],
): string | null {
  const path = location.path;
  if (
    path.length === 0 ||
    path !== path.trim() ||
    path.includes("\\") ||
    path.startsWith("/") ||
    /^[A-Za-z]:/.test(path) ||
    !path.endsWith(".md")
  ) {
    return null;
  }

  const segments = path.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    return null;
  }

  const conceptId = path.slice(0, -3);
  return conceptIds.includes(conceptId) ? conceptId : null;
}
