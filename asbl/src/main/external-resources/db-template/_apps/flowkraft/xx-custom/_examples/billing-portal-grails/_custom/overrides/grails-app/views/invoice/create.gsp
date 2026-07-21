<!DOCTYPE html>
<html>
<head>
    <meta name="layout" content="admin"/>
    <title>New invoice — Billing Admin</title>
</head>
<body>

<div class="max-w-2xl mx-auto">
  <div class="flex justify-between items-center mb-4">
    <h1 class="text-2xl font-bold">New invoice</h1>
    <a href="${createLink(action: 'index')}" class="btn btn-ghost btn-sm">Cancel</a>
  </div>

  <div class="card bg-base-100 border border-base-300">
    <div class="card-body">
      <g:form action="save" method="post">
        <g:render template="form" model="[invoice: invoice]"/>
        <div class="flex justify-end gap-2 mt-4">
          <a href="${createLink(action: 'index')}" class="btn btn-ghost">Cancel</a>
          <button id="btn-save-invoice" type="submit" class="btn btn-primary">Create invoice</button>
        </div>
      </g:form>
    </div>
  </div>
</div>

</body>
</html>
