import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db, bpInvoice } from "@/lib/db";

// Real Stripe — confirm a succeeded PaymentIntent and mark the bp_invoice PAID.
export async function POST(req: NextRequest) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return NextResponse.json({ success: false, error: "Stripe not configured" }, { status: 400 });
  const { paymentIntentId } = await req.json();
  if (!paymentIntentId) return NextResponse.json({ success: false, error: "paymentIntentId required" }, { status: 400 });

  try {
    const stripe = new Stripe(key);
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (intent.status !== "succeeded") {
      return NextResponse.json({ success: false, error: `Payment not completed (${intent.status})` }, { status: 400 });
    }
    const invId = Number(intent.metadata?.invoice_id);
    if (invId) {
      db.update(bpInvoice).set({
        status: "PAID", paidAt: new Date().toISOString(), paymentMethod: "stripe", paymentReference: paymentIntentId,
      }).where(eq(bpInvoice.id, invId)).run();
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Stripe error" }, { status: 500 });
  }
}
