<!DOCTYPE html>
<html>
<head>
    <meta name="layout" content="portal"/>
    <title>My Account — Billing Portal</title>
</head>
<body>

<div class="max-w-5xl mx-auto">

  <div class="mb-6">
    <h1 class="text-2xl font-bold">Welcome, ${customer?.name ?: 'Customer'}</h1>
    <p class="text-base-content/60">Here's an overview of your account.</p>
  </div>

  <!-- Summary stats -->
  <div class="stats stats-vertical sm:stats-horizontal w-full mb-6 border border-base-300">
    <div class="stat">
      <div class="stat-title">Outstanding</div>
      <div class="stat-value text-primary"><g:formatNumber number="${outstanding}" type="currency" currencyCode="USD"/></div>
      <div class="stat-desc">${dueCount + overdueCount} unpaid invoice(s)</div>
    </div>
    <div class="stat">
      <div class="stat-title">Paid</div>
      <div class="stat-value">${paidCount}</div>
    </div>
    <div class="stat">
      <div class="stat-title">Due</div>
      <div class="stat-value">${dueCount}</div>
    </div>
    <div class="stat">
      <div class="stat-title">Overdue</div>
      <div class="stat-value">${overdueCount}</div>
    </div>
  </div>

  <!-- Invoice list -->
  <div class="card bg-base-100 border border-base-300">
    <div class="card-body">
      <div class="flex justify-between items-center mb-2">
        <h2 class="card-title">My Invoices</h2>
        <a href="${createLink(uri: '/portal/invoices')}" class="btn btn-ghost btn-sm">View all</a>
      </div>
      <div class="overflow-x-auto">
        <table id="invoice-list" class="table">
          <thead>
            <tr><th>Invoice</th><th>Issued</th><th>Due</th><th>Status</th><th class="text-right">Total</th><th></th></tr>
          </thead>
          <tbody>
            <g:each in="${invoices}" var="inv">
              <tr id="invoice-row-${inv.invoiceNumber}">
                <td class="font-medium">${inv.invoiceNumber}</td>
                <td><g:formatDate date="${inv.invoiceDate}" format="MMM dd, yyyy"/></td>
                <td><g:formatDate date="${inv.dueDate}" format="MMM dd, yyyy"/></td>
                <td><span id="invoice-status-${inv.invoiceNumber}" class="badge ${inv.statusBadgeClass}">${inv.status}</span></td>
                <td class="text-right font-semibold"><g:formatNumber number="${inv.total}" type="currency" currencyCode="USD"/></td>
                <td class="text-right">
                  <a href="${createLink(action: 'show', controller: 'portalInvoice', id: inv.id)}" class="btn btn-ghost btn-xs">View</a>
                  <g:if test="${inv.payable}">
                    <a href="${createLink(action: 'pay', controller: 'portalInvoice', id: inv.id)}" class="btn btn-primary btn-xs">Pay</a>
                  </g:if>
                </td>
              </tr>
            </g:each>
            <g:if test="${!invoices}">
              <tr><td colspan="6" class="text-center text-base-content/50 py-6">No invoices yet.</td></tr>
            </g:if>
          </tbody>
        </table>
      </div>
    </div>
  </div>

</div>

</body>
</html>
