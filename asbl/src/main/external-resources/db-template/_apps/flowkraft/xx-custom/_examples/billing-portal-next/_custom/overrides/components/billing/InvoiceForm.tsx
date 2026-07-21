import { CustomerPicker } from "./CustomerPicker";

interface FormInv {
  invoiceNumber?: string; customerId?: number | null; status?: string;
  invoiceDate?: string; dueDate?: string; subtotal?: number; tax?: number; freight?: number;
}

// Header-level invoice form fields (line items arrive via the DataPallas push) — mirrors _form.gsp.
//
// Layout: every field is `flex flex-col` (label above its control) and every control is `w-full`, so
// all inputs share one left edge and one width inside the 2-column grid.
// Do NOT reach for daisyUI's `form-control` / `label-text` here: this app is on daisyUI 5, which
// REMOVED both. With no rule behind it, `form-control` stops being a flex column, each label falls
// back to inline, and the caption sits BESIDE its input — pushing every input to a different x, since
// each caption is a different width. `input-bordered` / `select-bordered` are gone too (v5 inputs are
// bordered by default).
export function InvoiceForm({ invoice = {}, customerName = "" }: { invoice?: FormInv; customerName?: string }) {
  return (
    <>
      <div className="grid sm:grid-cols-2 gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Invoice number</span>
          <input id="invoice-number" name="invoiceNumber" type="text" required className="input w-full" defaultValue={invoice.invoiceNumber ?? ""} placeholder="INV-2026-0001" />
        </label>
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">Customer</span>
          <CustomerPicker initialId={invoice.customerId ?? null} initialName={customerName} />
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Status</span>
          <select id="invoice-status-select" name="status" className="select w-full" defaultValue={invoice.status ?? "DUE"}>
            {["DUE", "PAID", "OVERDUE"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <div />
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Invoice date</span>
          <input id="invoice-date" name="invoiceDate" type="date" className="input w-full" defaultValue={invoice.invoiceDate ?? ""} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Due date</span>
          <input id="due-date" name="dueDate" type="date" className="input w-full" defaultValue={invoice.dueDate ?? ""} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Subtotal</span>
          <input name="subtotal" type="number" step="0.01" min="0" className="input w-full" defaultValue={invoice.subtotal ?? 0} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Tax</span>
          <input name="tax" type="number" step="0.01" min="0" className="input w-full" defaultValue={invoice.tax ?? 0} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Freight</span>
          <input name="freight" type="number" step="0.01" min="0" className="input w-full" defaultValue={invoice.freight ?? 0} />
        </label>
      </div>
      <p className="text-xs text-base-content/50 mt-2">Total is computed as subtotal + tax + freight. Line items are populated by the DataPallas push.</p>
    </>
  );
}
