// Share links for a published dashboard.
//
// A share link lets someone WITHOUT a DataPallas account open one dashboard. It is long-lived on
// purpose — a person pastes it into an email — so its protection is unguessability plus the ability
// to revoke, not a short expiry. The server stores only a hash, which is why an existing link can
// never be shown again: it is displayed once at creation, and otherwise reissued.
//
// Calls go through this app's server-side proxy — see app/api/dp/[...path]/route.ts.

const RB_BASE = "/api/dp";

/**
 * The values a link forces on every data request made with it.
 *
 * A single value for an ordinary parameter, a list for a multi-value one. Empty/absent means the
 * link shows the whole report.
 */
export type LockedParams = { [name: string]: string | string[] };

/**
 * What the link says its recipient IS — the attribute bag behind `${dp_attr_<name>}`.
 *
 * Not a lock: it names no parameter the report declares, the viewer never sees it, and any widget's
 * SQL can filter on it (`WHERE customer_id = ${dp_attr_customer_id}`). Names are lower-case
 * letters, digits and `_`, starting with a letter — the server refuses anything else, because a
 * name that cannot be written as `${dp_attr_…}` is a filter that would silently never apply.
 */
export type CallerAttributes = { [name: string]: string };

export interface ShareLink {
  id: number;
  reportId: string;
  /** null when the link never expires and can only be revoked. */
  expiresAt: string | null;
  createdAt: string;
  /** Fixed for the life of the link — to change them, create a new link and revoke this one. */
  lockedParams?: LockedParams;
  /** Who the recipient is, on the same terms. */
  attributes?: CallerAttributes;
}

/**
 * One parameter as the report declares it in `<report>-report-parameters-spec.groovy`.
 *
 * Passed through to <rb-parameters> untouched, so the lock value is chosen with exactly the control
 * the viewer would get (the same select options, date picker, number box, multi-select).
 */
export interface ReportParameter {
  id: string;
  type?: string;
  label?: string;
  description?: string;
  defaultValue?: unknown;
  constraints?: { [k: string]: unknown };
  uiHints?: { [k: string]: unknown };
}

export async function listShareLinks(reportId: string): Promise<ShareLink[]> {
  const res = await fetch(`${RB_BASE}/embed/share-link?reportId=${encodeURIComponent(reportId)}`);
  if (!res.ok) throw new Error("Could not load the share links");
  return res.json();
}

/** The parameters this report declares — the only things a link can lock. */
export async function fetchReportParameters(reportId: string): Promise<ReportParameter[]> {
  const res = await fetch(`${RB_BASE}/reports/${encodeURIComponent(reportId)}/config`);
  if (!res.ok) throw new Error("Could not load the report's parameters");
  const config = await res.json();
  return Array.isArray(config?.parameters) ? config.parameters : [];
}

/**
 * Create a link. The returned URL contains the token and is the ONLY time it is available.
 *
 * @param expiresInDays omit for a link that never expires on its own
 * @param lockedParams  values forced on every request made with this link; omit for none
 * @param attributes    who the recipient is, for widgets filtering on `${dp_attr_<name>}`
 */
export async function createShareLink(
  reportId: string,
  expiresInDays?: number,
  lockedParams?: LockedParams,
  attributes?: CallerAttributes,
): Promise<{ url: string }> {
  const res = await fetch(`${RB_BASE}/embed/share-link`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reportId, expiresInDays, lockedParams, attributes }),
  });
  // The server refuses an unknown parameter name or a value its constraints reject, and says which
  // one. That message is the whole point of validating at creation — show it instead of a generic
  // failure the person cannot act on.
  if (!res.ok) throw new Error((await errorMessage(res)) || "Could not create the share link");
  return res.json();
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return typeof body?.error === "string" ? body.error : "";
  } catch {
    return "";
  }
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

/** "customer_id = 4711" — what a link says its recipient is, in the links table. */
export function describeAttributes(attributes?: CallerAttributes): string {
  const entries = Object.entries(attributes ?? {});
  if (entries.length === 0) return "\u2014";
  return entries.map(([name, value]) => `${name} = ${value}`).join(", ");
}

/** "region = EU, year = 2026" — what a link's locks look like in the links table. */
export function describeLocks(lockedParams?: LockedParams): string {
  const entries = Object.entries(lockedParams ?? {});
  if (entries.length === 0) return "—";
  return entries
    .map(([name, value]) => `${name} = ${Array.isArray(value) ? value.join(", ") : value}`)
    .join(", ");
}
