"use server";

import { count, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, bpAppUser, bpCustomer, bpInvoice, bpInvoiceLine } from "./db";
import { setFlash } from "./flash";
import { getSession } from "./auth";
import { hashPassword } from "./crypto";

const num = (v: FormDataEntryValue | null) => Number(v || 0);
const str = (v: FormDataEntryValue | null) => String(v ?? "");

/**
 * Every action below is admin-only, and each one says so ITSELF.
 *
 * A "use server" action compiles to a POST endpoint that anyone who knows its id can call directly —
 * the form it is wired to is not a gate. Nothing here checked anything: an anonymous POST could
 * delete any invoice, rewrite any customer, or reset any customer's password to `changeme` and then
 * sign in as them.
 *
 * The middleware was not covering it either. It matches on the URL of the PAGE being viewed, and a
 * server-action POST need not come from an /admin URL at all; it also runs before any layout
 * renders, so a role check in app/(admin)/layout.tsx cannot stop the mutation — by the time the
 * layout is asked to render, the row is already gone.
 *
 * The Grails twin gets this free because it has a chokepoint: AuthInterceptor.before() runs ahead of
 * every action in the invoice + customer controllers. Next has no such seam, so each entry point
 * asserts for itself. The `!` on the callers below is safe precisely because this throws otherwise.
 */
async function requireAdmin() {
  const s = await getSession();
  if (s?.role !== "ADMIN") throw new Error("Forbidden");
  return s;
}

// Every flash below is worded exactly as its Grails counterpart in InvoiceController /
// CustomerController — the two apps are held to the same behaviour, and that includes what they say
// back to the user.
// setFlash must come BEFORE redirect(): redirect() works by throwing, so nothing after it runs.

export async function createInvoice(formData: FormData) {
  await requireAdmin();
  const invoiceNumber = str(formData.get("invoiceNumber"));
  const subtotal = num(formData.get("subtotal")), tax = num(formData.get("tax")), freight = num(formData.get("freight"));
  const r = db.insert(bpInvoice).values({
    invoiceNumber,
    customerId: num(formData.get("customerId")),
    invoiceDate: str(formData.get("invoiceDate")) || new Date().toISOString().split("T")[0],
    dueDate: str(formData.get("dueDate")),
    status: str(formData.get("status") || "DUE") as "PAID" | "DUE" | "OVERDUE",
    subtotal, tax, freight, total: subtotal + tax + freight,
  }).run();
  await setFlash("message", `Invoice ${invoiceNumber} created`);
  revalidatePath("/admin/invoices");
  redirect(`/admin/invoices/${Number(r.lastInsertRowid)}`);
}

export async function updateInvoice(formData: FormData) {
  await requireAdmin();
  const id = num(formData.get("id"));
  const invoiceNumber = str(formData.get("invoiceNumber"));
  const subtotal = num(formData.get("subtotal")), tax = num(formData.get("tax")), freight = num(formData.get("freight"));
  db.update(bpInvoice).set({
    invoiceNumber,
    customerId: num(formData.get("customerId")),
    invoiceDate: str(formData.get("invoiceDate")),
    dueDate: str(formData.get("dueDate")),
    status: str(formData.get("status") || "DUE") as "PAID" | "DUE" | "OVERDUE",
    subtotal, tax, freight, total: subtotal + tax + freight,
  }).where(eq(bpInvoice.id, id)).run();
  await setFlash("message", `Invoice ${invoiceNumber} updated`);
  revalidatePath(`/admin/invoices/${id}`);
  redirect(`/admin/invoices/${id}`);
}

/** The invoice number the toast reports, read before the row is deleted. */
const invoiceNumberOf = (id: number) =>
  db.select({ n: bpInvoice.invoiceNumber }).from(bpInvoice).where(eq(bpInvoice.id, id)).all()[0]?.n;

