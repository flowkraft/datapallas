<!DOCTYPE html>
<html>
<head>
    <meta name="layout" content="admin"/>
    <title>${customer.name} — Billing Admin</title>
</head>
<body>

<div class="max-w-4xl mx-auto">
  <div class="flex flex-wrap justify-between items-center gap-2 mb-4">
    <a href="${createLink(action: 'index')}" class="btn btn-ghost btn-sm">← Customers</a>
    <div class="flex gap-2">
      <a id="btn-edit-${customer.email}" href="${createLink(action: 'edit', id: customer.id)}" class="btn btn-outline btn-sm">Edit</a>
      <%-- Its own little POST form, sitting at the page's top level — NOT nested inside another
           form, which is invalid HTML: the parser would close the OUTER form at this one's end tag
           and silently orphan everything after it. Same idiom as invoice/show.gsp's "Mark paid". --%>
      <g:form action="resetPassword" id="${customer.id}" method="post" class="inline">
        <button type="submit" id="btn-reset-password-${customer.email}" class="btn btn-outline btn-sm">Reset password</button>
      </g:form>
      <button type="button" id="btn-delete-${customer.email}" class="btn btn-error btn-outline btn-sm"
              onclick="confirmDeleteCustomer('${customer.name}', '${createLink(action: 'delete', id: customer.id)}')">Delete</button>
    </div>
  </div>

  <div class="card bg-base-100 border border-base-300 mb-6">
    <div class="card-body">
      <h1 class="card-title">${customer.name}</h1>
      <div class="text-base-content/70">${customer.email}</div>
      <div class="text-base-content/70"><g:if test="${customer.city}">${customer.city}</g:if><g:if test="${customer.country}">, ${customer.country}</g:if></div>
    </div>
  </div>

  <div class="card bg-base-100 border border-base-300">
    <div class="card-body">
      <h2 class="card-title mb-2">Invoices</h2>
      <div class="overflow-x-auto">
        <table class="table">
          <thead><tr><th>Invoice</th><th>Due</th><th>Status</th><th class="text-right">Total</th><th></th></tr></thead>
          <tbody>
            <g:each in="${invoices}" var="inv">
              <tr>
                <td class="font-medium">${inv.invoiceNumber}</td>
                <td><g:formatDate date="${inv.dueDate}" format="MMM dd, yyyy"/></td>
                <td><span class="badge ${inv.statusBadgeClass}">${inv.status}</span></td>
                <td class="text-right font-semibold"><g:formatNumber number="${inv.total}" type="currency" currencyCode="USD"/></td>
                <td class="text-right"><a href="${createLink(controller: 'invoice', action: 'show', id: inv.id)}" class="btn btn-ghost btn-xs">View</a></td>
              </tr>
            </g:each>
            <g:if test="${!invoices}"><tr><td colspan="5" class="text-center text-base-content/50 py-6">No invoices.</td></tr></g:if>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</div>

<g:render template="/confirmDeleteCustomer"/>

</body>
</html>
