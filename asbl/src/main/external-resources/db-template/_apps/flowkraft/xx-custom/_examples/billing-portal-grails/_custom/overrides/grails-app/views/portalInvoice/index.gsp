<!DOCTYPE html>
<html>
<head>
    <meta name="layout" content="portal"/>
    <title>My Invoices — Billing Portal</title>
</head>
<body>

<div class="max-w-5xl mx-auto">
  <div class="mb-6">
    <h1 class="text-2xl font-bold">My Invoices</h1>
    <p class="text-base-content/60">View, pay, and track your invoices.</p>
  </div>

  <div class="card bg-base-100 border border-base-300">
    <div class="card-body">
      <div class="overflow-x-auto">
        <table id="invoice-list" class="table">
          <thead>
            <tr><th>Invoice</th><th>Issued</th><th>Due</th><th>Status</th><th class="text-right">Total</th><th></th></tr>
          </thead>
          <tbody>
            <g:each in="${invoiceList}" var="inv">
              <tr id="invoice-row-${inv.invoiceNumber}">
                <td class="font-medium">${inv.invoiceNumber}</td>
                <td><g:formatDate date="${inv.invoiceDate}" format="MMM dd, yyyy"/></td>
                <td class="${inv.status == 'OVERDUE' ? 'text-error font-medium' : ''}"><g:formatDate date="${inv.dueDate}" format="MMM dd, yyyy"/></td>
                <td><span id="invoice-status-${inv.invoiceNumber}" class="badge ${inv.statusBadgeClass}">${inv.status}</span></td>
                <td class="text-right font-semibold"><g:formatNumber number="${inv.total}" type="currency" currencyCode="USD"/></td>
                <td class="text-right">
                  <a id="btn-view-${inv.invoiceNumber}" href="${createLink(action: 'show', id: inv.id)}" class="btn btn-ghost btn-xs">View</a>
                  <g:if test="${inv.payable}">
                    <a id="btn-pay-${inv.invoiceNumber}" href="${createLink(action: 'pay', id: inv.id)}" class="btn btn-primary btn-xs">Pay</a>
                  </g:if>
                </td>
              </tr>
            </g:each>
            <g:if test="${!invoiceList}">
              <tr><td colspan="6" class="text-center text-base-content/50 py-6">You have no invoices yet.</td></tr>
            </g:if>
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div class="flex flex-wrap items-center justify-between gap-2 mt-4">
        <span id="page-info" class="text-sm text-base-content/60">Page ${page} of ${totalPages} · ${invoiceCount} invoice(s)</span>
        <div class="join">
          <a id="page-first" href="${createLink(action: 'index', params: [page: 1])}" class="join-item btn btn-sm ${page <= 1 ? 'btn-disabled' : ''}">« First</a>
          <a id="page-prev"  href="${createLink(action: 'index', params: [page: Math.max(1, page - 1)])}" class="join-item btn btn-sm ${page <= 1 ? 'btn-disabled' : ''}">‹ Prev</a>
          <a id="page-next"  href="${createLink(action: 'index', params: [page: Math.min(totalPages, page + 1)])}" class="join-item btn btn-sm ${page >= totalPages ? 'btn-disabled' : ''}">Next ›</a>
          <a id="page-last"  href="${createLink(action: 'index', params: [page: totalPages])}" class="join-item btn btn-sm ${page >= totalPages ? 'btn-disabled' : ''}">Last »</a>
        </div>
      </div>
    </div>
  </div>
</div>

</body>
</html>
