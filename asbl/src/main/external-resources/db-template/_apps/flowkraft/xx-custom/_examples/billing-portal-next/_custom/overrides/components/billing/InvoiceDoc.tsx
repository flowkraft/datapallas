import { fmtInvoiceDate, num, statusDocClass } from "@/lib/format";
import { InvoiceFrame } from "./InvoiceFrame";

/**
 * HTML-escape a value being interpolated into the document string below.
 *
 * The document is built as a string rather than as JSX rendered by react-dom/server, because Next
 * refuses that import outright ("You're importing a component that imports react-dom/server") even
 * from a server component. So the escaping React would have done is done here instead, and it is NOT
 * optional: `notes`, the customer's name and address, and every product name are attacker-influenced
 * (the REST ingest writes them straight from the Burst payload). Miss one and a customer named
 * `<script>` executes inside the frame.
 *
 * The Grails twin needs no equivalent — application.yml sets `codecs.expression: html`, so GSP
 * escapes every ${...} for free.
 */
const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

interface Line {
  productName: string;
  category?: string | null;
  qty: number;
  unitPrice: number;
  discount: number;
  lineTotal: number;
}
interface Inv {
  invoiceNumber: string;
  status: string;
  invoiceDate: string;
  dueDate: string;
  subtotal: number;
  tax: number;
  freight: number;
  total: number;
  notes?: string | null;
}
interface Cust {
  name: string;
  contactName?: string | null;
  email: string;
  address?: string | null;
  city?: string | null;
  country?: string | null;
}

/*
 * Northwind Traders invoice — the HTML twin of invoice-fop-template.xsl. Palette and
 * metrics carried over verbatim (pt → px). Paper-white always: an invoice is a document,
 * not a UI panel, so it does not follow the portal's theme.
 *
 * This is the WHOLE stylesheet for the document. It renders inside its own iframe, which inherits
 * nothing from the app — no Tailwind reset, no utility class, no daisyUI component reaches in here.
 * If a rule is not written below, it does not exist. That is why the status pill is .bp-status and
 * not daisyUI's .badge (which used to style it, and would render as bare text in here).
 *
 * ⚠ Byte-identical to the <style> block in the Grails twin (_invoiceDocumentBody.gsp).
 */
const INVOICE_CSS = `
html, body { margin:0; padding:0; background:#fff; }
.bp-invoice { background:#fff; color:#1a1a2e; font-family:Helvetica, Arial, sans-serif; font-size:12px;
  padding:28px 32px; border:1px solid #dce0e6; border-radius:6px; max-width:820px; margin:0 auto; }
.bp-invoice-header { display:flex; justify-content:space-between; align-items:flex-start; gap:24px; }
.bp-invoice-logo { display:block; margin-bottom:6px; }
.bp-invoice-seller { font-size:11px; color:#4a5568; line-height:1.5; }
.bp-invoice-meta { text-align:right; }
.bp-invoice-title { font-size:34px; font-weight:bold; color:#1b3a5c; margin-bottom:8px; line-height:1; }
.bp-invoice-meta-row { font-size:12px; color:#4a5568; margin-bottom:3px; }
.bp-invoice-meta-row strong { color:#1a1a2e; }
/* The status pill. Self-contained on purpose — daisyUI's .badge used to do this, and nothing of
   daisyUI's reaches inside the frame, so it would have rendered as bare unstyled text. */
.bp-status { display:inline-block; padding:2px 9px; border-radius:9999px; font-size:10px;
  font-weight:bold; letter-spacing:0.5px; border:1px solid; }
.bp-status-paid { color:#16a34a; background:#f0fdf4; border-color:#bbf7d0; }
.bp-status-due { color:#d97706; background:#fffbeb; border-color:#fde68a; }
.bp-status-overdue { color:#dc2626; background:#fef2f2; border-color:#fecaca; }
.bp-invoice-divider { border-bottom:2px solid #1b3a5c; margin:14px 0; }
.bp-invoice-section-label { font-size:11px; font-weight:bold; color:#2e6b9e; text-transform:uppercase;
  letter-spacing:1px; margin-bottom:4px; }
.bp-notes-label { margin-top:22px; }
.bp-invoice-billto-name { font-size:13px; font-weight:bold; margin-bottom:2px; }
.bp-invoice-billto { font-size:11px; color:#4a5568; line-height:1.5; }
.bp-invoice-billto-last { margin-bottom:16px; }
.bp-invoice-table { width:100%; border-collapse:collapse; }
.bp-invoice-table th { background:#1b3a5c; color:#fff; font-weight:bold; font-size:11px;
  padding:8px 5px; border:1px solid #1b3a5c; text-align:left; }
.bp-invoice-table td { padding:7px 5px; border:1px solid #dce0e6; font-size:11px; vertical-align:top; }
.bp-invoice-table tr.bp-zebra { background:#f2f4f7; }
.bp-invoice-table .bp-c, .bp-invoice-table th.bp-c { text-align:center; }
.bp-invoice-table .bp-r, .bp-invoice-table th.bp-r { text-align:right; }
.bp-invoice-table .bp-b { font-weight:bold; }
.bp-product { font-size:11px; }
.bp-category { font-size:9px; color:#8a8fa3; }
.bp-empty { color:#8a8fa3; padding:16px 0; }
.bp-invoice-totals { width:100%; border-collapse:collapse; margin-top:2px; }
.bp-invoice-totals td { padding:5px 8px; font-size:11px; }
.bp-invoice-totals .bp-spacer { width:60%; border:0; }
.bp-invoice-totals .bp-total-label { color:#4a5568; }
.bp-invoice-totals tr:not(.bp-grand) td:not(.bp-spacer) { border-bottom:1px solid #dce0e6; }
.bp-invoice-totals tr.bp-grand td:not(.bp-spacer) { background:#1b3a5c; color:#fff; font-size:15px;
  font-weight:bold; padding:9px 8px; }
.bp-invoice-notes { font-size:11px; color:#4a5568; padding:8px; background:#f8f9fb; border:1px solid #dce0e6; }
.bp-invoice-payment td { padding:3px 0; font-size:11px; }
.bp-invoice-payment .bp-pay-label { color:#4a5568; width:110px; }
.bp-invoice-footer { margin-top:24px; padding-top:6px; border-top:1px solid #dce0e6;
  text-align:center; font-size:10px; color:#8a8fa3; }
/* Printing hands the sheet to the invoice alone (the frame IS the print target — see
   InvoiceFrame.printInvoice()), so drop the on-screen card framing and let the paper's own
   margins do the work. */
@media print {
  .bp-invoice { border:0; border-radius:0; max-width:none; padding:0; }
}
`;

