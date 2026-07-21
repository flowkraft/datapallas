import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db, bpInvoice } from "@/lib/db";

// Real Stripe — create a PaymentIntent for a bp_invoice. Only live when STRIPE_SECRET_KEY is set.
export async function POST(req: NextRequest) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key === "sk_test_placeholder") {
    return NextResponse.json({ success: false, error: "Stripe not configured" }, { status: 400 });
  }
  const { invoiceId } = await req.json();
  const inv = db.select().from(bpInvoice).where(eq(bpInvoice.id, Number(invoiceId))).all()[0];
  if (!inv) return NextResponse.json({ success: false, error: "Invoice not found" }, { status: 404 });
  if (inv.status === "PAID") return NextResponse.json({ success: false, error: "Invoice already paid" }, { status: 400 });

  try {
    const stripe = new Stripe(key);
    const intent = await stripe.paymentIntents.create({
      amount: Math.round((inv.total || 0) * 100),
      currency: "usd",
      automatic_payment_methods: { enabled: true },
      metadata: { invoice_id: String(inv.id), invoice_number: inv.invoiceNumber },
      description: `Payment for Invoice ${inv.invoiceNumber}`,
    });
    return NextResponse.json({ success: true, clientSecret: intent.client_secret, paymentIntentId: intent.id });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Stripe error" }, { status: 500 });
  }
}
