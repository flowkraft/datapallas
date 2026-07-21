<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8"/>
    <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
    <meta name="viewport" content="width=device-width, initial-scale=1"/>
    <title><g:layoutTitle default="Billing Portal"/></title>

    <link rel="icon" href="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='m22 2-7 20-4-9-9-4Z' fill='%2322a7c8'/></svg>" type="image/svg+xml"/>

    <!-- No-flash theme -->
    <g:render template="/common/themeInit"/>

    <!-- Tailwind v4 + daisyUI v5 -->
    <asset:stylesheet src="tailwind.css"/>

    <style>
        .dropdown .dropdown-content { display: none; position: absolute; }
        .dropdown:focus-within > .dropdown-content,
        details.dropdown[open] > .dropdown-content { display: flex; flex-direction: column; position: absolute; }
    </style>

    <g:layoutHead/>
</head>
<body class="min-h-screen flex flex-col">

<%-- The public pay link (/portal/pay?token=…) is a checkout opened from an emailed invoice. Whoever
     follows it is not necessarily the logged-in user — an accountant may be paying on a colleague's
     behalf — so it renders chrome-free: brand, support and theme only, no My Account / Logout, and
     no Sign in either. Guarding on session alone is not enough: the session belongs to whoever last
     used this browser, which is why a logged-in visitor was offered "Logout" on a public checkout.
     The Next twin keys off the same route in (portal)/layout.tsx. --%>
<g:set var="publicPay" value="${actionName == 'payByToken'}"/>

<!-- ══ PORTAL NAVBAR ══════════════════════════════════════════════════════════ -->
<header class="bg-base-100/90 text-base-content sticky top-0 z-30 flex h-16 w-full backdrop-blur border-b border-base-300">
  <nav class="navbar w-full py-0 px-4">

    <div class="flex-1 flex items-center gap-4">
      <a href="${createLink(uri: '/portal')}" class="flex items-center gap-2 shrink-0 no-underline">
        <span class="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-primary text-primary-content font-bold text-lg">N</span>
        <span class="text-xl font-bold tracking-tight">Northwind Traders</span>
      </a>

      <g:if test="${session.userId && !publicPay}">
        <ul class="menu menu-horizontal px-1 hidden md:flex">
          <li><a href="${createLink(uri: '/portal')}" class="${controllerName == 'portalHome' ? 'menu-active' : ''}">My Account</a></li>
          <li><a href="${createLink(uri: '/portal/invoices')}" class="${controllerName == 'portalInvoice' ? 'menu-active' : ''}">My Invoices</a></li>
        </ul>
      </g:if>
    </div>

    <div class="flex items-center gap-1">
      <g:if test="${!publicPay}">
        <g:if test="${session.role == 'ADMIN'}">
          <a href="${createLink(uri: '/admin')}" class="btn btn-ghost btn-sm normal-case"><dp:icon name="admin"/> Admin</a>
        </g:if>
        <g:if test="${session.userId}">
          <span id="current-user" class="text-sm text-base-content/60 hidden sm:inline px-2">${session.username}</span>
          <a id="btn-logout" href="${createLink(uri: '/logout')}" class="btn btn-ghost btn-sm normal-case">Logout</a>
        </g:if>
        <g:else>
          <a href="${createLink(uri: '/login')}" class="btn btn-ghost btn-sm normal-case">Sign in</a>
        </g:else>
      </g:if>

      <a href="mailto:billing@northwind.example.com" class="btn btn-ghost btn-sm normal-case gap-1 hidden md:inline-flex" title="Contact support">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"/></svg>
        billing@northwind.example.com
      </a>
      <g:render template="/common/themePicker"/>
    </div>

  </nav>
</header>

<main class="flex-1 p-4">
  <g:layoutBody/>
</main>

<footer class="border-t border-base-300 bg-base-200 text-base-content/60 text-sm py-4 px-4 text-center">
  <span>&copy; 2026 Northwind Traders — Billing Portal</span>
</footer>

<g:render template="/common/setThemeScript"/>

<!-- Flash toast -->
<g:if test="${flash.message || flash.error}">
<div id="flashToast" style="position:fixed;bottom:1.5rem;right:1.5rem;z-index:1090;max-width:24rem;"
     class="alert ${flash.error ? 'alert-error' : 'alert-success'} shadow-lg">
  <span>${flash.message ?: flash.error}</span>
  <button type="button" class="btn btn-ghost btn-xs" onclick="this.closest('#flashToast').remove()">✕</button>
</div>
<script>setTimeout(function(){var t=document.getElementById('flashToast');if(t)t.remove();},3000);</script>
</g:if>

<script>
    document.addEventListener('DOMContentLoaded', function() {
        var current = document.documentElement.getAttribute('data-theme') || 'dark';
        document.querySelectorAll('.theme-checkmark').forEach(function(el) {
            el.style.visibility = el.getAttribute('data-theme-name') === current ? 'visible' : 'hidden';
        });
        var trigger = document.getElementById('themeSwatchTrigger');
        if (trigger) trigger.setAttribute('data-theme', current);
    });
</script>

</body>
</html>
