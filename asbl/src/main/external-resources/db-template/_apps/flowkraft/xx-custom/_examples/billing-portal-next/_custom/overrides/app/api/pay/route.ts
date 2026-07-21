import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, bpInvoice } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { invoiceByToken, invoiceForSession } from "@/lib/db/scoped";
import { redirectTo } from "@/lib/http";

/**
 * Demo "pay" — a simulated settle. Two ways in, each with its OWN authorization; neither is open.
 * The 1:1 mirror of the Grails twin, where they are two actions: pay(Long id) → ownInvoice(), and
 * payByToken() → the token.
 *
 *   token — the emailed link. NO session required, by design: paying without signing in is a
 *           feature, exactly like a PayPal checkout URL. The token is the capability — unguessable
 *           and good for that ONE invoice.
 *   id    — the signed-in customer settling from their own account, so it needs the session AND
 *           ownership. This branch used to take the id and settle it with no check whatsoever, so an
 *           anonymous `curl -d id=3` marked invoice 3 paid, and walking id=1..N settled the ledger.
 *           /api is not in the middleware matcher, so nothing else was guarding it either.
 *
 * Note that closing the id branch costs no functionality: the unauthenticated path is the token, and
 * it is untouched.
 *
 * Both branches go through lib/db/scoped, so the row is fetched with the authorization already in
 * the WHERE clause — an invoice that is not yours never reaches this code to be leaked or mutated.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const id = Number(form.get("id") || 0);
  const token = String(form.get("token") || "");

  const inv = token ? invoiceByToken(token) : invoiceForSession(id, await getSession());

  // One answer for "no such invoice" and for "not yours", so this cannot be used to discover which
  // ids exist. The redirect targets are guarded pages anyway, so nothing about the invoice leaks here.
  if (!inv) return redirectTo(req, token ? "/login" : "/portal/invoices");

  if (inv.status !== "PAID") {
    db.update(bpInvoice).set({
      status: "PAID", paidAt: new Date().toISOString(), paymentMethod: "demo",
      paymentReference: "SIM-" + Date.now(),
    }).where(eq(bpInvoice.id, inv.id)).run();
  }

  const back = token ? `/portal/pay?token=${encodeURIComponent(token)}&paid=1` : `/portal/invoices/${inv.id}`;
  return redirectTo(req, back);
}
