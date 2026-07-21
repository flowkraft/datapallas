<!DOCTYPE html>
<html>
<head>
    <meta name="layout" content="admin"/>
    <title>Dashboard — Billing Admin</title>
</head>
<body>

<div class="mb-6">
  <h1 class="text-2xl font-bold">Dashboard</h1>
  <p class="text-base-content/60">Billing overview.</p>
</div>

<div class="stats stats-vertical sm:stats-horizontal w-full mb-6 border border-base-300">
  <div class="stat"><div class="stat-title">Invoices</div><div id="admin-invoice-count" class="stat-value">${invoiceCount}</div></div>
  <div class="stat"><div class="stat-title">Customers</div><div id="admin-customer-count" class="stat-value">${customerCount}</div></div>
  <div class="stat"><div class="stat-title">Paid</div><div id="admin-paid-count" class="stat-value">${paidCount}</div></div>
  <div class="stat"><div class="stat-title">Due</div><div id="admin-due-count" class="stat-value">${dueCount}</div></div>
  <div class="stat"><div class="stat-title">Overdue</div><div id="admin-overdue-count" class="stat-value">${overdueCount}</div></div>
</div>

<div class="card bg-base-100 border border-base-300">
  <div class="card-body">
    <div class="flex justify-between items-center mb-2">
      <h2 class="card-title">Recent invoices</h2>
      <div class="flex gap-2">
        <a href="${createLink(controller: 'invoice', action: 'index')}" class="btn btn-ghost btn-sm">All invoices</a>
        <a id="btn-new-invoice" href="${createLink(controller: 'invoice', action: 'create')}" class="btn btn-primary btn-sm">New invoice</a>
      </div>
    </div>
    <div class="overflow-x-auto">
      <table class="table">
        <thead><tr><th>Invoice</th><th>Customer</th><th>Due</th><th>Status</th><th class="text-right">Total</th></tr></thead>
        <tbody>
          <g:each in="${recent}" var="inv">
            <tr class="hover cursor-pointer" onclick="window.location='${createLink(controller: 'invoice', action: 'show', id: inv.id)}'">
              <td class="font-medium">${inv.invoiceNumber}</td>
              <td>${inv.customer?.name}</td>
              <td><g:formatDate date="${inv.dueDate}" format="MMM dd, yyyy"/></td>
              <td><span class="badge ${inv.statusBadgeClass}">${inv.status}</span></td>
              <td class="text-right font-semibold"><g:formatNumber number="${inv.total}" type="currency" currencyCode="USD"/></td>
            </tr>
          </g:each>
          <g:if test="${!recent}"><tr><td colspan="5" class="text-center text-base-content/50 py-6">No invoices yet.</td></tr></g:if>
        </tbody>
      </table>
    </div>
  </div>
</div>

</body>
</html>
