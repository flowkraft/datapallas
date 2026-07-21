import Link from "next/link";
import { and, or, like, eq, sql, desc, count, type SQL } from "drizzle-orm";
import { db, bpInvoice, bpCustomer } from "@/lib/db";
import { money, fmtDate, statusBadge } from "@/lib/format";
import { deleteInvoice } from "@/lib/actions";
import { DeleteInvoiceButton, DeleteInvoiceModal } from "@/components/billing/DeleteInvoice";

const PAGE_SIZE = 10;
// Unpaid first (OVERDUE, then DUE), then PAID; newest (by invoice date) first within each.
const statusOrder = sql`case ${bpInvoice.status} when 'OVERDUE' then 0 when 'DUE' then 1 else 2 end`;

export default async function AdminInvoicesPage(
  { searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> },
) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const status = (sp.status ?? "").trim().toUpperCase();

  const filters: (SQL | undefined)[] = [];
  if (q) filters.push(or(like(bpInvoice.invoiceNumber, `%${q}%`), like(bpCustomer.name, `%${q}%`)));
  // The cast is doing what the line's own check cannot: Array.includes() is not a type guard, so
  // `status` stays `string`, while bp_invoice.status is a literal union and drizzle's eq() only
  // accepts that union. The includes() above is what makes the cast true. Same cast as (admin)/page.tsx.
  if (["OVERDUE", "DUE", "PAID"].includes(status))
    filters.push(eq(bpInvoice.status, status as "PAID" | "DUE" | "OVERDUE"));
  const where = filters.length ? and(...filters) : undefined;

  const total =
    db.select({ c: count() }).from(bpInvoice)
      .leftJoin(bpCustomer, eq(bpInvoice.customerId, bpCustomer.id)).where(where).all()[0]?.c ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, parseInt(sp.page ?? "1", 10) || 1), totalPages);

  const invoices = db.select({
      id: bpInvoice.id, invoiceNumber: bpInvoice.invoiceNumber, invoiceDate: bpInvoice.invoiceDate,
      dueDate: bpInvoice.dueDate, status: bpInvoice.status, total: bpInvoice.total, customerName: bpCustomer.name,
    })
    .from(bpInvoice).leftJoin(bpCustomer, eq(bpInvoice.customerId, bpCustomer.id))
    .where(where).orderBy(statusOrder, desc(bpInvoice.invoiceDate))
    .limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE).all();

  const pageLink = (p: number) => {
    const u = new URLSearchParams();
    if (q) u.set("q", q);
    if (status) u.set("status", status);
    u.set("page", String(p));
    return `/admin/invoices?${u.toString()}`;
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div><h1 className="text-2xl font-bold">Invoices</h1><p className="text-base-content/60">{total} invoice(s).</p></div>
        <Link id="btn-new-invoice" href="/admin/invoices/new" className="btn btn-primary btn-sm">New invoice</Link>
      </div>

      {/* Search / filter */}
      <form method="get" className="mb-4">
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex flex-col">
            <span className="text-xs mb-1">Search</span>
            <input id="invoice-search" name="q" type="text" defaultValue={q} placeholder="Invoice # or customer"
                   className="input input-sm w-64" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs mb-1">Status</span>
            <select id="invoice-status-filter" name="status" defaultValue={status} className="select select-sm">
              <option value="">All statuses</option>
              <option value="OVERDUE">Overdue</option>
              <option value="DUE">Due</option>
              <option value="PAID">Paid</option>
            </select>
          </div>
          <div className="flex flex-col">
            <span className="text-xs mb-1">&nbsp;</span>
            <div className="flex gap-2">
              <button id="btn-invoice-search" type="submit" className="btn btn-neutral btn-sm">Search</button>
              {q || status ? <Link href="/admin/invoices" className="btn btn-ghost btn-sm">Clear</Link> : null}
            </div>
          </div>
        </div>
      </form>

      <div className="card bg-base-100 border border-base-300">
        <div className="card-body">
          <div className="overflow-x-auto">
            <table id="admin-invoices" className="table">
              <thead><tr><th>Invoice</th><th>Customer</th><th>Issued</th><th>Due</th><th>Status</th><th className="text-right">Total</th><th></th></tr></thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} id={`invoice-row-${inv.invoiceNumber}`}>
                    <td className="font-medium">{inv.invoiceNumber}</td>
                    <td>{inv.customerName}</td>
                    <td>{fmtDate(inv.invoiceDate)}</td>
                    <td>{fmtDate(inv.dueDate)}</td>
                    <td><span id={`invoice-status-${inv.invoiceNumber}`} className={`badge ${statusBadge(inv.status)}`}>{inv.status}</span></td>
                    <td className="text-right font-semibold">{money(inv.total)}</td>
                    <td className="text-right whitespace-nowrap">
                      <Link href={`/admin/invoices/${inv.id}`} className="btn btn-ghost btn-xs">View</Link>
                      <Link id={`btn-edit-${inv.invoiceNumber}`} href={`/admin/invoices/${inv.id}/edit`} className="btn btn-ghost btn-xs">Edit</Link>
                      <DeleteInvoiceButton invoiceId={inv.id} invoiceNumber={inv.invoiceNumber} />
                    </td>
                  </tr>
                ))}
                {invoices.length === 0 ? <tr><td colSpan={7} className="text-center text-base-content/50 py-6">No invoices found.</td></tr> : null}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex flex-wrap items-center justify-between gap-2 mt-4">
            <span id="page-info" className="text-sm text-base-content/60">Page {page} of {totalPages} · {total} invoice(s)</span>
            <div className="join">
              <Link id="page-first" href={pageLink(1)} className={`join-item btn btn-sm ${page <= 1 ? "btn-disabled" : ""}`}>« First</Link>
              <Link id="page-prev" href={pageLink(Math.max(1, page - 1))} className={`join-item btn btn-sm ${page <= 1 ? "btn-disabled" : ""}`}>‹ Prev</Link>
              <Link id="page-next" href={pageLink(Math.min(totalPages, page + 1))} className={`join-item btn btn-sm ${page >= totalPages ? "btn-disabled" : ""}`}>Next ›</Link>
              <Link id="page-last" href={pageLink(totalPages)} className={`join-item btn btn-sm ${page >= totalPages ? "btn-disabled" : ""}`}>Last »</Link>
            </div>
          </div>
        </div>
      </div>

      {/* Rendered ONCE for the whole page and retargeted per row by DeleteInvoiceButton — a modal
          per row would duplicate id="confirm-delete-modal" / "btn-confirm-delete-yes" across rows,
          so getElementById would hit the first row's copy and delete the wrong invoice.
          Mirrors the Grails invoice/index.gsp modal. */}
      <DeleteInvoiceModal action={deleteInvoice} />
    </div>
  );
}
