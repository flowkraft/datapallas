<!DOCTYPE html>
<html>
<head>
    <%-- Card-only layout (no nav / footer / theme switcher), mirroring the Next /login page, which
         uses the minimal ROOT layout rather than the portal chrome. --%>
    <meta name="layout" content="login"/>
    <title>Sign In — Billing Portal</title>
</head>
<body>

<div class="min-h-screen flex justify-center items-start pt-10 p-4">
  <div class="card bg-base-100 border border-base-300 shadow-lg w-full max-w-sm">
    <div class="card-body">
      <h2 class="card-title justify-center mb-1"><span class="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-primary text-primary-content font-bold">N</span> Northwind Traders</h2>
      <p class="text-base-content/60 text-sm text-center mb-4">Sign in to view and pay your invoices</p>

      <g:if test="${flash.notice}">
        <div class="alert alert-soft text-sm mb-3">${flash.notice}</div>
      </g:if>
      <g:if test="${flash.error}">
        <div id="login-error" class="alert alert-soft alert-error text-sm mb-3">${flash.error}</div>
      </g:if>

      <form action="${createLink(controller: 'login', action: 'authenticate')}" method="post">
        <label class="form-control w-full mb-3">
          <span class="label-text mb-1">Username</span>
          <input id="login-username" name="username" type="text" autocomplete="username"
                 class="input input-bordered w-full" placeholder="you@example.com" required/>
        </label>
        <label class="form-control w-full mb-4">
          <span class="label-text mb-1">Password</span>
          <input id="login-password" name="password" type="password" autocomplete="current-password"
                 class="input input-bordered w-full" placeholder="••••••••" required/>
        </label>
        <button id="btn-login" type="submit" class="btn btn-primary w-full">Sign In</button>
      </form>

      <div class="divider text-xs text-base-content/50 my-4">demo logins</div>
      <div class="text-xs text-base-content/60 space-y-1">
        <div><span class="badge badge-outline badge-sm">admin</span> <code>admin</code> / <code>admin123</code></div>
        <div><span class="badge badge-outline badge-sm">customer</span> <code>alice@demo.io</code> · <code>bob@demo.io</code> · <code>carol@demo.io</code> / <code>demo1234</code></div>
      </div>
    </div>
  </div>
</div>

</body>
</html>
