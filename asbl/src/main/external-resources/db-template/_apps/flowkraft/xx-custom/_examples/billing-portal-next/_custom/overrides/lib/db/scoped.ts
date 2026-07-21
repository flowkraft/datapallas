import { and, eq } from "drizzle-orm";
import { db, bpInvoice, bpCustomer, bpInvoiceLine } from "./index";
import type { Session } from "../session";

/**
 * Capability-scoped reads. EVERY read of invoice data that is not the admin area goes through here,
 * so "only what this viewer is allowed to see" is the default rather than something each page has to
 * remember. A page that forgets is the whole bug class this module exists to remove.
 *
 * The rule, in one line: you may read an invoice if you OWN it (session) or you HOLD its pay token.
 *
 * Two capabilities, deliberately — paying without signing in is a feature, not a hole:
 *
 *   session  — the signed cookie says which customer you are (lib/session.ts). Only trustworthy
 *              because it is signed; while it was plain base64 JSON, every filter below would have
 *              faithfully returned whatever customerId the visitor typed into their own cookie.
 *   token    — the unguessable per-invoice pay_token from the emailed link. It IS the authorization,
 *              exactly like a PayPal checkout URL: whoever holds it may see and settle that ONE
 *              invoice, and nothing else. An accountant paying on a colleague's behalf has no
 *              account and needs none.
 *
 * Note what the scoping does NOT cover: writes. A filter narrows a SELECT; deleteInvoice(id) and
 * markInvoicePaid(id) never read a list for it to narrow. Those assert for themselves — see
 * requireAdmin() in lib/actions.ts and the ownership check in app/api/pay/route.ts.
 *
 * Drizzle cannot do this implicitly and neither can SQLite: Drizzle is a query builder with no
 * interception hook, and row-level security is a Postgres feature. So the scoping is an explicit
 * accessor instead of ambient magic — which is also what keeps it honest against the Grails twin,
 * where PortalInvoiceController.ownInvoice() is the same idea written the same way. Hibernate could
 * have hidden it in a @FilterDef; then the two stacks would no longer mirror.
 */

/** Every invoice this session may see — empty for a visitor with no session, or for the admin
 *  (whose customerId is null: they read the ADMIN area, never a customer's portal). */
export function invoicesForSession(s: Session | null) {
  if (!s?.customerId) return [];
  return db.select().from(bpInvoice).where(eq(bpInvoice.customerId, s.customerId)).all();
}

/** The session's own customer record, or null. */
export function customerForSession(s: Session | null) {
  if (!s?.customerId) return null;
  return db.select().from(bpCustomer).where(eq(bpCustomer.id, s.customerId)).all()[0] ?? null;
}

/**
 * ONE invoice, but only if this session owns it — the mirror of Grails' ownInvoice().
 *
 * The ownership test is pushed into the WHERE clause rather than fetched-then-compared, so a row
 * that is not yours never reaches the caller to be leaked by accident. `and(id, customerId)` also
 * means a null customerId (the admin, or a forged-blank session) matches nothing, instead of
 * matching every invoice whose customer is null.
 */
export function invoiceForSession(id: number, s: Session | null) {
  if (!s?.customerId || !Number.isFinite(id)) return null;
  return db.select().from(bpInvoice)
    .where(and(eq(bpInvoice.id, id), eq(bpInvoice.customerId, s.customerId))).all()[0] ?? null;
}

/** ONE invoice by its pay token — the capability the emailed link carries. No session needed. */
export function invoiceByToken(token: string) {
  if (!token) return null;
  return db.select().from(bpInvoice).where(eq(bpInvoice.payToken, token)).all()[0] ?? null;
}

/** The document parts for an invoice ALREADY authorized by one of the accessors above. */
export function invoiceDocumentParts(inv: { id: number; customerId: number }) {
  return {
    customer: db.select().from(bpCustomer).where(eq(bpCustomer.id, inv.customerId)).all()[0],
    lines: db.select().from(bpInvoiceLine).where(eq(bpInvoiceLine.invoiceId, inv.id)).all(),
  };
}
