import Link from "next/link";
import { createCustomer } from "@/lib/actions";
import { CustomerForm } from "@/components/billing/CustomerForm";

// searchParams carry what the admin typed when a create was refused, so nothing they entered is
// lost — see formQuery in lib/actions.ts. No `id` in there, so the form renders as a create (the
// email is editable).
export default async function NewCustomerPage(
  { searchParams }: {
    searchParams: Promise<{ name?: string; contactName?: string; email?: string; address?: string; city?: string; country?: string }>;
  },
) {
  const sp = await searchParams;
  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">New customer</h1>
        <Link href="/admin/customers" className="btn btn-ghost btn-sm">Cancel</Link>
      </div>
      <div className="card bg-base-100 border border-base-300">
        <div className="card-body">
          <form action={createCustomer}>
            <CustomerForm customer={sp} />
            <div className="flex justify-end gap-2 mt-4">
              <Link href="/admin/customers" className="btn btn-ghost">Cancel</Link>
              <button id="btn-save-customer" type="submit" className="btn btn-primary">Create customer</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
