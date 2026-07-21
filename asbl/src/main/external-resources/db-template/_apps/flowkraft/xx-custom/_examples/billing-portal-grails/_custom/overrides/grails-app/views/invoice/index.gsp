<!DOCTYPE html>
<html>
<head>
    <meta name="layout" content="admin"/>
    <title>Invoices — Billing Admin</title>
</head>
<body>

<div class="flex justify-between items-center mb-6">
  <div>
    <h1 class="text-2xl font-bold">Invoices</h1>
    <p class="text-base-content/60">${invoiceCount} invoice(s).</p>
  </div>
  <a id="btn-new-invoice" href="${createLink(action: 'create')}" class="btn btn-primary btn-sm">New invoice</a>
</div>

<!-- Search / filter -->
<g:form action="index" method="get" class="mb-4">
  <div class="flex flex-wrap gap-2 items-end">
    <div class="flex flex-col">
      <span class="text-xs mb-1">Search</span>
      <input id="invoice-search" name="q" type="text" value="${q}" placeholder="Invoice # or customer"
             class="input input-sm w-64"/>
    </div>
    <div class="flex flex-col">
      <span class="text-xs mb-1">Status</span>
      <select id="invoice-status-filter" name="status" class="select select-sm">
        <option value="" ${status ? '' : 'selected'}>All statuses</option>
        <option value="OVERDUE" ${status == 'OVERDUE' ? 'selected' : ''}>Overdue</option>
        <option value="DUE" ${status == 'DUE' ? 'selected' : ''}>Due</option>
        <option value="PAID" ${status == 'PAID' ? 'selected' : ''}>Paid</option>
      </select>
    </div>
    <div class="flex flex-col">
      <span class="text-xs mb-1">&nbsp;</span>
      <div class="flex gap-2">
        <button id="btn-invoice-search" type="submit" class="btn btn-neutral btn-sm">Search</button>
        <g:if test="${q || status}">
          <a href="${createLink(action: 'index')}" class="btn btn-ghost btn-sm">Clear</a>
        </g:if>
      </div>
    </div>
  </div>
</g:form>

<div class="card bg-base-100 border border-base-300">
  <div class="card-body">
    <div class="overflow-x-auto">
      <table id="admin-invoices" class="table">
        <thead><tr><th>Invoice</th><th>Customer</th><th>Issued</th><th>Due</th><th>Status</th><th class="text-right">Total</th><th></th></tr></thead>
        <tbody>
          <g:each in="${invoiceList}" var="inv">
            <tr id="invoice-row-${inv.invoiceNumber}">
              <td class="font-medium">${inv.invoiceNumber}</td>
              <td>${inv.customer?.name}</td>
              <td><g:formatDate date="${inv.invoiceDate}" format="MMM dd, yyyy"/></td>
              <td><g:formatDate date="${inv.dueDate}" format="MMM dd, yyyy"/></td>
              <td><span id="invoice-status-${inv.invoiceNumber}" class="badge ${inv.statusBadgeClass}">${inv.status}</span></td>
              <td class="text-right font-semibold"><g:formatNumber number="${inv.total}" type="currency" currencyCode="USD"/></td>
              <td class="text-right whitespace-nowrap">
                <a href="${createLink(action: 'show', id: inv.id)}" class="btn btn-ghost btn-xs">View</a>
                <a id="btn-edit-${inv.invoiceNumber}" href="${createLink(action: 'edit', id: inv.id)}" class="btn btn-ghost btn-xs">Edit</a>
                <button type="button" id="btn-delete-${inv.invoiceNumber}" class="btn btn-ghost btn-xs text-error"
                        onclick="confirmDeleteInvoice('${inv.invoiceNumber}', '${createLink(action: 'delete', id: inv.id)}')">Delete</button>
              </td>
            </tr>
          </g:each>
          <g:if test="${!invoiceList}"><tr><td colspan="7" class="text-center text-base-content/50 py-6">No invoices found.</td></tr></g:if>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div class="flex flex-wrap items-center justify-between gap-2 mt-4">
      <span id="page-info" class="text-sm text-base-content/60">Page ${page} of ${totalPages} · ${invoiceCount} invoice(s)</span>
      <div class="join">
        <a id="page-first" href="${createLink(action: 'index', params: [q: q, status: status, page: 1])}" class="join-item btn btn-sm ${page <= 1 ? 'btn-disabled' : ''}">« First</a>
        <a id="page-prev"  href="${createLink(action: 'index', params: [q: q, status: status, page: Math.max(1, page - 1)])}" class="join-item btn btn-sm ${page <= 1 ? 'btn-disabled' : ''}">‹ Prev</a>
        <a id="page-next"  href="${createLink(action: 'index', params: [q: q, status: status, page: Math.min(totalPages, page + 1)])}" class="join-item btn btn-sm ${page >= totalPages ? 'btn-disabled' : ''}">Next ›</a>
        <a id="page-last"  href="${createLink(action: 'index', params: [q: q, status: status, page: totalPages])}" class="join-item btn btn-sm ${page >= totalPages ? 'btn-disabled' : ''}">Last »</a>
      </div>
    </div>
  </div>
</div>

<g:render template="/confirmDeleteInvoice"/>

</body>
</html>
