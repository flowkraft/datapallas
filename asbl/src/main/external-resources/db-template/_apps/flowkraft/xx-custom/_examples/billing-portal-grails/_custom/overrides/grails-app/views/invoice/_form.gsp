<%-- Invoice header form fields. Model: [invoice: Invoice, customers: List<Customer>].

     Layout: every field is `flex flex-col` (label above its control) and every control is `w-full`,
     so all inputs share one left edge and one width inside the 2-column grid.
     Do NOT reach for daisyUI's `form-control` / `label-text` here: this app is on daisyUI 5, which
     REMOVED both. With no rule behind it, `form-control` stops being a flex column, each label falls
     back to inline, and the caption sits BESIDE its input — pushing every input to a different x,
     since each caption is a different width. `input-bordered` / `select-bordered` are gone too (v5
     inputs are bordered by default). Mirrored in the Next twin's InvoiceForm.tsx. --%>
<div class="grid sm:grid-cols-2 gap-4">
  <label class="flex flex-col gap-1">
    <span class="text-sm font-medium">Invoice number</span>
    <input id="invoice-number" name="invoiceNumber" type="text" class="input w-full" required
           value="${invoice.invoiceNumber ?: ''}" placeholder="INV-2026-0001"/>
  </label>

  <div class="flex flex-col gap-1">
    <span class="text-sm font-medium">Customer</span>
    <input type="hidden" id="invoice-customer-id" name="customerId" value="${invoice.customer?.id ?: ''}"/>
    <div class="flex gap-2 items-center">
      <span id="customer-picker-display" class="input flex-1 truncate">${invoice.customer ? invoice.customer.name + ' (' + invoice.customer.email + ')' : '— choose —'}</span>
      <button type="button" id="btn-choose-customer" class="btn btn-neutral shrink-0" onclick="customerPickerOpen()">Choose…</button>
    </div>
  </div>

  <label class="flex flex-col gap-1">
    <span class="text-sm font-medium">Status</span>
    <select id="invoice-status-select" name="status" class="select w-full">
      <g:each in="${['DUE', 'PAID', 'OVERDUE']}" var="s">
        <option value="${s}" ${invoice.status == s ? 'selected' : ''}>${s}</option>
      </g:each>
    </select>
  </label>

  <div></div>

  <label class="flex flex-col gap-1">
    <span class="text-sm font-medium">Invoice date</span>
    <input id="invoice-date" name="invoiceDate" type="date" class="input w-full"
           value="${invoice.invoiceDate ? formatDate(date: invoice.invoiceDate, format: 'yyyy-MM-dd') : ''}"/>
  </label>

  <label class="flex flex-col gap-1">
    <span class="text-sm font-medium">Due date</span>
    <input id="due-date" name="dueDate" type="date" class="input w-full"
           value="${invoice.dueDate ? formatDate(date: invoice.dueDate, format: 'yyyy-MM-dd') : ''}"/>
  </label>

  <label class="flex flex-col gap-1">
    <span class="text-sm font-medium">Subtotal</span>
    <input name="subtotal" type="number" step="0.01" min="0" class="input w-full" value="${invoice.subtotal ?: 0}"/>
  </label>

  <label class="flex flex-col gap-1">
    <span class="text-sm font-medium">Tax</span>
    <input name="tax" type="number" step="0.01" min="0" class="input w-full" value="${invoice.tax ?: 0}"/>
  </label>

  <label class="flex flex-col gap-1">
    <span class="text-sm font-medium">Freight</span>
    <input name="freight" type="number" step="0.01" min="0" class="input w-full" value="${invoice.freight ?: 0}"/>
  </label>
</div>
<p class="text-xs text-base-content/50 mt-2">Total is computed as subtotal + tax + freight. Line items are populated by the DataPallas push.</p>

