<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8"/>
    <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
    <meta name="viewport" content="width=device-width, initial-scale=1"/>
    <title><g:layoutTitle default="Admin — DataPallas"/></title>

    <!-- Favicon - DataPallas paper plane icon -->
    <link rel="icon" href="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='m22 2-7 20-4-9-9-4Z' fill='%2322a7c8'/></svg>" type="image/svg+xml"/>

    <!-- No-flash theme: apply from localStorage cache immediately, then sync from SQLite -->
    <g:render template="/common/themeInit"/>

    <!-- DataPallas runtime config (Groovy interpolation — do NOT remove) -->
    <%@ page import="flowkraft.frend.RbUtils" %>
    <script>
        window.rbConfig = {
            apiBaseUrl: '${RbUtils.apiBaseUrl}',
            apiKey: '${RbUtils.apiKey}'
        };
    </script>

    <!-- Tailwind v4 + daisyUI v5 (pre-compiled via npm run css:build) -->
    <asset:stylesheet src="tailwind.css"/>

    <style>
        :root {
            --sidebar-w: 256px;
            --header-h: 64px;
            --app-sidebar-bg: var(--color-base-200);
            --app-sidebar-border: var(--color-base-300);
            --app-sidebar-active-bg: var(--color-primary);
        }
        html.admin-sidebar-closed { --sidebar-w: 0px; }

        /* daisyUI v5 dropdown specificity fix */
        .dropdown .dropdown-content { display: none; position: absolute; }
        .dropdown:focus-within > .dropdown-content,
        details.dropdown[open] > .dropdown-content { display: flex; flex-direction: column; position: absolute; }
    </style>

    <g:layoutHead/>
</head>
<body>

<!-- ══ ADMIN HEADER (full-width, fixed at top) ════════════════════════════════ -->
<header style="position:fixed;top:0;left:0;right:0;z-index:50;" class="bg-base-100/90 text-base-content flex h-16 w-full backdrop-blur border-b border-base-300">
  <nav class="navbar w-full py-0 px-4">

    <!-- Left: hamburger + brand -->
    <div class="flex flex-1 items-center gap-4">
      <button type="button" onclick="toggleAdminSidebar()" class="btn btn-square btn-ghost" aria-label="Toggle sidebar">
        <dp:icon name="hamburger" class="inline-block h-5 w-5 stroke-current"/>
      </button>
      <a href="${createLink(uri: '/admin')}" class="flex items-center gap-2 shrink-0 no-underline">
        <span class="logo-lg flex items-center gap-1">
          <span class="brand-wordmark text-2xl tracking-tight"><span class="brand-data">Data</span><span class="brand-pallas">Pallas</span></span>
          <dp:brandLogo/>
        </span>
      </a>
    </div>

    <!-- Right: cross-area links + support email + theme picker -->
    <div class="flex items-center gap-1">
      <a href="${createLink(uri: '/')}" class="btn btn-ghost btn-sm normal-case">
        <dp:icon name="analytics"/> Analytics
      </a>
      <a href="${createLink(uri: '/portal')}" class="btn btn-ghost btn-sm normal-case">
        <dp:icon name="portal"/> Self-Service Portal
      </a>
      <a href="mailto:support@datapallas.com" class="btn btn-ghost btn-sm normal-case gap-1">
        <dp:icon name="email"/>
        support@datapallas.com
      </a>

      <g:render template="/common/themePicker"/>
    </div>

  </nav>
</header>

