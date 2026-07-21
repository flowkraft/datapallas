import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db, bpCustomer, bpAppUser, bpInvoice, bpInvoiceLine } from "@/lib/db";
import { hashPassword } from "@/lib/crypto";

// REST API — POST /api/invoices. DataPallas pushes each invoice here (the settings.xml curl push).
// Idempotent create-or-update: upsert customer by email, ensure a CUSTOMER login (never recreated),
// upsert invoice by number + replace its lines. Same contract as the Grails ApiInvoiceController
// (see ../billing-portal-grails/_custom/README.md §"What this app is made of").
export async function POST(req: NextRequest) {
  const key = req.headers.get("x-api-key");
  const expected = process.env.BP_API_KEY || "bp-demo-key-CHANGE-ME";
  if (!key || key !== expected) {
    return NextResponse.json({ error: "invalid or missing X-Api-Key" }, { status: 401 });
  }

  const body = await req.json();
  if (!body?.invoice_number || !body?.customer?.email) {
    return NextResponse.json({ error: "invoice_number and customer.email are required" }, { status: 400 });
  }

  // 1) upsert customer by email
  let cust = db.select().from(bpCustomer).where(eq(bpCustomer.email, body.customer.email)).all()[0];
  if (!cust) {
    const r = db.insert(bpCustomer).values({
      name: body.customer.name || body.customer.email, contactName: body.customer.contact_name,
      email: body.customer.email, address: body.customer.address,
      city: body.customer.city, country: body.customer.country,
    }).run();
    cust = db.select().from(bpCustomer).where(eq(bpCustomer.id, Number(r.lastInsertRowid))).all()[0];
  } else {
    db.update(bpCustomer).set({
      name: body.customer.name || cust.name, contactName: body.customer.contact_name,
      address: body.customer.address, city: body.customer.city, country: body.customer.country,
    }).where(eq(bpCustomer.id, cust.id)).run();
  }

  // 2) ensure a CUSTOMER login — idempotent, never recreated
  if (db.select().from(bpAppUser).where(eq(bpAppUser.username, cust.email)).all().length === 0) {
    db.insert(bpAppUser).values({
      username: cust.email, passwordHash: hashPassword("changeme"), role: "CUSTOMER", customerId: cust.id,
    }).run();
  }

  // 3) upsert invoice by number + replace lines
  const existing = db.select().from(bpInvoice).where(eq(bpInvoice.invoiceNumber, body.invoice_number)).all()[0];
  const vals = {
    invoiceNumber: body.invoice_number, customerId: cust.id,
    invoiceDate: body.invoice_date, dueDate: body.due_date,
    status: (String(body.status || "DUE").toUpperCase()) as "PAID" | "DUE" | "OVERDUE",
    subtotal: Number(body.subtotal || 0), tax: Number(body.tax || 0),
    freight: Number(body.freight || 0), total: Number(body.total || 0),
    notes: body.notes ?? null,
    // Honour a pushed pay token so the "Pay this invoice" link DataPallas emailed addresses this
    // very row. Falls back to a generated one when the push omits it (hand-made invoices, other
    // clients), and never blanks an existing token. Mirrors ApiInvoiceController.groovy.
    payToken: body.pay_token ?? existing?.payToken ?? randomUUID(),
  };
  let invId: number;
  if (existing) {
    db.update(bpInvoice).set(vals).where(eq(bpInvoice.id, existing.id)).run();
    invId = existing.id;
    db.delete(bpInvoiceLine).where(eq(bpInvoiceLine.invoiceId, invId)).run();
  } else {
    const r = db.insert(bpInvoice).values(vals).run();
    invId = Number(r.lastInsertRowid);
  }
  for (const l of body.lines || []) {
    const q = Number(l.qty || 0), up = Number(l.unit_price || 0), d = Number(l.discount || 0);
    db.insert(bpInvoiceLine).values({
      invoiceId: invId, productName: l.product_name, category: l.category ?? null,
      qty: q, unitPrice: up, discount: d, lineTotal: q * up * (1 - d),
    }).run();
  }

  return NextResponse.json({ ok: true, invoice: body.invoice_number });
}
