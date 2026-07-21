<%-- Delete confirmation for an invoice — rendered by BOTH the list and the invoice detail page.

     Deleting an invoice is irreversible (it cascades to its line items), so it must never happen on
     a single stray click.

     One template, not a copy per page: the two drifted apart before — the list asked properly while
     the detail page fell back to a native confirm() — and that is exactly what a shared template
     prevents. The Next twin does the same with components/billing/DeleteInvoice.tsx.

     Callers open it with confirmDeleteInvoice(number, url); ONE dialog per page, retargeted per
     row, so the ids below stay unique.

     It must be rendered OUTSIDE any other form: a form nested inside another is invalid HTML, and
     the parser closes the OUTER form at the inner one's end tag, silently orphaning everything
     after it. --%>
<dialog id="confirm-delete-modal" class="modal">
  <div class="modal-box">
    <h3 class="font-bold text-lg">Delete invoice?</h3>
    <p class="py-4">
      Delete invoice <strong id="confirm-delete-what"></strong>?
      This permanently removes it and its line items. This cannot be undone.
    </p>
    <div class="modal-action">
      <button type="button" id="btn-confirm-delete-no" class="btn"
              onclick="document.getElementById('confirm-delete-modal').close()">No, keep it</button>
      <form id="confirm-delete-form" method="post">
        <button type="submit" id="btn-confirm-delete-yes" class="btn btn-error">Yes, delete</button>
      </form>
    </div>
  </div>
  <%-- Plain button, not daisyUI's form-based backdrop — same nested-form reason. --%>
  <button type="button" class="modal-backdrop"
          onclick="document.getElementById('confirm-delete-modal').close()">close</button>
</dialog>

<script>
  function confirmDeleteInvoice(invoiceNumber, deleteUrl) {
    document.getElementById('confirm-delete-what').textContent = invoiceNumber;
    document.getElementById('confirm-delete-form').action = deleteUrl;
    document.getElementById('confirm-delete-modal').showModal();
  }
</script>
