<!DOCTYPE html>
<%-- Standalone 404 page — NO layout, so it never pulls in the blueprint's analytics nav. --%>
<html lang="en">
<head>
    <meta charset="UTF-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1"/>
    <title>Not found — Billing Portal</title>
    <g:render template="/common/themeInit"/>
    <asset:stylesheet src="tailwind.css"/>
</head>
<body class="min-h-screen flex items-center justify-center bg-base-200 p-4">
  <div class="card bg-base-100 border border-base-300 max-w-md w-full">
    <div class="card-body text-center">
      <div class="flex items-center justify-center gap-2 mb-2">
        <span class="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-primary text-primary-content font-bold text-lg">N</span>
        <span class="text-xl font-bold tracking-tight">Northwind Traders</span>
      </div>
      <h1 class="text-lg font-semibold">Page not found</h1>
      <p class="text-base-content/60 text-sm">The page you're looking for doesn't exist.</p>
      <div class="mt-4"><a href="${createLink(uri: '/')}" class="btn btn-primary btn-sm">Back to portal</a></div>
    </div>
  </div>
</body>
</html>
