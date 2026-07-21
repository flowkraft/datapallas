<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8"/>
    <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
    <meta name="viewport" content="width=device-width, initial-scale=1"/>
    <title><g:layoutTitle default="Billing Admin"/></title>

    <link rel="icon" href="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='m22 2-7 20-4-9-9-4Z' fill='%2322a7c8'/></svg>" type="image/svg+xml"/>

    <g:render template="/common/themeInit"/>
    <asset:stylesheet src="tailwind.css"/>

    <style>
        :root { --sidebar-w: 256px; --header-h: 64px;
            --app-sidebar-bg: var(--color-base-200); --app-sidebar-border: var(--color-base-300); }
        html.admin-sidebar-closed { --sidebar-w: 0px; }
        .dropdown .dropdown-content { display: none; position: absolute; }
        .dropdown:focus-within > .dropdown-content,
        details.dropdown[open] > .dropdown-content { display: flex; flex-direction: column; position: absolute; }
    </style>

    <g:layoutHead/>
</head>
<body>

<!-- ══ ADMIN HEADER ═══════════════════════════════════════════════════════════ -->
<header style="position:fixed;top:0;left:0;right:0;z-index:50;" class="bg-base-100/90 text-base-content flex h-16 w-full backdrop-blur border-b border-base-300">
  <nav class="navbar w-full py-0 px-4">
    <div class="flex flex-1 items-center gap-4">
      <button type="button" onclick="toggleAdminSidebar()" class="btn btn-square btn-ghost" aria-label="Toggle sidebar">
        <dp:icon name="hamburger" class="inline-block h-5 w-5 stroke-current"/>
      </button>
      <a href="${createLink(uri: '/admin')}" class="flex items-center gap-2 shrink-0 no-underline">
        <span class="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-primary text-primary-content font-bold text-lg">N</span>
        <span class="text-xl font-bold tracking-tight">Northwind Traders <span class="text-base-content/50 font-normal">Admin</span></span>
      </a>
    </div>
    <div class="flex items-center gap-1">
      <a href="${createLink(uri: '/portal')}" class="btn btn-ghost btn-sm normal-case"><dp:icon name="portal"/> Portal</a>
      <g:if test="${session.userId}">
        <span id="current-user" class="text-sm text-base-content/60 hidden sm:inline px-2">${session.username}</span>
        <a id="btn-logout" href="${createLink(uri: '/logout')}" class="btn btn-ghost btn-sm normal-case">Logout</a>
      </g:if>
      <a href="mailto:billing@northwind.example.com" class="btn btn-ghost btn-sm normal-case gap-1 hidden md:inline-flex" title="Contact support">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"/></svg>
        billing@northwind.example.com
      </a>
      <g:render template="/common/themePicker"/>
    </div>
  </nav>
</header>

<!-- ══ ADMIN SIDEBAR ══════════════════════════════════════════════════════════ -->
<aside id="adminSidebar" style="position:fixed;top:64px;left:0;bottom:0;width:var(--sidebar-w);overflow-x:hidden;overflow-y:auto;transition:width 0.2s ease;display:flex;flex-direction:column;background-color:var(--app-sidebar-bg);border-right:1px solid var(--app-sidebar-border);z-index:40;">
  <nav class="flex-1 py-2">
    <ul class="menu w-full py-0">
      <li class="menu-title">Billing</li>
      <li><a id="adminNavDashboard" href="${createLink(controller: 'admin', action: 'index')}" class="${controllerName == 'admin' ? 'menu-active' : ''}"><dp:icon name="dashboard"/><span>Dashboard</span></a></li>
      <li><a id="adminNavInvoices" href="${createLink(controller: 'invoice', action: 'index')}" class="${controllerName == 'invoice' ? 'menu-active' : ''}"><dp:icon name="invoice"/><span>Invoices</span></a></li>
      <li><a id="adminNavCustomers" href="${createLink(controller: 'customer', action: 'index')}" class="${controllerName == 'customer' ? 'menu-active' : ''}"><dp:icon name="admin"/><span>Customers</span></a></li>
    </ul>
  </nav>
</aside>

<!-- ══ MAIN ═══════════════════════════════════════════════════════════════════ -->
<div id="adminMain" style="margin-left:var(--sidebar-w);margin-top:64px;transition:margin-left 0.2s ease;min-height:calc(100vh - 64px);display:flex;flex-direction:column;">
  <main class="flex-1 p-6">
    <g:layoutBody/>
  </main>
  <footer class="border-t border-base-300 bg-base-200 text-base-content/60 text-sm py-4 px-6">
    <span>&copy; 2026 Northwind Traders — Billing Admin</span>
  </footer>
</div>

<g:render template="/common/setThemeScript"/>

<script>
    function toggleAdminSidebar() {
        document.documentElement.classList.toggle('admin-sidebar-closed');
        localStorage.setItem('rb-admin-sidebar', document.documentElement.classList.contains('admin-sidebar-closed') ? 'closed' : 'open');
    }
    document.addEventListener('DOMContentLoaded', function() {
        if (localStorage.getItem('rb-admin-sidebar') === 'closed') document.documentElement.classList.add('admin-sidebar-closed');
        var current = document.documentElement.getAttribute('data-theme') || 'dark';
        document.querySelectorAll('.theme-checkmark').forEach(function(el) {
            el.style.visibility = el.getAttribute('data-theme-name') === current ? 'visible' : 'hidden';
        });
        var trigger = document.getElementById('themeSwatchTrigger');
        if (trigger) trigger.setAttribute('data-theme', current);
    });
</script>

<g:if test="${flash.message || flash.error}">
<div id="flashToast" style="position:fixed;bottom:1.5rem;right:1.5rem;z-index:1090;max-width:24rem;"
     class="alert ${flash.error ? 'alert-error' : 'alert-success'} shadow-lg">
  <span>${flash.message ?: flash.error}</span>
  <button type="button" class="btn btn-ghost btn-xs" onclick="this.closest('#flashToast').remove()">✕</button>
</div>
<script>setTimeout(function(){var t=document.getElementById('flashToast');if(t)t.remove();},3000);</script>
</g:if>

</body>
</html>
