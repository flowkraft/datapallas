<script>
function setTheme(name) {
    var THEMES = ['light','dark','cupcake','bumblebee','emerald','corporate','synthwave','retro','cyberpunk','valentine','halloween','garden','forest','aqua','lofi','pastel','fantasy','wireframe','black','luxury','dracula','cmyk','autumn','business','acid','lemonade','night','coffee','winter','dim','nord','sunset','caramellatte','abyss','silk'];
    if (THEMES.indexOf(name) < 0) return;
    document.documentElement.setAttribute('data-theme', name);
    localStorage.setItem('rb-theme', name);
    var trigger = document.getElementById('themeSwatchTrigger');
    if (trigger) trigger.setAttribute('data-theme', name);
    document.querySelectorAll('.theme-checkmark').forEach(function(el) {
        el.style.visibility = el.getAttribute('data-theme-name') === name ? 'visible' : 'hidden';
    });
    fetch('/settings/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'theme.color', value: name, category: 'theme' })
    }).catch(function(){});
}
</script>
