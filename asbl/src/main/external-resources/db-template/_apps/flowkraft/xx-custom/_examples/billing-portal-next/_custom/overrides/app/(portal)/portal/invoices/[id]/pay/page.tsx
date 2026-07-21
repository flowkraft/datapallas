import { getSession } from "@/lib/auth";
import { invoiceForSession, invoiceDocumentParts } from "@/lib/db/scoped";
import { PayCard } from "@/components/billing/PayCard";

export default async function PayInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Scoped read — someone else's invoice is never fetched. Mirrors PortalInvoiceController.pay →
  // ownInvoice(id). /api/pay, which this form posts to, repeats the same check: the page deciding
  // what to show is not what authorizes the POST.
  const inv = invoiceForSession(Number(id), await getSession());

  if (!inv) {
    return (
      <div className="max-w-md mx-auto pt-10 p-4">
        <div id="invoice-not-found" className="alert alert-soft alert-error">Invoice not found.</div>
      </div>
    );
  }

  // Same parts the invoice detail page shows — PayCard renders the real invoice document.
  const { customer, lines } = invoiceDocumentParts(inv);

  return (
    <PayCard
      invoice={inv}
      customer={customer}
      lines={lines}
      action="/api/pay"
      hidden={{ name: "id", value: String(inv.id) }}
      done={inv.status === "PAID"}
      backHref={`/portal/invoices/${inv.id}`}
    />
  );
}