<!-- Customer picker modal — searchable + paginated; fetches from /admin/customers/search (scales to 1000s) -->
<dialog id="customer-picker-modal" class="modal">
  <div class="modal-box max-w-2xl">
    <h3 class="font-bold text-lg mb-2">Choose customer</h3>
    <input id="customer-picker-search" type="text" placeholder="Search name or email…" class="input w-full mb-3" oninput="customerPickerSearch()"/>
    <!-- Name + email only. City/Country pushed the table past the modal width, so it rendered with a
         horizontal scrollbar — and neither helps you pick: you search by name or email, and the
         email is what identifies the account (the portal upserts customers on it). -->
    <table class="table table-sm">
      <thead><tr><th>Name</th><th>Email</th><th></th></tr></thead>
      <tbody id="customer-picker-results"></tbody>
    </table>
    <div class="flex flex-wrap items-center justify-between gap-2 mt-3">
      <span id="customer-picker-info" class="text-sm text-base-content/60"></span>
      <div class="join">
        <button type="button" id="customer-picker-first" class="join-item btn btn-sm" onclick="customerPickerGo(1)">« First</button>
        <button type="button" id="customer-picker-prev"  class="join-item btn btn-sm" onclick="customerPickerGo(customerPickerState.page - 1)">‹ Prev</button>
        <button type="button" id="customer-picker-next"  class="join-item btn btn-sm" onclick="customerPickerGo(customerPickerState.page + 1)">Next ›</button>
        <button type="button" id="customer-picker-last"  class="join-item btn btn-sm" onclick="customerPickerGo(customerPickerState.totalPages)">Last »</button>
      </div>
    </div>
    <div class="modal-action">
      <button type="button" id="customer-picker-close" class="btn" onclick="document.getElementById('customer-picker-modal').close()">Cancel</button>
    </div>
  </div>
  <!-- Click-outside-to-close. daisyUI's stock backdrop is a "form method=dialog" element, rewritten
       here as a plain button ON PURPOSE: this partial renders INSIDE the invoice form, and HTML
       forbids nested forms — the parser ignores the inner start tag but lets its end tag close the
       OUTER form, which orphans everything after the modal (including #btn-save-invoice). An orphaned
       submit button fails silently: the click fires, no form submits, nothing navigates. type="button"
       is required too, or this backdrop would submit the invoice form instead of closing the dialog. -->
  <button type="button" class="modal-backdrop"
          onclick="document.getElementById('customer-picker-modal').close()">close</button>
</dialog>

<script>
  var customerPickerState = { page: 1, totalPages: 1, q: '' };
  var customerPickerTimer = null;

  function customerPickerOpen() {
    document.getElementById('customer-picker-search').value = '';
    customerPickerState.q = '';
    customerPickerGo(1);
    document.getElementById('customer-picker-modal').showModal();
  }

  function customerPickerSearch() {
    clearTimeout(customerPickerTimer);
    customerPickerTimer = setTimeout(function () {
      customerPickerState.q = document.getElementById('customer-picker-search').value;
      customerPickerGo(1);
    }, 250);
  }

  function customerPickerGo(page) {
    if (page < 1) page = 1;
    var url = '${createLink(controller: 'customer', action: 'search')}?q=' +
      encodeURIComponent(customerPickerState.q) + '&page=' + page;
    fetch(url).then(function (r) { return r.json(); }).then(function (d) {
      customerPickerState.page = d.page;
      customerPickerState.totalPages = d.totalPages;
      var tb = document.getElementById('customer-picker-results');
      tb.innerHTML = '';
      if (!d.customers.length) {
        tb.innerHTML = '<tr><td colspan="3" class="text-center text-base-content/50 py-4">No customers found.</td></tr>';
      } else {
        d.customers.forEach(function (c) {
          var tr = document.createElement('tr');
          tr.innerHTML = '<td class="font-medium"></td><td></td><td class="text-right"></td>';
          tr.children[0].textContent = c.name;
          tr.children[1].textContent = c.email;
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.id = 'customer-picker-select-' + c.email;
          btn.className = 'btn btn-primary btn-xs';
          btn.textContent = 'Select';
          btn.onclick = function () { customerPickerSelect(c.id, c.name, c.email); };
          tr.children[2].appendChild(btn);
          tb.appendChild(tr);
        });
      }
      document.getElementById('customer-picker-info').textContent =
        'Page ' + d.page + ' of ' + d.totalPages + ' · ' + d.total + ' customer(s)';
      document.getElementById('customer-picker-first').disabled = d.page <= 1;
      document.getElementById('customer-picker-prev').disabled = d.page <= 1;
      document.getElementById('customer-picker-next').disabled = d.page >= d.totalPages;
      document.getElementById('customer-picker-last').disabled = d.page >= d.totalPages;
    });
  }

  function customerPickerSelect(id, name, email) {
    document.getElementById('invoice-customer-id').value = id;
    document.getElementById('customer-picker-display').textContent = name + ' (' + email + ')';
    document.getElementById('customer-picker-modal').close();
  }
</script>
