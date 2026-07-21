<!DOCTYPE html>
<html>
<head>
    <meta name="layout" content="admin"/>
    <title>Customers — Billing Admin</title>
</head>
<body>

<div class="flex justify-between items-center mb-6">
  <div>
    <h1 class="text-2xl font-bold">Customers</h1>
    <p class="text-base-content/60">${customerCount} customer(s).</p>
  </div>
  <a id="btn-new-customer" href="${createLink(action: 'create')}" class="btn btn-primary btn-sm">New customer</a>
</div>

<!-- Search -->
<g:form action="index" method="get" class="mb-4">
  <div class="flex flex-wrap gap-2 items-end">
    <div class="flex flex-col">
      <span class="text-xs mb-1">Search</span>
      <input id="customer-search" name="q" type="text" value="${q}" placeholder="Name or email" class="input input-sm w-64"/>
    </div>
    <div class="flex flex-col">
      <span class="text-xs mb-1">&nbsp;</span>
      <div class="flex gap-2">
        <button id="btn-customer-search" type="submit" class="btn btn-neutral btn-sm">Search</button>
        <g:if test="${q}"><a href="${createLink(action: 'index')}" class="btn btn-ghost btn-sm">Clear</a></g:if>
      </div>
    </div>
  </div>
</g:form>

<div class="card bg-base-100 border border-base-300">
  <div class="card-body">
    <div class="overflow-x-auto">
      <table id="admin-customers" class="table">
        <thead><tr><th>Name</th><th>Email</th><th>City</th><th>Country</th><th class="text-right">Invoices</th><th></th></tr></thead>
        <tbody>
          <g:each in="${customerList}" var="c">
            <tr id="customer-row-${c.email}">
              <td class="font-medium">${c.name}</td>
              <td>${c.email}</td>
              <td>${c.city}</td>
              <td>${c.country}</td>
              <td class="text-right">${c.invoices?.size() ?: 0}</td>
              <td class="text-right whitespace-nowrap">
                <a href="${createLink(action: 'show', id: c.id)}" class="btn btn-ghost btn-xs">View</a>
                <a id="btn-edit-${c.email}" href="${createLink(action: 'edit', id: c.id)}" class="btn btn-ghost btn-xs">Edit</a>
                <button type="button" id="btn-delete-${c.email}" class="btn btn-ghost btn-xs text-error"
                        onclick="confirmDeleteCustomer('${c.name}', '${createLink(action: 'delete', id: c.id)}')">Delete</button>
              </td>
            </tr>
          </g:each>
          <g:if test="${!customerList}"><tr><td colspan="6" class="text-center text-base-content/50 py-6">No customers found.</td></tr></g:if>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div class="flex flex-wrap items-center justify-between gap-2 mt-4">
      <span id="page-info" class="text-sm text-base-content/60">Page ${page} of ${totalPages} · ${customerCount} customer(s)</span>
      <div class="join">
        <a id="page-first" href="${createLink(action: 'index', params: [q: q, page: 1])}" class="join-item btn btn-sm ${page <= 1 ? 'btn-disabled' : ''}">« First</a>
        <a id="page-prev"  href="${createLink(action: 'index', params: [q: q, page: Math.max(1, page - 1)])}" class="join-item btn btn-sm ${page <= 1 ? 'btn-disabled' : ''}">‹ Prev</a>
        <a id="page-next"  href="${createLink(action: 'index', params: [q: q, page: Math.min(totalPages, page + 1)])}" class="join-item btn btn-sm ${page >= totalPages ? 'btn-disabled' : ''}">Next ›</a>
        <a id="page-last"  href="${createLink(action: 'index', params: [q: q, page: totalPages])}" class="join-item btn btn-sm ${page >= totalPages ? 'btn-disabled' : ''}">Last »</a>
      </div>
    </div>
  </div>
</div>

<g:render template="/confirmDeleteCustomer"/>

</body>
</html>
