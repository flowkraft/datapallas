import Link from "next/link";
import { eq, sql, desc, count } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { db, bpInvoice } from "@/lib/db";
import { money, fmtDate, statusBadge } from "@/lib/format";

const PAGE_SIZE = 10;
// Unpaid first (OVERDUE, then DUE), then PAID; newest (by invoice date) first within each.
const statusOrder = sql`case ${bpInvoice.status} when 'OVERDUE' then 0 when 'DUE' then 1 else 2 end`;

export default async function PortalInvoicesPage(
  { searchParams }: { searchParams: Promise<{ page?: string }> },
) {
  const s = await getSession();
  const sp = await searchParams;
  const cid = s?.customerId ?? 0;
  const has = !!s?.customerId;

  const total = has ? (db.select({ c: count() }).from(bpInvoice).where(eq(bpInvoice.customerId, cid)).all()[0]?.c ?? 0) : 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, parseInt(sp.page ?? "1", 10) || 1), totalPages);

  const invoices = has
    ? db.select().from(bpInvoice).where(eq(bpInvoice.customerId, cid))
        .orderBy(statusOrder, desc(bpInvoice.invoiceDate))
        .limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE).all()
    : [];

  const pageLink = (p: number) => `/portal/invoices?page=${p}`;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">My Invoices</h1>
        <p className="text-base-content/60">View, pay, and track your invoices.</p>
      </div>

      <div className="card bg-base-100 border border-base-300">
        <div className="card-body">
          <div className="overflow-x-auto">
            <table id="invoice-list" className="table">
              <thead><tr><th>Invoice</th><th>Issued</th><th>Due</th><th>Status</th><th className="text-right">Total</th><th></th></tr></thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} id={`invoice-row-${inv.invoiceNumber}`}>
                    <td className="font-medium">{inv.invoiceNumber}</td>
                    <td>{fmtDate(inv.invoiceDate)}</td>
                    <td className={inv.status === "OVERDUE" ? "text-error font-medium" : ""}>{fmtDate(inv.dueDate)}</td>
                    <td><span id={`invoice-status-${inv.invoiceNumber}`} className={`badge ${statusBadge(inv.status)}`}>{inv.status}</span></td>
                    <td className="text-right font-semibold">{money(inv.total)}</td>
                    <td className="text-right">
                      <Link id={`btn-view-${inv.invoiceNumber}`} href={`/portal/invoices/${inv.id}`} className="btn btn-ghost btn-xs">View</Link>
                      {inv.status !== "PAID" ? <Link id={`btn-pay-${inv.invoiceNumber}`} href={`/portal/invoices/${inv.id}/pay`} className="btn btn-primary btn-xs">Pay</Link> : null}
                    </td>
                  </tr>
                ))}
                {invoices.length === 0 ? <tr><td colSpan={6} className="text-center text-base-content/50 py-6">You have no invoices yet.</td></tr> : null}
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
    </div>
  );
}
