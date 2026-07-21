<%-- Delete confirmation for a customer — rendered by BOTH the list and the customer detail page.

     Deleting a customer also deletes their login, so it must never happen on a single stray click.
     The dialog only ASKS: a customer who still has invoices is refused by CustomerController.delete
     even after a Yes, because their invoices must be dealt with first.

     One template, not a copy per page: the list and the detail page ask the same question about the
     same act, so they ask it in one voice. The Next twin does the same with
     components/billing/DeleteCustomer.tsx.

     Callers open it with confirmDeleteCustomer(name, url); ONE dialog per page, retargeted per
     row, so the ids below stay unique.

     It must be rendered OUTSIDE any other form: a form nested inside another is invalid HTML, and
     the parser closes the OUTER form at the inner one's end tag, silently orphaning everything
     after it. --%>
<dialog id="confirm-delete-modal" class="modal">
  <div class="modal-box">
    <h3 class="font-bold text-lg">Delete customer?</h3>
    <p class="py-4">
      Delete customer <strong id="confirm-delete-what"></strong>?
      This also removes their login, so they can no longer sign in. This cannot be undone.
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
  function confirmDeleteCustomer(customerName, deleteUrl) {
    document.getElementById('confirm-delete-what').textContent = customerName;
    document.getElementById('confirm-delete-form').action = deleteUrl;
    document.getElementById('confirm-delete-modal').showModal();
  }
</script>
