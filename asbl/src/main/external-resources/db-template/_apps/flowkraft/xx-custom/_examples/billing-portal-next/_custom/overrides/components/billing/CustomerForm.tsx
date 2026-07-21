interface FormCustomer {
  id?: number; name?: string; contactName?: string | null; email?: string;
  address?: string | null; city?: string | null; country?: string | null;
}

// Customer form fields — mirrors _form.gsp. Shared by the new + edit pages.
//
// Layout: every field is `flex flex-col` (label above its control) and every control is `w-full`, so
// all inputs share one left edge and one width inside the 2-column grid.
// Do NOT reach for daisyUI's `form-control` / `label-text` here: this app is on daisyUI 5, which
// REMOVED both. With no rule behind it, `form-control` stops being a flex column, each label falls
// back to inline, and the caption sits BESIDE its input — pushing every input to a different x, since
// each caption is a different width. `input-bordered` is gone too (v5 inputs are bordered by default).
export function CustomerForm({ customer = {} }: { customer?: FormCustomer }) {
  const isEdit = !!customer.id;
  return (
    <>
      <div className="grid sm:grid-cols-2 gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Name</span>
          <input id="customer-name" name="name" type="text" required className="input w-full" defaultValue={customer.name ?? ""} placeholder="Acme Corp" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Contact name</span>
          <input id="customer-contact-name" name="contactName" type="text" className="input w-full" defaultValue={customer.contactName ?? ""} placeholder="Jane Doe" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Email</span>
          {/* Settable once, on create. On edit it is readOnly AND updateCustomer ignores the
              submitted field outright: the email is the REST upsert key and the login username, so a
              rename would make the next Burst miss this customer and create a duplicate under the
              old address. */}
          <input id="customer-email" name="email" type="email" required readOnly={isEdit} className="input w-full" defaultValue={customer.email ?? ""} placeholder="jane@acme.com" />
          {isEdit ? <span className="text-xs text-base-content/50">The email is the customer&apos;s login and how their invoices are matched — it cannot be changed.</span> : null}
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Address</span>
          <input id="customer-address" name="address" type="text" className="input w-full" defaultValue={customer.address ?? ""} placeholder="1 Market Street" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">City</span>
          <input id="customer-city" name="city" type="text" className="input w-full" defaultValue={customer.city ?? ""} placeholder="Berlin" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Country</span>
          <input id="customer-country" name="country" type="text" className="input w-full" defaultValue={customer.country ?? ""} placeholder="DE" />
        </label>
      </div>
      {!isEdit ? <p className="text-xs text-base-content/50 mt-2">A new customer also gets a portal login: their email address, with password <strong>changeme</strong>.</p> : null}
    </>
  );
}
