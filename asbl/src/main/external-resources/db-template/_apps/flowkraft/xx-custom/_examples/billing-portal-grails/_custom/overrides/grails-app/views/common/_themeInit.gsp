<%-- ════════════════════════════════════════════════════════════════════════════
     Default daisyUI theme for the Northwind Traders billing portal. "corporate" is daisyUI's
     clean, corporate-ready light theme — a deliberate switch away from the DataPallas
     default. A user's own pick (theme picker) still wins and is persisted.
     ──────────────────────────────────────────────────────────────────────────── --%>
<script>
    window.RB_DEFAULT_THEME = 'corporate';
    (function() {
        var THEMES = ['light','dark','cupcake','bumblebee','emerald','corporate','synthwave','retro','cyberpunk','valentine','halloween','garden','forest','aqua','lofi','pastel','fantasy','wireframe','black','luxury','dracula','cmyk','autumn','business','acid','lemonade','night','coffee','winter','dim','nord','sunset','caramellatte','abyss','silk'];
        var DEFAULT = window.RB_DEFAULT_THEME;
        var cached = localStorage.getItem('rb-theme') || DEFAULT;
        document.documentElement.setAttribute('data-theme', THEMES.indexOf(cached) >= 0 ? cached : DEFAULT);
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
