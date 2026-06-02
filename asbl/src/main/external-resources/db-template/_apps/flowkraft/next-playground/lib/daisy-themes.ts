export const DAISY_THEMES = [
  'light','dark','cupcake','bumblebee','emerald','corporate','synthwave','retro',
  'cyberpunk','valentine','halloween','garden','forest','aqua','lofi','pastel',
  'fantasy','wireframe','black','luxury','dracula','cmyk','autumn','business',
  'acid','lemonade','night','coffee','winter','dim','nord','sunset',
  'caramellatte','abyss','silk'
] as const

export type DaisyTheme = typeof DAISY_THEMES[number]

export function setTheme(name: string) {
  if (!DAISY_THEMES.includes(name as DaisyTheme)) return
  document.documentElement.setAttribute('data-theme', name)
  localStorage.setItem('rb-theme', name)
  const trigger = document.getElementById('themeSwatchTrigger')
  if (trigger) trigger.setAttribute('data-theme', name)
  document.querySelectorAll('.theme-checkmark').forEach(function(el) {
    const htmlEl = el as HTMLElement
    htmlEl.style.visibility = htmlEl.getAttribute('data-theme-name') === name ? 'visible' : 'hidden'
  })
  fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'theme.color', value: name, category: 'theme' })
  }).catch(function() {})
}
