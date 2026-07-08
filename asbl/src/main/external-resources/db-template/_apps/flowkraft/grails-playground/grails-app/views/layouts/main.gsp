<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8"/>
    <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
    <meta name="viewport" content="width=device-width, initial-scale=1"/>
    <title><g:layoutTitle default="DataPallas - Dashboards &amp; Self Service Portals"/></title>

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
    <!-- Prism.js syntax highlighting (dark theme — neutral, works with all daisyUI themes) -->
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/themes/prism-tomorrow.min.css"/>

    <style>
        /* daisyUI v5 dropdown specificity fix */
        .dropdown .dropdown-content { display: none; position: absolute; }
        .dropdown:focus-within > .dropdown-content,
        details.dropdown[open] > .dropdown-content { display: flex; flex-direction: column; position: absolute; }

        /* Suppress parent menu-active when a descendant is active */
        .menu li:has(> ul .menu-active) > a.menu-active { background-color: transparent; color: inherit; box-shadow: none; }
    </style>

    <g:layoutHead/>
</head>
<body>

<!-- ══ STICKY NAVBAR ═══════════════════════════════════════════════════════════
     Mirrors DataPallas: frend/reporting/src/app/areas/top-menu-header/top-menu-header.template.html
     Classes verbatim from P4.UI0 Section 4. -->
<header class="bg-base-100/90 text-base-content sticky top-0 z-30 flex h-16 w-full backdrop-blur border-b border-base-300">
  <nav class="navbar w-full py-0 px-4">

    <!-- Left: brand + nav links -->
    <div class="flex flex-1 items-center gap-2">

      <!-- Brand -->
      <a href="${createLink(uri: '/')}" class="flex items-center gap-2 shrink-0 no-underline">
        <span class="logo-lg flex items-center gap-1">
          <span class="brand-wordmark text-3xl tracking-tight"><span class="brand-data">Data</span><span class="brand-pallas">Pallas</span></span>
          <dp:brandLogo/>
        </span>
      </a>

      <!-- Top nav links — hidden on small screens -->
      <ul class="menu menu-horizontal px-1 hidden md:flex">
        <li><a href="${createLink(uri: '/')}"               class="${(controllerName == 'home' || !controllerName) ? 'menu-active' : ''}">Analytics (Home)</a></li>
        <li><a href="${createLink(uri: '/tabulator')}"      class="${controllerName == 'tabulator'       ? 'menu-active' : ''}">Tabulator</a></li>
        <li><a href="${createLink(uri: '/charts')}"         class="${controllerName == 'charts'          ? 'menu-active' : ''}">Charts</a></li>
        <li><a href="${createLink(uri: '/pivot-tables')}"   class="${controllerName == 'pivotTables'     ? 'menu-active' : ''}">Pivots</a></li>
        <li><a href="${createLink(uri: '/report-parameters')}" class="${controllerName == 'reportParameters' ? 'menu-active' : ''}">Params</a></li>
        <li><a href="${createLink(uri: '/reports')}"        class="${controllerName == 'reports'         ? 'menu-active' : ''}">Reports</a></li>
        <li><a href="${createLink(uri: '/data-warehouse')}" class="${controllerName == 'dataWarehouse'   ? 'menu-active' : ''}">Data Warehouse</a></li>
        <li><a href="${createLink(uri: '/dashboards')}"     class="${controllerName == 'dashboards'      ? 'menu-active' : ''}">Dashboards</a></li>
        <li><a href="${createLink(uri: '/your-canvas')}"    class="${controllerName == 'yourCanvas'      ? 'menu-active' : ''}">Canvas</a></li>
      </ul>
    </div>

    <!-- Right: Document Portal + Admin links + 35-theme picker -->
    <div class="flex items-center gap-1">
      <a href="${createLink(uri: '/portal')}" class="btn btn-ghost btn-sm normal-case">
        <dp:icon name="portal"/> Portal
      </a>
      <a href="${createLink(uri: '/admin')}" class="btn btn-ghost btn-sm normal-case">
        <dp:icon name="admin"/> Admin
      </a>

      <a href="mailto:support@datapallas.com" class="btn btn-ghost btn-sm normal-case gap-1 hidden lg:flex">
        <dp:icon name="email"/>
        support@datapallas.com
      </a>

      <g:render template="/common/themePicker"/>
    </div>

  </nav>
</header>

<!-- ══ MAIN CONTENT ════════════════════════════════════════════════════════════ -->
<div id="mainContent" style="min-height:calc(100vh - 4rem);display:flex;flex-direction:column;">
  <main class="flex-1 p-4">
    <g:layoutBody/>
  </main>

  <!-- Footer -->
  <footer class="border-t border-base-300 bg-base-200 text-base-content/60 text-sm py-4 px-4 flex justify-between items-center">
    <span>&copy; 2026 FlowKraft Systems</span>
    <a href="https://datapallas.com" target="_blank" class="no-underline text-base-content/60 hover:text-base-content">
      datapallas.com
    </a>
  </footer>
</div>

<!-- HTMX — orthogonal to daisyUI, keep as-is -->
<script src="https://unpkg.com/htmx.org@2.0.4"></script>

<!-- Prism.js syntax highlighting -->
<script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/prism.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-groovy.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-markup.min.js"></script>

<!-- DataPallas Web Components bridge (load-bearing — do NOT remove) -->
<script src="http://localhost:9090/rb-webcomponents/rb-webcomponents.umd.js"></script>

<g:render template="/common/setThemeScript"/>

<script>
    document.addEventListener('DOMContentLoaded', function() {
        // Sync checkmarks to current theme
        var current = document.documentElement.getAttribute('data-theme') || 'dark';
        document.querySelectorAll('.theme-checkmark').forEach(function(el) {
            el.style.visibility = el.getAttribute('data-theme-name') === current ? 'visible' : 'hidden';
        });

        // Sync trigger swatch to current theme
        var trigger = document.getElementById('themeSwatchTrigger');
        if (trigger) trigger.setAttribute('data-theme', current);
    });
</script>

<g:pageProperty name="page.scripts"/>
</body>
</html>
