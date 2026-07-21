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
    const { invoiceId } = await req.json();
    const inv = db.select().from(bpInvoice).where(eq(bpInvoice.id, Number(invoiceId))).all()[0];
    if (!inv) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    if (inv.status === "PAID") return NextResponse.json({ error: "Invoice already paid" }, { status: 400 });

    const at = await accessToken();
    const r = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${at}` },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{
          reference_id: String(inv.id),
          description: `Invoice ${inv.invoiceNumber}`,
          amount: { currency_code: "USD", value: (inv.total || 0).toFixed(2) },
        }],
      }),
    });
    if (!r.ok) throw new Error((await r.json()).message || "Failed to create PayPal order");
    return NextResponse.json({ orderId: (await r.json()).id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to create PayPal order" }, { status: 500 });
  }
}
