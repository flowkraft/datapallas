// Share links for a published dashboard.
//
// A share link lets someone WITHOUT a DataPallas account open one dashboard. It is long-lived on
// purpose — a person pastes it into an email — so its protection is unguessability plus the ability
// to revoke, not a short expiry. The server stores only a hash, which is why an existing link can
// never be shown again: it is displayed once at creation, and otherwise reissued.
//
// Calls go through this app's server-side proxy — see app/api/dp/[...path]/route.ts.

const RB_BASE = "/api/dp";

export interface ShareLink {
  id: number;
  reportId: string;
  /** null when the link never expires and can only be revoked. */
  expiresAt: string | null;
  createdAt: string;
}

export async function listShareLinks(reportId: string): Promise<ShareLink[]> {
  const res = await fetch(`${RB_BASE}/embed/share-link?reportId=${encodeURIComponent(reportId)}`);
  if (!res.ok) throw new Error("Could not load the share links");
  return res.json();
}

/**
 * Create a link. The returned URL contains the token and is the ONLY time it is available.
 *
 * @param expiresInDays omit for a link that never expires on its own
 */
export async function createShareLink(
  reportId: string,
  expiresInDays?: number,
): Promise<{ url: string }> {
  const res = await fetch(`${RB_BASE}/embed/share-link`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reportId, expiresInDays }),
  });
  if (!res.ok) throw new Error("Could not create the share link");
  return res.json();
}

export async function revokeShareLink(id: number): Promise<void> {
  const res = await fetch(`${RB_BASE}/embed/share-link/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Could not revoke the share link");
}

/** Share links are relative to the DataPallas server, not to this app. */
export function absoluteShareUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `${window.location.protocol}//${window.location.hostname}:9090${url}`;
}
