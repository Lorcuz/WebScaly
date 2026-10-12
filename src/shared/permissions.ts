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
export function coveringProfiles(origin: string, sites: SiteProfile[]) {
  return sites.filter((site) => matchesSite(origin, site));
}
