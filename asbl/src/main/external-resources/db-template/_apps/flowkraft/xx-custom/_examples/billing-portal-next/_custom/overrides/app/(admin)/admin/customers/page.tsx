import Link from "next/link";
import { or, like, eq, count } from "drizzle-orm";
import { db, bpCustomer, bpInvoice } from "@/lib/db";
import { deleteCustomer } from "@/lib/actions";
import { DeleteCustomerButton, DeleteCustomerModal } from "@/components/billing/DeleteCustomer";

const PAGE_SIZE = 10;

export default async function AdminCustomersPage(
  { searchParams }: { searchParams: Promise<{ q?: string; page?: string }> },
) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const where = q ? or(like(bpCustomer.name, `%${q}%`), like(bpCustomer.email, `%${q}%`)) : undefined;

  const total = db.select({ c: count() }).from(bpCustomer).where(where).all()[0]?.c ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, parseInt(sp.page ?? "1", 10) || 1), totalPages);

  const customers = db.select().from(bpCustomer).where(where).orderBy(bpCustomer.name)
    .limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE).all();
  const invoiceCount = (id: number) => db.select({ c: count() }).from(bpInvoice).where(eq(bpInvoice.customerId, id)).all()[0]?.c ?? 0;

  const pageLink = (p: number) => {
    const u = new URLSearchParams();
    if (q) u.set("q", q);
    u.set("page", String(p));
    return `/admin/customers?${u.toString()}`;
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div><h1 className="text-2xl font-bold">Customers</h1><p className="text-base-content/60">{total} customer(s).</p></div>
        <Link id="btn-new-customer" href="/admin/customers/new" className="btn btn-primary btn-sm">New customer</Link>
      </div>

      {/* Search */}
      <form method="get" className="mb-4">
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex flex-col">
            <span className="text-xs mb-1">Search</span>
            <input id="customer-search" name="q" type="text" defaultValue={q} placeholder="Name or email" className="input input-sm w-64" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs mb-1">&nbsp;</span>
            <div className="flex gap-2">
              <button id="btn-customer-search" type="submit" className="btn btn-neutral btn-sm">Search</button>
              {q ? <Link href="/admin/customers" className="btn btn-ghost btn-sm">Clear</Link> : null}
            </div>
          </div>
        </div>
      </form>

      <div className="card bg-base-100 border border-base-300">
        <div className="card-body">
          <div className="overflow-x-auto">
            <table id="admin-customers" className="table">
              <thead><tr><th>Name</th><th>Email</th><th>City</th><th>Country</th><th className="text-right">Invoices</th><th></th></tr></thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id} id={`customer-row-${c.email}`}>
                    <td className="font-medium">{c.name}</td>
                    <td>{c.email}</td>
                    <td>{c.city}</td>
                    <td>{c.country}</td>
                    <td className="text-right">{invoiceCount(c.id)}</td>
                    <td className="text-right whitespace-nowrap">
                      <Link href={`/admin/customers/${c.id}`} className="btn btn-ghost btn-xs">View</Link>
                      <Link id={`btn-edit-${c.email}`} href={`/admin/customers/${c.id}/edit`} className="btn btn-ghost btn-xs">Edit</Link>
                      <DeleteCustomerButton customerId={c.id} customerEmail={c.email} customerName={c.name} />
                    </td>
                  </tr>
                ))}
                {customers.length === 0 ? <tr><td colSpan={6} className="text-center text-base-content/50 py-6">No customers found.</td></tr> : null}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex flex-wrap items-center justify-between gap-2 mt-4">
            <span id="page-info" className="text-sm text-base-content/60">Page {page} of {totalPages} · {total} customer(s)</span>
            <div className="join">
              <Link id="page-first" href={pageLink(1)} className={`join-item btn btn-sm ${page <= 1 ? "btn-disabled" : ""}`}>« First</Link>
              <Link id="page-prev" href={pageLink(Math.max(1, page - 1))} className={`join-item btn btn-sm ${page <= 1 ? "btn-disabled" : ""}`}>‹ Prev</Link>
              <Link id="page-next" href={pageLink(Math.min(totalPages, page + 1))} className={`join-item btn btn-sm ${page >= totalPages ? "btn-disabled" : ""}`}>Next ›</Link>
              <Link id="page-last" href={pageLink(totalPages)} className={`join-item btn btn-sm ${page >= totalPages ? "btn-disabled" : ""}`}>Last »</Link>
            </div>
          </div>
        </div>
      </div>

      {/* Rendered ONCE for the whole page and retargeted per row by DeleteCustomerButton — a modal
          per row would duplicate id="confirm-delete-modal" / "btn-confirm-delete-yes" across rows,
          so getElementById would hit the first row's copy and delete the wrong customer.
          Mirrors the Grails customer/index.gsp modal. */}
      <DeleteCustomerModal action={deleteCustomer} />
    </div>
  );
}
