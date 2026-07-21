import { eq } from "drizzle-orm";
import { db, bpInvoice, bpCustomer, bpInvoiceLine } from "@/lib/db";
import { PayCard } from "@/components/billing/PayCard";

// PUBLIC (allowed through middleware) — unauthenticated pay via the invoice's pay token.
export default async function TokenPayPage({ searchParams }: { searchParams: Promise<{ token?: string; paid?: string }> }) {
  const { token, paid } = await searchParams;
  const inv = token ? db.select().from(bpInvoice).where(eq(bpInvoice.payToken, token)).all()[0] : undefined;

  if (!inv) {
    return (
      <div className="max-w-md mx-auto pt-10 p-4">
        <div className="alert alert-soft alert-error">Invalid or expired payment link.</div>
      </div>
    );
  }

  // Same two lookups the invoice detail page makes — PayCard renders the real invoice document.
  const customer = db.select().from(bpCustomer).where(eq(bpCustomer.id, inv.customerId)).all()[0];
  const lines = db.select().from(bpInvoiceLine).where(eq(bpInvoiceLine.invoiceId, inv.id)).all();

  const done = paid === "1" || inv.status === "PAID";
  return (
    <PayCard invoice={inv} customer={customer} lines={lines}
             action="/api/pay" hidden={{ name: "token", value: token! }} done={done} />
  );
}
