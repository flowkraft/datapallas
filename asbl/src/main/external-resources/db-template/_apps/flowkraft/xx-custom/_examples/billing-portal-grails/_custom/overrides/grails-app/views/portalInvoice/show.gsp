<!DOCTYPE html>
<html>
<head>
    <meta name="layout" content="portal"/>
    <title>${invoice.invoiceNumber} — Billing Portal</title>
</head>
<body>

<div class="max-w-3xl mx-auto">
  <div class="flex justify-between items-center mb-4">
    <a href="${createLink(action: 'index')}" class="btn btn-ghost btn-sm">← My Invoices</a>
    <g:if test="${invoice.payable}">
      <a href="${createLink(action: 'pay', id: invoice.id)}" class="btn btn-primary btn-sm">Pay Now</a>
    </g:if>
    <g:else>
      <span class="badge badge-soft badge-success badge-lg">Paid</span>
    </g:else>
  </div>

  <g:render template="/invoiceDocument" model="[invoice: invoice]"/>
</div>

</body>
</html>