export async function deleteInvoice(formData: FormData) {
  await requireAdmin();
  const id = num(formData.get("id"));
  const invoiceNumber = invoiceNumberOf(id); // …while the row still exists.
  db.delete(bpInvoiceLine).where(eq(bpInvoiceLine.invoiceId, id)).run();
  db.delete(bpInvoice).where(eq(bpInvoice.id, id)).run();
  await setFlash("message", `Invoice ${invoiceNumber ?? id} deleted`);
  revalidatePath("/admin/invoices");
  redirect("/admin/invoices");
}

export async function markInvoicePaid(formData: FormData) {
  await requireAdmin();
  const id = num(formData.get("id"));
  db.update(bpInvoice).set({ status: "PAID", paidAt: new Date().toISOString(), paymentMethod: "admin" }).where(eq(bpInvoice.id, id)).run();
  await setFlash("message", `Marked ${invoiceNumberOf(id) ?? id} paid`);
  revalidatePath(`/admin/invoices/${id}`);
  redirect(`/admin/invoices/${id}`);
}

/**
 * The fields the admin form may write. Email is deliberately absent: createCustomer sets it once,
 * and updateCustomer must never rewrite it. Mirrors CustomerController.customerParams().
 */
const customerFields = (formData: FormData) => ({
  name: str(formData.get("name")).trim(),
  contactName: str(formData.get("contactName")).trim(),
  address: str(formData.get("address")).trim(),
  city: str(formData.get("city")).trim(),
  country: str(formData.get("country")).trim(),
});

/** All the admin form demands of a customer — mirrors CustomerController.valid(). */
const validCustomer = (name: string, email: string) => !!name && email.includes("@");

const INVALID_CUSTOMER = "Please provide a customer name and a valid email address";

/**
 * Hand the form back with what the admin typed still in it. The Grails twin re-renders the view
 * straight from the submitted params; a server action can only redirect, so the values ride the
 * query string and the form page pre-fills from them. EVERY field is carried, blanks included: a
 * blank is usually what got the form refused, and dropping it would silently restore the old value.
 */
const formQuery = (fields: Record<string, string>) => `?${new URLSearchParams(fields).toString()}`;

/**
 * Add a customer AND the CUSTOMER login that lets them into the portal — username = email,
 * password `changeme`: exactly the pair POST /api/invoices creates for a pushed customer, so one
 * entered by hand signs in the same way.
 */
export async function createCustomer(formData: FormData) {
  await requireAdmin();
  const fields = customerFields(formData);
  const email = str(formData.get("email")).trim();   // settable ONCE, here — see customerFields()
  const name = fields.name;
  const back = `/admin/customers/new${formQuery({ ...fields, email })}`;
  // revalidatePath before every refusal below: the refusal's ONLY outcome is the flash, and the
  // toast lives in the admin layout — without it the redirect can be served from the client router
  // cache and the admin lands back on the form with no word of why.
  if (!validCustomer(name, email)) {
    await setFlash("error", INVALID_CUSTOMER);
    revalidatePath("/admin/customers/new");
    redirect(back);
  }
  // Refused, never upserted: the admin means to ADD someone, and silently rewriting whoever already
  // holds this email instead is not that.
  if (db.select({ id: bpCustomer.id }).from(bpCustomer).where(eq(bpCustomer.email, email)).all().length > 0) {
    await setFlash("error", `A customer with email ${email} already exists`);
    revalidatePath("/admin/customers/new");
    redirect(back);
  }
  const id = Number(db.insert(bpCustomer).values({ ...fields, email }).run().lastInsertRowid);
  db.insert(bpAppUser).values({
    username: email, passwordHash: hashPassword("changeme"), role: "CUSTOMER", customerId: id,
  }).run();
  await setFlash("message", `Customer ${name} created`);
  revalidatePath("/admin/customers");
  redirect(`/admin/customers/${id}`);
}

