export const DAISY_THEMES = [
  'light','dark','cupcake','bumblebee','emerald','corporate','synthwave','retro',
  'cyberpunk','valentine','halloween','garden','forest','aqua','lofi','pastel',
  'fantasy','wireframe','black','luxury','dracula','cmyk','autumn','business',
  'acid','lemonade','night','coffee','winter','dim','nord','sunset',
  'caramellatte','abyss','silk',
] as const

export type DaisyTheme = typeof DAISY_THEMES[number]

export function setTheme(name: string) {
  if (!(DAISY_THEMES as readonly string[]).includes(name)) return
  document.documentElement.setAttribute('data-theme', name)
  localStorage.setItem('rb-theme', name)
  const trigger = document.getElementById('themeSwatchTrigger')
  if (trigger) trigger.setAttribute('data-theme', name)
  document.querySelectorAll<HTMLElement>('.theme-checkmark').forEach((el) => {
    el.style.visibility = el.getAttribute('data-theme-name') === name ? 'visible' : 'hidden'
  })
  fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'theme.color', value: name, category: 'theme' }),
  }).catch(() => {})
}
