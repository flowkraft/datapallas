import Link from "next/link";
import { createInvoice } from "@/lib/actions";
import { InvoiceForm } from "@/components/billing/InvoiceForm";

export default function NewInvoicePage() {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">New invoice</h1>
        <Link href="/admin/invoices" className="btn btn-ghost btn-sm">Cancel</Link>
      </div>
      <div className="card bg-base-100 border border-base-300">
        <div className="card-body">
          <form action={createInvoice}>
            <InvoiceForm />
            <div className="flex justify-end gap-2 mt-4">
              <Link href="/admin/invoices" className="btn btn-ghost">Cancel</Link>
              <button id="btn-save-invoice" type="submit" className="btn btn-primary">Create invoice</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
