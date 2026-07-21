import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, bpInvoice } from "@/lib/db";

const PAYPAL_API_BASE = process.env.PAYPAL_SANDBOX === "true"
  ? "https://api-m.sandbox.paypal.com"
  : "https://api-m.paypal.com";

async function accessToken(): Promise<string> {
  const id = process.env.PAYPAL_CLIENT_ID || process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new Error("PayPal credentials not configured");
  const auth = Buffer.from(`${id}:${secret}`).toString("base64");
  const r = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${auth}` },
    body: "grant_type=client_credentials",
  });
  if (!r.ok) throw new Error("Failed to authenticate with PayPal");
  return (await r.json()).access_token;
}

export async function POST(req: NextRequest) {
  try {
    const { orderId, invoiceId } = await req.json();
    if (!orderId || !invoiceId) return NextResponse.json({ error: "orderId and invoiceId required" }, { status: 400 });

    const at = await accessToken();
    const r = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders/${orderId}/capture`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${at}` },
    });
    if (!r.ok) throw new Error((await r.json()).message || "Failed to capture PayPal payment");
    const capture = await r.json();
    if (capture.status !== "COMPLETED") {
      return NextResponse.json({ error: `Payment not completed (${capture.status})` }, { status: 400 });
    }
    const captureId = capture.purchase_units?.[0]?.payments?.captures?.[0]?.id;
    db.update(bpInvoice).set({
      status: "PAID", paidAt: new Date().toISOString(), paymentMethod: "paypal", paymentReference: captureId || orderId,
    }).where(eq(bpInvoice.id, Number(invoiceId))).run();

    return NextResponse.json({ success: true, captureId });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to capture payment" }, { status: 500 });
  }
}
