<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8"/>
    <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
    <meta name="viewport" content="width=device-width, initial-scale=1"/>
    <title><g:layoutTitle default="DataPallas Portal"/></title>

    <!-- Favicon - DataPallas paper plane icon -->
    <link rel="icon" href="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='m22 2-7 20-4-9-9-4Z' fill='%2322a7c8'/></svg>" type="image/svg+xml"/>

    <!-- No-flash theme: apply from localStorage cache immediately, then sync from SQLite -->
    <script>
        (function() {
            var THEMES = ['light','dark','cupcake','bumblebee','emerald','corporate','synthwave','retro','cyberpunk','valentine','halloween','garden','forest','aqua','lofi','pastel','fantasy','wireframe','black','luxury','dracula','cmyk','autumn','business','acid','lemonade','night','coffee','winter','dim','nord','sunset','caramellatte','abyss','silk'];
            var cached = localStorage.getItem('rb-theme') || 'light';
            document.documentElement.setAttribute('data-theme', THEMES.indexOf(cached) >= 0 ? cached : 'light');
            fetch('/settings?key=theme.mode')
                .then(function(r) { return r.json(); })
                .then(function(d) {
                    if (d.value && !localStorage.getItem('rb-theme') && THEMES.indexOf(d.value) >= 0) {
                        document.documentElement.setAttribute('data-theme', d.value);
                        localStorage.setItem('rb-theme', d.value);
                    }
                })
                .catch(function() {});
        })();
    </script>

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
        /* daisyUI v5 dropdown specificity fix */
        .dropdown .dropdown-content { display: none; position: absolute; }
        .dropdown:focus-within > .dropdown-content,
        details.dropdown[open] > .dropdown-content { display: flex; flex-direction: column; position: absolute; }
    </style>

    <g:layoutHead/>
</head>
<body class="min-h-screen flex flex-col">

<!-- ══ PORTAL NAVBAR ══════════════════════════════════════════════════════════
     Minimal top bar — no sidebar for the self-service portal. -->
<header class="bg-base-100/90 text-base-content sticky top-0 z-30 flex h-16 w-full backdrop-blur border-b border-base-300">
  <nav class="navbar w-full py-0 px-4">

    <!-- Brand -->
    <div class="flex-1 flex items-center gap-4">
      <a href="${createLink(uri: '/portal')}" class="flex items-center gap-2 shrink-0 no-underline">
        <span class="logo-lg flex items-center gap-1">
          <span class="text-2xl font-bold tracking-tight"><strong>Data</strong><em>Pallas</em></span>
          <dp:brandLogo/>
        </span>
      </a>

      <!-- Portal nav links -->
      <ul class="menu menu-horizontal px-1 hidden md:flex">
        <li><a href="${createLink(uri: '/portal')}"
               class="${controllerName == 'portalHome' ? 'menu-active' : ''}">
          <dp:icon name="home"/> Portal (Home)
        </a></li>
        <li><a href="${createLink(uri: '/portal/payslips')}"
               class="${controllerName == 'portalPayslip' ? 'menu-active' : ''}">
          <dp:icon name="payslip"/> Payslips
        </a></li>
        <li><a href="${createLink(uri: '/portal/invoices')}"
               class="${controllerName == 'portalInvoice' ? 'menu-active' : ''}">
          <dp:icon name="invoice"/> Invoices
        </a></li>
      </ul>
    </div>

    <!-- Right: Analytics + Admin links + support email + theme picker -->
    <div class="flex items-center gap-1">
      <a href="${createLink(uri: '/')}" class="btn btn-ghost btn-sm normal-case">
        <dp:icon name="analytics"/> Analytics
      </a>
      <a href="${createLink(uri: '/admin')}" class="btn btn-ghost btn-sm normal-case">
        <dp:icon name="admin"/> Admin
      </a>
      <a href="mailto:support@datapallas.com" class="btn btn-ghost btn-sm normal-case gap-1">
        <dp:icon name="email"/>
        support@datapallas.com
      </a>

      <g:render template="/common/themePicker"/>
    </div>

  </nav>
</header>

<!-- ══ PORTAL CONTENT ════════════════════════════════════════════════════════ -->
<main class="flex-1 p-4">
  <g:layoutBody/>
</main>

<!-- ══ FOOTER ════════════════════════════════════════════════════════════════ -->
<footer class="border-t border-base-300 bg-base-200 text-base-content/60 text-sm py-4 px-4 text-center">
  <span>&copy; 2026 FlowKraft Systems</span>
</footer>

<!-- HTMX — orthogonal to daisyUI, keep as-is -->
<script src="https://unpkg.com/htmx.org@2.0.4"></script>

<!-- DataPallas Web Components bridge (load-bearing — do NOT remove) -->
<script src="http://localhost:9090/rb-webcomponents/rb-webcomponents.umd.js"></script>

<g:render template="/common/setThemeScript"/>

<script>
    document.addEventListener('DOMContentLoaded', function() {
        var current = document.documentElement.getAttribute('data-theme') || 'light';
        document.querySelectorAll('.theme-checkmark').forEach(function(el) {
            el.style.visibility = el.getAttribute('data-theme-name') === current ? 'visible' : 'hidden';
        });
        var trigger = document.getElementById('themeSwatchTrigger');
        if (trigger) trigger.setAttribute('data-theme', current);
    });
</script>

</body>
</html>