/**
 * Save the editable fields. The email is NOT one of them — it is the REST upsert key AND the login
 * username, so rewriting it here would make the next Burst miss this customer and create a DUPLICATE
 * under the old address, stranding the login. CustomerForm renders it readOnly and this ignores the
 * submitted field outright: a readOnly input is still posted, and still forgeable.
 */
export async function updateCustomer(formData: FormData) {
  await requireAdmin();
  const id = num(formData.get("id"));
  const customer = db.select({ email: bpCustomer.email }).from(bpCustomer).where(eq(bpCustomer.id, id)).all()[0];
  if (!customer) {
    await setFlash("error", "Customer not found");
    revalidatePath("/admin/customers");
    redirect("/admin/customers");
  }
  const fields = customerFields(formData);
  const name = fields.name;
  if (!validCustomer(name, customer.email)) {
    await setFlash("error", INVALID_CUSTOMER);
    revalidatePath(`/admin/customers/${id}/edit`);
    redirect(`/admin/customers/${id}/edit${formQuery(fields)}`);
  }
  db.update(bpCustomer).set(fields).where(eq(bpCustomer.id, id)).run();
  await setFlash("message", `Customer ${name} updated`);
  revalidatePath(`/admin/customers/${id}`);
  redirect(`/admin/customers/${id}`);
}

/** Put this customer's login back to `changeme` — the password a pushed customer starts with. */
export async function resetCustomerPassword(formData: FormData) {
  await requireAdmin();
  const id = num(formData.get("id"));
  const customer = db.select({ email: bpCustomer.email }).from(bpCustomer).where(eq(bpCustomer.id, id)).all()[0];
  if (!customer) {
    await setFlash("error", "Customer not found");
    revalidatePath("/admin/customers");
    redirect("/admin/customers");
  }
  const email = customer.email;
  // Matched by username, which IS the customer's email, exactly as the Grails twin matches it.
  db.update(bpAppUser).set({ passwordHash: hashPassword("changeme") }).where(eq(bpAppUser.username, email)).run();
  await setFlash("message", `Password for ${email} reset to changeme`);
  revalidatePath(`/admin/customers/${id}`);
  redirect(`/admin/customers/${id}`);
}

/**
 * Retire a customer, from either the list or their detail page (both ask via DeleteCustomerModal).
 *
 * A customer who still has invoices is REFUSED and nothing is touched: their invoices are the
 * billing record, and deleting the customer would either take that record with them or strand it
 * against a customer who no longer exists. The admin deletes the invoices first, deliberately.
 *
 * The Grails twin, CustomerController.delete, refuses on the same rule in the same words.
 */
export async function deleteCustomer(formData: FormData) {
  await requireAdmin();
  const id = num(formData.get("id"));
  const customer = db.select({ name: bpCustomer.name, email: bpCustomer.email })
    .from(bpCustomer).where(eq(bpCustomer.id, id)).all()[0];
  if (customer) {
    const name = customer.name;   // …read while the row still exists, so the toast can name them.
    const invoices = db.select({ c: count() }).from(bpInvoice).where(eq(bpInvoice.customerId, id)).all()[0]?.c ?? 0;
    if (invoices > 0) {
      // revalidatePath matters even though nothing changed: the refusal's ONLY outcome is the flash,
      // and the toast lives in the admin layout. Without it the redirect can be served from the
      // client router cache and the admin is bounced back to the list with no word of why.
      await setFlash("error", `Customer ${name} has ${invoices} invoice(s) — delete those first`);
      revalidatePath("/admin/customers");
      redirect("/admin/customers");
    }
    // Their login goes with them — it exists only to see this customer's invoices. Matched by
    // username, which IS the customer's email (the REST ingest and the seed both create it that
    // way), exactly as the Grails twin matches it.
    db.delete(bpAppUser).where(eq(bpAppUser.username, customer.email)).run();
    db.delete(bpCustomer).where(eq(bpCustomer.id, id)).run();
    await setFlash("message", `Customer ${name} deleted`);
  }
  revalidatePath("/admin/customers");
  redirect("/admin/customers");
}