<!-- ══ ADMIN SIDEBAR (starts below header) ════════════════════════════════════ -->
<aside id="adminSidebar" style="position:fixed;top:64px;left:0;bottom:0;width:var(--sidebar-w);overflow-x:hidden;overflow-y:auto;transition:width 0.2s ease;display:flex;flex-direction:column;background-color:var(--app-sidebar-bg);border-right:1px solid var(--app-sidebar-border);z-index:40;">

  <!-- Sidebar navigation -->
  <nav class="flex-1 py-2">
    <ul class="menu w-full py-0">
      <li class="menu-title">Menu</li>

      <li>
        <a href="${createLink(controller: 'admin', action: 'index')}"
           class="${controllerName == 'admin' && actionName == 'index' ? 'menu-active' : ''}">
          <dp:icon name="dashboard"/>
          <span>Dashboard</span>
        </a>
      </li>

      <li>
        <a href="${createLink(controller: 'payslip', action: 'index')}"
           class="${controllerName == 'payslip' ? 'menu-active' : ''}">
          <dp:icon name="payslip"/>
          <span>Payslips</span>
        </a>
      </li>

      <li>
        <a href="${createLink(controller: 'invoice', action: 'index')}"
           class="${controllerName == 'invoice' ? 'menu-active' : ''}">
          <dp:icon name="invoice"/>
          <span>Invoices</span>
        </a>
      </li>

      <li>
        <a href="${createLink(controller: 'admin', action: 'settings')}"
           class="${controllerName == 'admin' && actionName == 'settings' ? 'menu-active' : ''}">
          <dp:icon name="settings"/>
          <span>Settings</span>
        </a>
      </li>
    </ul>
  </nav>
</aside>

<!-- ══ MAIN CONTENT (offset by sidebar + header) ══════════════════════════════ -->
<div id="adminMain" style="margin-left:var(--sidebar-w);margin-top:64px;transition:margin-left 0.2s ease;min-height:calc(100vh - 64px);display:flex;flex-direction:column;">

  <!-- Page content -->
  <main class="flex-1 p-6">
    <g:layoutBody/>
  </main>

  <!-- Footer -->
  <footer class="border-t border-base-300 bg-base-200 text-base-content/60 text-sm py-4 px-6 flex justify-between items-center">
    <span>&copy; 2026 FlowKraft Systems</span>
  </footer>
</div>

<g:render template="/common/setThemeScript"/>

<script>
    function toggleAdminSidebar() {
        document.documentElement.classList.toggle('admin-sidebar-closed');
        localStorage.setItem('rb-admin-sidebar', document.documentElement.classList.contains('admin-sidebar-closed') ? 'closed' : 'open');
    }
    document.addEventListener('DOMContentLoaded', function() {
        if (localStorage.getItem('rb-admin-sidebar') === 'closed') {
            document.documentElement.classList.add('admin-sidebar-closed');
        }
    });

    document.addEventListener('DOMContentLoaded', function() {
        var current = document.documentElement.getAttribute('data-theme') || 'dark';
        document.querySelectorAll('.theme-checkmark').forEach(function(el) {
            el.style.visibility = el.getAttribute('data-theme-name') === current ? 'visible' : 'hidden';
        });
        var trigger = document.getElementById('themeSwatchTrigger');
        if (trigger) trigger.setAttribute('data-theme', current);
    });
</script>

<!-- HTMX — orthogonal to daisyUI, keep as-is -->
<script src="https://unpkg.com/htmx.org@2.0.4"></script>

<!-- DataPallas Web Components bridge (load-bearing — do NOT remove) -->
<script src="http://localhost:9090/rb-webcomponents/rb-webcomponents.umd.js"></script>

<g:pageProperty name="page.scripts"/>

<!-- Flash message -->
<g:if test="${flash.message || flash.error}">
<div id="flashToast"
     style="position:fixed;bottom:1.5rem;right:1.5rem;z-index:1090;max-width:24rem;"
     class="alert ${flash.error ? 'alert-error' : 'alert-success'} shadow-lg">
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-5 h-5 shrink-0">
    <g:if test="${flash.error}">
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"/>
    </g:if>
    <g:else>
      <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/>
    </g:else>
  </svg>
  <span>${flash.message ?: flash.error}</span>
  <button type="button" class="btn btn-ghost btn-xs" onclick="this.closest('#flashToast').remove()">✕</button>
</div>
<script>setTimeout(function(){var t=document.getElementById('flashToast');if(t)t.remove();},3000);</script>
</g:if>

</body>
</html>
