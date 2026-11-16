import { matchesSite, type SiteProfile } from "./settings";
export interface ApprovalIntent {
  id: string;
  origin: string;
  subdomains: boolean;
  settings: SiteProfile["settings"];
  created: number;
  cancelled?: boolean;
}
export interface ApprovalRequest {
  type: "webscaly:approve";
  origin: string;
  subdomains: boolean;
  settings: SiteProfile["settings"];
}
export function permissionCovers(pattern: string, url: string): boolean {
  try {
    const match = /^(\*|https?|file):\/\/(\*\.)?([^/]+)\//.exec(pattern);
    if (!match) return false;
    const u = new URL(url);
    return (
      (match[1] === "*" || u.protocol === match[1] + ":") &&
      (match[3] === "*" ||
        u.hostname === match[3] ||
        (!!match[2] && u.hostname.endsWith("." + match[3])))
    );
  } catch {
    return false;
  }
}
/**
 * Whether a "webscaly:invalidate" message applies to a frame of `origin`. Unscoped messages (and any message
 * that cannot be read) apply everywhere, so a frame fails closed. A scoped one applies when the frame's tab
 * lost access to its top-level page (`all`) or when a revoked scope covers the frame's own origin.
 */
export function invalidates(message: { scopes?: unknown; all?: unknown }, origin: string): boolean {
  if (message.all === true || !Array.isArray(message.scopes)) return true;
  return message.scopes.some((p) => typeof p !== "string" || revokes(p, origin));
}
/**
 * Whether revoking `pattern` affects `url`. Unlike permissionCovers, a pattern it cannot interpret
 * (`<all_urls>`, a port, `file:`) counts as covering everything: this decides what to stop, so it fails closed.
 */
export function revokes(pattern: string, url: string): boolean {
  return !/^(\*|https?):\/\/(\*\.)?[^/:]+\//.test(pattern) || permissionCovers(pattern, url);
}
export function coveringProfiles(origin: string, sites: SiteProfile[]) {
  return sites.filter((site) => matchesSite(origin, site));
}
