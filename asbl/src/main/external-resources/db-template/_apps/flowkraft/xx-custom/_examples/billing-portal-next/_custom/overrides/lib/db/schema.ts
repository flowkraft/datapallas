import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

// status ∈ {PAID, DUE, OVERDUE}; role ∈ {ADMIN, CUSTOMER} — same as the Grails bp_ model.
export const invoiceStatuses = ["PAID", "DUE", "OVERDUE"] as const;
export type InvoiceStatus = (typeof invoiceStatuses)[number];

export const bpCustomer = sqliteTable("bp_customer", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  contactName: text("contact_name"), // the invoice document's "Attn:" line
  email: text("email").notNull().unique(),
  address: text("address"), // the invoice document's street line
  city: text("city"),
  country: text("country"),
});

export const bpAppUser = sqliteTable("bp_app_user", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").default("CUSTOMER").notNull(),
  customerId: integer("customer_id"),
});

export const bpInvoice = sqliteTable("bp_invoice", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  invoiceNumber: text("invoice_number").notNull().unique(),
  customerId: integer("customer_id").notNull(),
  invoiceDate: text("invoice_date").notNull(),
  dueDate: text("due_date").notNull(),
  status: text("status", { enum: invoiceStatuses }).default("DUE").notNull(),
  subtotal: real("subtotal").default(0).notNull(),
  tax: real("tax").default(0).notNull(),
  freight: real("freight").default(0).notNull(),
  total: real("total").default(0).notNull(),
  notes: text("notes"), // free-text note rendered in the invoice document's Notes block
  payToken: text("pay_token"),
  paidAt: text("paid_at"),
  paymentMethod: text("payment_method"),
  paymentReference: text("payment_reference"),
});

export const bpInvoiceLine = sqliteTable("bp_invoice_line", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  invoiceId: integer("invoice_id").notNull(),
  productName: text("product_name").notNull(),
  category: text("category"), // grey sub-label under the product name on the invoice document
  qty: integer("qty").default(1).notNull(),
  unitPrice: real("unit_price").default(0).notNull(),
  discount: real("discount").default(0).notNull(),
  lineTotal: real("line_total").default(0).notNull(),
});

export type Customer = typeof bpCustomer.$inferSelect;
export type AppUser = typeof bpAppUser.$inferSelect;
export type Invoice = typeof bpInvoice.$inferSelect;
export type InvoiceLine = typeof bpInvoiceLine.$inferSelect;
