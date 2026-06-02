<%-- ════════════════════════════════════════════════════════════════════════════
     SINGLE SOURCE OF TRUTH for the default daisyUI theme.

     Change RB_DEFAULT_THEME below to change the app-wide default for first-time
     visitors. This is the ONLY place the default lives (in code, not the DB).

     A user's own selection always wins and is persisted two ways:
       • localStorage 'rb-theme'  → per-browser
       • server setting 'theme.color' (saved by the theme picker) → cross-browser
     The default is applied ONLY when neither of those holds a valid choice.
     ──────────────────────────────────────────────────────────────────────────── --%>
<script>
    window.RB_DEFAULT_THEME = 'dark';
    (function() {
        var THEMES = ['light','dark','cupcake','bumblebee','emerald','corporate','synthwave','retro','cyberpunk','valentine','halloween','garden','forest','aqua','lofi','pastel','fantasy','wireframe','black','luxury','dracula','cmyk','autumn','business','acid','lemonade','night','coffee','winter','dim','nord','sunset','caramellatte','abyss','silk'];
        var DEFAULT = window.RB_DEFAULT_THEME;
        var cached = localStorage.getItem('rb-theme') || DEFAULT;
        document.documentElement.setAttribute('data-theme', THEMES.indexOf(cached) >= 0 ? cached : DEFAULT);
        // Restore the user's saved choice from the server (cross-browser) only when
        // this browser has no local choice yet. No saved choice → code default stays.
        fetch('/settings?key=theme.color')
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

<%-- Map the active daisyUI theme onto the framework-agnostic web-component contracts.
     The components already inherit (transparent + currentColor); this just feeds the
     theme's primary/surface so accents (selected rows, active page, pivot overlays)
     match the theme. The components hardcode NO daisyUI — this mapping lives in the host. --%>
<style>
  rb-tabulator, rb-pivot-table, rb-chart {
    --rb-table-accent: var(--color-primary);
    --rb-table-accent-text: var(--color-primary-content);
    --rb-pivot-accent: var(--color-primary);
    --rb-pivot-surface: var(--color-base-100);
    --rb-chart-accent: var(--color-primary);
  }
  /* Report document viewer inherits the theme from outside (the host page). */
  rb-report {
    --rb-report-paper: var(--color-base-100);
  }
</style>
