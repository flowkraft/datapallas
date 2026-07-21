<%--
  Reusable invoice document. Model: [invoice: Invoice]. Used by the customer + admin detail pages
  and by the public (unauthenticated) pay page.

  The invoice renders inside an IFRAME carrying its own complete document (_invoiceDocumentBody.gsp,
  escaped into srcdoc below). An iframe is a hard styling boundary: the portal's Tailwind 4 +
  daisyUI 5 stylesheet cannot reach in, and the invoice's CSS cannot leak out. So the invoice looks
  identical under every daisyUI theme, and anyone adapting this example restyles it by editing the
  <style> in _invoiceDocumentBody.gsp and nothing else — a real document with its own look, not a UI
  panel that happens to be shaped like one.

  srcdoc, not JavaScript that writes into the frame: the invoice is then plain markup in the
  response, needing no script to appear. It also keeps SiteMesh out of trouble — the whole document
  is HTML-ESCAPED into an attribute, so the page contains no <html>/<head> tag for the decorator to
  find and hoist. (It found them once before, when the print popup was assembled from a markup
  string, and printed "+ '' + '' +" across the page.)

  ⚠ Kept 101% in sync with the Next twin: billing-portal-next/_custom/overrides/components/billing/
  InvoiceFrame.tsx + InvoiceDoc.tsx — same ids, same behaviour.
--%>
<g:set var="invoiceDocumentHtml"><g:render template="/invoiceDocumentBody" model="[invoice: invoice]"/></g:set>

<%-- Print / Save PDF. Lives OUTSIDE the frame, so it can never print itself, and it is rendered for
     EVERY viewer — a customer settling an invoice without signing in wants a copy for their records
     just as much as the account holder does. --%>
<div class="flex justify-end mb-2">
  <button type="button" id="btn-print-invoice" class="btn btn-sm" onclick="printInvoice()">Print / Save PDF</button>
</div>

<%-- .toString() drops the buffer's encoding state, encodeAsHTML() escapes it exactly once, and
     raw() stops GSP (codec expression: html) from escaping it a second time. All three matter:
     without them the attribute is either double-escaped and shows markup as text, or not escaped at
     all and breaks out of srcdoc. --%>
<iframe id="invoiceFrame" title="Invoice ${invoice.invoiceNumber}" onload="fitInvoiceFrame()"
        style="width:100%;border:0;display:block;overflow:hidden"
        srcdoc="${raw(invoiceDocumentHtml.toString().encodeAsHTML())}"></iframe>

<script>
  // An iframe has no natural height — left alone it is a 150px porthole onto the invoice. Size it to
  // its content once the document is in.
  function fitInvoiceFrame() {
    var f = document.getElementById('invoiceFrame');
    if (!f || !f.contentDocument) return;
    f.style.height = f.contentDocument.documentElement.scrollHeight + 'px';
  }
  // Printing the frame prints the frame's document ALONE — the navbar, the sidebar and the
  // Edit/Delete toolbar are in a different document and simply cannot be picked up. That is the
  // whole reason the old version had to open a popup and copy the styles across by hand; the frame
  // already is the self-contained document that popup was trying to build.
  // srcdoc is same-origin, so reaching contentWindow is allowed.
  function printInvoice() {
    var f = document.getElementById('invoiceFrame');
    if (!f || !f.contentWindow) return;
    f.contentWindow.focus();
    f.contentWindow.print();
  }
</script>
