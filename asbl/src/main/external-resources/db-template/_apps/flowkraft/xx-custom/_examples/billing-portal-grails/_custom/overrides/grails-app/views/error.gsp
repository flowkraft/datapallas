<!DOCTYPE html>
<%-- Standalone error page — NO layout, so a 500 never pulls in the blueprint's analytics nav. --%>
<html lang="en">
<head>
    <meta charset="UTF-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1"/>
    <title>Error — Billing Portal</title>
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
      <h1 class="text-lg font-semibold">Something went wrong</h1>
      <p class="text-base-content/60 text-sm">An unexpected error occurred. Please try again, or contact support.</p>
      <div class="mt-4 flex justify-center gap-2">
        <a href="${createLink(uri: '/')}" class="btn btn-primary btn-sm">Back to portal</a>
        <a href="mailto:billing@northwind.example.com" class="btn btn-ghost btn-sm">Contact support</a>
      </div>
    </div>
  </div>
</body>
</html>