/**
 * The invoice document as a complete, standalone HTML page — the 1:1 mirror of the Grails
 * _invoiceDocumentBody.gsp.
 *
 * ⚠ Kept 101% in sync with that twin: same markup, same classes, same id="…" on every element, and
 * byte-identical CSS. Change one, change the other, or apps-custom.spec.ts (which asserts these ids
 * on BOTH apps) will fail.
 *
 * A string, not JSX: this is handed to an iframe's srcdoc, and Next will not let a component import
 * react-dom/server to serialise JSX. Every interpolation therefore goes through esc().
 */
function invoiceDocumentHtml(invoice: Inv, customer: Cust | undefined, lines: Line[]): string {
  const line = (l: Line, i: number) => `
        <tr id="invoiceLine_${i}" class="${i % 2 === 1 ? "bp-zebra" : ""}">
          <td class="bp-c">${i + 1}</td>
          <td>
            <div class="bp-product">${esc(l.productName)}</div>
            ${l.category ? `<div class="bp-category">${esc(l.category)}</div>` : ""}
          </td>
          <td class="bp-r">${esc(l.qty)}</td>
          <td class="bp-r">${esc(num(l.unitPrice))}</td>
          <td class="bp-r">${l.discount ? `${Math.round(l.discount * 100)}%` : "-"}</td>
          <td class="bp-r bp-b">${esc(num(l.lineTotal))}</td>
        </tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Invoice ${esc(invoice.invoiceNumber)}</title>
<style>${INVOICE_CSS}</style>
</head>
<body>
<div id="invoiceDocument" class="bp-invoice">

  <!-- ========== HEADER: Logo + Company / Invoice Meta ========== -->
  <div class="bp-invoice-header">
    <div>
      <svg class="bp-invoice-logo" width="160" height="42" viewBox="0 0 160 42" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 38 C4 38 12 4 28 4 C36 4 40 14 36 22 C32 30 20 36 4 38Z" fill="#1b3a5c" opacity="0.9"/>
        <path d="M18 38 C18 38 28 10 40 8 C48 6 50 16 46 24 C42 32 30 36 18 38Z" fill="#2e6b9e" opacity="0.85"/>
        <path d="M2 38 L50 38" stroke="#1b3a5c" stroke-width="2.5" stroke-linecap="round"/>
        <path d="M2 42 Q14 36 26 42 Q38 48 50 42" stroke="#2e6b9e" stroke-width="1.2" fill="none" opacity="0.5"/>
        <text x="58" y="20" font-family="Helvetica, Arial, sans-serif" font-size="16" font-weight="bold" fill="#1b3a5c">Northwind</text>
        <text x="58" y="34" font-family="Helvetica, Arial, sans-serif" font-size="10" fill="#4a6fa5" letter-spacing="2.5">TRADERS</text>
      </svg>
      <div class="bp-invoice-seller">123 Harbor Boulevard, Suite 400</div>
      <div class="bp-invoice-seller">Seattle, WA 98101, USA</div>
      <div class="bp-invoice-seller">Tel: (206) 555-0120</div>
      <div class="bp-invoice-seller">billing@northwind.example.com</div>
    </div>
    <div class="bp-invoice-meta">
      <div class="bp-invoice-title">INVOICE</div>
      <div class="bp-invoice-meta-row">Invoice #: <strong id="invoiceNumber">${esc(invoice.invoiceNumber)}</strong></div>
      <div class="bp-invoice-meta-row">Date: <strong id="invoiceDate">${esc(fmtInvoiceDate(invoice.invoiceDate))}</strong></div>
      <div class="bp-invoice-meta-row">Due: <strong id="invoiceDueDate">${esc(fmtInvoiceDate(invoice.dueDate))}</strong></div>
      <div class="bp-invoice-meta-row">Status:
        <!-- statusDocClass, NOT statusBadge: the lists wear daisyUI badges, the document wears its
             own. Both derive from the same status, so they still agree. Mirrors the Grails twin. -->
        <span id="invoiceStatus" class="bp-status ${statusDocClass(invoice.status)}">${esc(invoice.status)}</span>
      </div>
    </div>
  </div>

  <div class="bp-invoice-divider"></div>

  <!-- ========== BILL TO ========== -->
  <div class="bp-invoice-section-label">Bill To</div>
  <div id="invoiceBillToName" class="bp-invoice-billto-name">${esc(customer?.name)}</div>
  ${customer?.contactName ? `<div id="invoiceBillToContact" class="bp-invoice-billto">Attn: ${esc(customer.contactName)}</div>` : ""}
  <div id="invoiceBillToAddress" class="bp-invoice-billto">${esc(customer?.address)}</div>
  <div id="invoiceBillToCity" class="bp-invoice-billto">${esc(customer?.city)}${customer?.country ? `, ${esc(customer.country)}` : ""}</div>
  <div id="invoiceBillToEmail" class="bp-invoice-billto bp-invoice-billto-last">${esc(customer?.email)}</div>

  <!-- ========== LINE ITEMS TABLE ========== -->
  <table id="invoiceLines" class="bp-invoice-table">
    <thead>
      <tr>
        <th class="bp-c">#</th>
        <th>Product</th>
        <th class="bp-r">Qty</th>
        <th class="bp-r">Unit Price</th>
        <th class="bp-r">Discount</th>
        <th class="bp-r">Line Total</th>
      </tr>
    </thead>
    <tbody>${lines.map(line).join("")}
      ${lines.length === 0 ? `<tr><td colspan="6" class="bp-c bp-empty">No line items.</td></tr>` : ""}
    </tbody>
  </table>

  <!-- ========== TOTALS ========== -->
  <table class="bp-invoice-totals">
    <tbody>
      <tr>
        <td class="bp-spacer"></td>
        <td class="bp-r bp-total-label">Subtotal</td>
        <td class="bp-r"><span id="invoiceSubtotal">${esc(num(invoice.subtotal))}</span></td>
      </tr>
      <tr>
        <td class="bp-spacer"></td>
        <td class="bp-r bp-total-label">Freight</td>
        <td class="bp-r"><span id="invoiceFreight">${esc(num(invoice.freight))}</span></td>
      </tr>
      <tr>
        <td class="bp-spacer"></td>
        <td class="bp-r bp-total-label">Tax (8%)</td>
        <td class="bp-r"><span id="invoiceTax">${esc(num(invoice.tax))}</span></td>
      </tr>
      <tr class="bp-grand">
        <td class="bp-spacer"></td>
        <td class="bp-r">TOTAL DUE</td>
        <td class="bp-r"><span id="invoiceTotal">$${esc(num(invoice.total))}</span></td>
      </tr>
    </tbody>
  </table>

  <!-- ========== NOTES ========== -->
  ${invoice.notes ? `<div class="bp-invoice-section-label bp-notes-label">Notes</div>
  <div id="invoiceNotes" class="bp-invoice-notes">${esc(invoice.notes)}</div>` : ""}

  <!-- ========== PAYMENT INFO ========== -->
  <div class="bp-invoice-section-label bp-notes-label">Payment Information</div>
  <table id="invoicePaymentInfo" class="bp-invoice-payment">
    <tbody>
      <tr><td class="bp-pay-label">Bank:</td><td>Northwind National Bank</td></tr>
      <tr><td class="bp-pay-label">Account:</td><td>XXXX-XXXX-4820</td></tr>
      <tr><td class="bp-pay-label">Routing:</td><td>021-000-089</td></tr>
    </tbody>
  </table>

  <!-- ========== FOOTER ========== -->
  <div class="bp-invoice-footer">
    Thank you for your business! &mdash; Northwind Traders &mdash; billing@northwind.example.com
  </div>

</div>
</body>
</html>`;
}

/**
 * Reusable invoice document — used by the customer + admin detail pages and by the public
 * (unauthenticated) pay page. The 1:1 mirror of the Grails _invoiceDocument.gsp.
 *
 * Hands the standalone document to InvoiceFrame, which shows it in an iframe. Serialising it rather
 * than nesting the JSX in the page is what buys the isolation: the document ends up in its own
 * browsing context with its own stylesheet, untouched by the app's Tailwind/daisyUI CSS.
 */
export function InvoiceDoc({ invoice, customer, lines }: { invoice: Inv; customer?: Cust; lines: Line[] }) {
  return <InvoiceFrame html={invoiceDocumentHtml(invoice, customer, lines)} invoiceNumber={invoice.invoiceNumber} />;
}
