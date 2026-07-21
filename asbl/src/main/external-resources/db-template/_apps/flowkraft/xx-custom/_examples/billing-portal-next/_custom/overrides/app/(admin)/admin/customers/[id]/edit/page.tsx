import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, bpCustomer } from "@/lib/db";
import { updateCustomer } from "@/lib/actions";
import { CustomerForm } from "@/components/billing/CustomerForm";

export default async function EditCustomerPage(
  { params, searchParams }: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ name?: string; contactName?: string; address?: string; city?: string; country?: string }>;
  },
) {
  const { id } = await params;
  const sp = await searchParams;
  const customer = db.select().from(bpCustomer).where(eq(bpCustomer.id, Number(id))).all()[0];
  if (!customer) return <div className="max-w-2xl mx-auto"><div className="alert alert-soft alert-error">Customer not found.</div></div>;

  // The stored row fills the form on a normal visit; searchParams override it with what the admin
  // typed when an update was refused. `??`, not `||`, so a deliberately blanked field stays blank
  // instead of quietly reverting to the stored value.
  const shown = {
    ...customer,
    name: sp.name ?? customer.name,
    contactName: sp.contactName ?? customer.contactName,
    address: sp.address ?? customer.address,
    city: sp.city ?? customer.city,
    country: sp.country ?? customer.country,
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Edit {customer.name}</h1>
        <Link href={`/admin/customers/${customer.id}`} className="btn btn-ghost btn-sm">Cancel</Link>
      </div>
      <div className="card bg-base-100 border border-base-300">
        <div className="card-body">
          <form action={updateCustomer}>
            <input type="hidden" name="id" value={customer.id} />
            <CustomerForm customer={shown} />
            <div className="flex justify-end gap-2 mt-4">
              <Link href={`/admin/customers/${customer.id}`} className="btn btn-ghost">Cancel</Link>
              <button id="btn-save-customer" type="submit" className="btn btn-primary">Save changes</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
