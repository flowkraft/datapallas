export const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);

// Bare grouped number, no currency symbol — the invoice DOCUMENT prints amounts unadorned
// and puts the single "$" on TOTAL DUE, exactly like the Apache FOP template's ",##0.00".
// Mirrors <g:formatNumber format="#,##0.00"/> in the Grails twin.
export const num = (n: number) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

export const fmtDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";

// MM/dd/yyyy — the invoice document's date format (the FOP template's ?string("MM/dd/yyyy")).
// Mirrors <g:formatDate format="MM/dd/yyyy"/> in the Grails twin.
export const fmtInvoiceDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }) : "";

// daisyUI badge class for the status pill in the app's LISTS. Mirrors Invoice.statusBadgeClass.
export const statusBadge = (status: string) =>
  status === "PAID" ? "badge-soft badge-success" : status === "OVERDUE" ? "badge-soft badge-error" : "badge-soft badge-warning";

// Status pill class for the invoice DOCUMENT — a separate vocabulary from the lists' daisyUI badge
// above, because the document renders inside its own iframe where no daisyUI class exists. Defined
// in the document's own stylesheet (INVOICE_CSS in InvoiceDoc.tsx). Both switch on the same
// `status`, so the two can label an invoice differently only if someone edits one and not the other.
// Mirrors Invoice.statusDocClass in the Grails twin.
export const statusDocClass = (status: string) =>
  status === "PAID" ? "bp-status-paid" : status === "OVERDUE" ? "bp-status-overdue" : "bp-status-due";
