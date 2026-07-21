<!DOCTYPE html>
<html>
<head>
    <meta name="layout" content="admin"/>
    <title>Edit ${customer.name} — Billing Admin</title>
</head>
<body>

<div class="max-w-2xl mx-auto">
  <div class="flex justify-between items-center mb-4">
    <h1 class="text-2xl font-bold">Edit ${customer.name}</h1>
    <a href="${createLink(action: 'show', id: customer.id)}" class="btn btn-ghost btn-sm">Cancel</a>
  </div>

  <div class="card bg-base-100 border border-base-300">
    <div class="card-body">
      <g:form action="update" id="${customer.id}" method="post">
        <g:render template="form" model="[customer: customer]"/>
        <div class="flex justify-end gap-2 mt-4">
          <a href="${createLink(action: 'show', id: customer.id)}" class="btn btn-ghost">Cancel</a>
          <button id="btn-save-customer" type="submit" class="btn btn-primary">Save changes</button>
        </div>
      </g:form>
    </div>
  </div>
</div>

</body>
</html>
