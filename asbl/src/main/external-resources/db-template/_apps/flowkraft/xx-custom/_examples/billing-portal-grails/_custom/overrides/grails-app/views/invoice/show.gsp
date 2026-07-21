<!DOCTYPE html>
<html>
<head>
    <meta name="layout" content="admin"/>
    <title>${invoice.invoiceNumber} — Billing Admin</title>
</head>
<body>

<div class="max-w-3xl mx-auto">
  <div class="flex flex-wrap justify-between items-center gap-2 mb-4">
    <a href="${createLink(action: 'index')}" class="btn btn-ghost btn-sm">← Invoices</a>
    <div class="flex gap-2">
      <a href="${createLink(action: 'edit', id: invoice.id)}" class="btn btn-outline btn-sm">Edit</a>
      <g:if test="${invoice.payable}">
        <g:form action="markPaid" id="${invoice.id}" method="post" class="inline">
          <button type="submit" class="btn btn-success btn-sm">Mark paid</button>
        </g:form>
      </g:if>
      <%-- The same confirmation the list uses. It used to be a native confirm(), which asked in a
           different voice on the same action in the same app. --%>
      <button type="button" id="btn-delete-${invoice.invoiceNumber}" class="btn btn-error btn-outline btn-sm"
              onclick="confirmDeleteInvoice('${invoice.invoiceNumber}', '${createLink(action: 'delete', id: invoice.id)}')">Delete</button>
    </div>
  </div>

  <g:render template="/invoiceDocument" model="[invoice: invoice]"/>
</div>

<g:render template="/confirmDeleteInvoice"/>

</body>
</html>
