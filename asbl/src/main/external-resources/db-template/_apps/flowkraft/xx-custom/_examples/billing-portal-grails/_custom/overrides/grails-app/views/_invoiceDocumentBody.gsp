<%--
  The invoice document itself — a COMPLETE, STANDALONE HTML page. Model: [invoice: Invoice].

  Never rendered into a page directly. _invoiceDocument.gsp renders this, escapes the result, and
  hands it to an iframe's srcdoc, so the invoice loads as its OWN document with its OWN stylesheet.
  That isolation is the point: the app's Tailwind 4 + daisyUI 5 stylesheet does not cross an iframe
  boundary, so an invoice looks the same whichever theme the portal is wearing, and whoever adapts
  this example can restyle the invoice by editing the <style> below and nothing else.

  Consequently the CSS below is the WHOLE stylesheet for the document — no reset, no utility class
  and no daisyUI component reaches in here. If a rule is not written below, it does not exist. That
  is why the status pill is .bp-status and not daisyUI's .badge (which used to style it, and would
  render as bare text in here).

  ⚠ Kept 101% in sync with the Next twin: billing-portal-next/_custom/overrides/components/billing/
  InvoiceDoc.tsx — same markup, same classes, same id="…" on every element, byte-identical CSS.
  Change one, change the other, or apps-custom.spec.ts (which asserts these ids on BOTH apps) fails.
--%><!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Invoice ${invoice.invoiceNumber}</title>
<style>
/* Northwind Traders invoice — the HTML twin of invoice-fop-template.xsl. Palette and
   metrics carried over verbatim (pt → px). Paper-white always: an invoice is a document,
   not a UI panel, so it does not follow the portal's theme.
   ⚠ Byte-identical to the CSS in the Next twin (InvoiceDoc.tsx). */
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
   printInvoice() in _invoiceDocument.gsp), so drop the on-screen card framing and let the
   paper's own margins do the work. */
@media print {
  .bp-invoice { border:0; border-radius:0; max-width:none; padding:0; }
}
</style>
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
      <div class="bp-invoice-meta-row">Invoice #: <strong id="invoiceNumber">${invoice.invoiceNumber}</strong></div>
      <div class="bp-invoice-meta-row">Date: <strong id="invoiceDate"><g:formatDate date="${invoice.invoiceDate}" format="MM/dd/yyyy"/></strong></div>
      <div class="bp-invoice-meta-row">Due: <strong id="invoiceDueDate"><g:formatDate date="${invoice.dueDate}" format="MM/dd/yyyy"/></strong></div>
      <div class="bp-invoice-meta-row">Status:
        <%-- invoice.statusDocClass, NOT statusBadgeClass: the lists wear daisyUI badges, the
             document wears its own. Both derive from the same `status`, so they still agree. --%>
        <span id="invoiceStatus" class="bp-status ${invoice.statusDocClass}">${invoice.status}</span>
      </div>
    </div>
  </div>

  <div class="bp-invoice-divider"></div>

  <!-- ========== BILL TO ========== -->
  <div class="bp-invoice-section-label">Bill To</div>
  <div id="invoiceBillToName" class="bp-invoice-billto-name">${invoice.customer?.name}</div>
  <g:if test="${invoice.customer?.contactName}">
    <div id="invoiceBillToContact" class="bp-invoice-billto">Attn: ${invoice.customer.contactName}</div>
  </g:if>
  <div id="invoiceBillToAddress" class="bp-invoice-billto">${invoice.customer?.address}</div>
  <div id="invoiceBillToCity" class="bp-invoice-billto">${invoice.customer?.city}<g:if test="${invoice.customer?.country}">, ${invoice.customer.country}</g:if></div>
  <div id="invoiceBillToEmail" class="bp-invoice-billto bp-invoice-billto-last">${invoice.customer?.email}</div>

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
    <tbody>
      <g:each in="${invoice.lines}" var="line" status="i">
        <tr id="invoiceLine_${i}" class="${i % 2 == 1 ? 'bp-zebra' : ''}">
          <td class="bp-c">${i + 1}</td>
          <td>
            <div class="bp-product">${line.productName}</div>
            <g:if test="${line.category}"><div class="bp-category">${line.category}</div></g:if>
          </td>
          <td class="bp-r">${line.qty}</td>
          <td class="bp-r"><g:formatNumber number="${line.unitPrice}" format="#,##0.00"/></td>
          <td class="bp-r">${line.discount ? (line.discount * 100).intValue() + '%' : '-'}</td>
          <td class="bp-r bp-b"><g:formatNumber number="${line.lineTotal}" format="#,##0.00"/></td>
        </tr>
      </g:each>
      <g:if test="${!invoice.lines}">
        <tr><td colspan="6" class="bp-c bp-empty">No line items.</td></tr>
      </g:if>
    </tbody>
  </table>

  <!-- ========== TOTALS ========== -->
  <table class="bp-invoice-totals">
    <tbody>
      <tr>
        <td class="bp-spacer"></td>
        <td class="bp-r bp-total-label">Subtotal</td>
        <td class="bp-r"><span id="invoiceSubtotal"><g:formatNumber number="${invoice.subtotal}" format="#,##0.00"/></span></td>
      </tr>
      <tr>
        <td class="bp-spacer"></td>
        <td class="bp-r bp-total-label">Freight</td>
        <td class="bp-r"><span id="invoiceFreight"><g:formatNumber number="${invoice.freight}" format="#,##0.00"/></span></td>
      </tr>
      <tr>
        <td class="bp-spacer"></td>
        <td class="bp-r bp-total-label">Tax (8%)</td>
        <td class="bp-r"><span id="invoiceTax"><g:formatNumber number="${invoice.tax}" format="#,##0.00"/></span></td>
      </tr>
      <tr class="bp-grand">
        <td class="bp-spacer"></td>
        <td class="bp-r">TOTAL DUE</td>
        <td class="bp-r"><span id="invoiceTotal">$<g:formatNumber number="${invoice.total}" format="#,##0.00"/></span></td>
      </tr>
    </tbody>
  </table>

  <!-- ========== NOTES ========== -->
  <g:if test="${invoice.notes}">
    <div class="bp-invoice-section-label bp-notes-label">Notes</div>
    <div id="invoiceNotes" class="bp-invoice-notes">${invoice.notes}</div>
  </g:if>

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
</html>
