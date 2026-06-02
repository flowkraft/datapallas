"use client"
import { useEffect } from "react"
import { DAISY_THEMES, setTheme } from "@/lib/daisy-themes"

export function ThemePicker() {
  useEffect(() => {
    const current = document.documentElement.getAttribute('data-theme') || 'dark'
    document.querySelectorAll<HTMLElement>('.theme-checkmark').forEach((el) => {
      el.style.visibility = el.getAttribute('data-theme-name') === current ? 'visible' : 'hidden'
    })
    const trigger = document.getElementById('themeSwatchTrigger')
    if (trigger) trigger.setAttribute('data-theme', current)
  }, [])

  return (
    <div className="dropdown dropdown-end" id="daisyThemePicker">
      <button id="btnChangeSkin" tabIndex={0} type="button" className="btn btn-square btn-ghost" aria-label="Theme">
        <div id="themeSwatchTrigger"
             style={{display:'inline-grid',gridTemplateColumns:'4px 4px',gridTemplateRows:'4px 4px',gap:'2px',padding:'2px',borderRadius:'3px',border:'1px solid var(--color-base-300)',backgroundColor:'var(--color-base-100)',flexShrink:0}}>
          <div style={{backgroundColor:'var(--color-base-content)',borderRadius:'50%'}}></div>
          <div style={{backgroundColor:'var(--color-primary)',borderRadius:'50%'}}></div>
          <div style={{backgroundColor:'var(--color-secondary)',borderRadius:'50%'}}></div>
          <div style={{backgroundColor:'var(--color-accent)',borderRadius:'50%'}}></div>
        </div>
      </button>
      <ul tabIndex={0} id="daisyThemePickerList"
          className="dropdown-content menu bg-base-300 rounded-box max-h-96 overflow-y-auto w-52 p-2 shadow z-[1031]">
        {DAISY_THEMES.map((t) => (
          <li key={t}>
            <button type="button" onClick={() => setTheme(t)} className="gap-3 px-2 cursor-pointer flex items-center w-full">
              <div data-theme={t}
                   style={{display:'inline-grid',gridTemplateColumns:'4px 4px',gridTemplateRows:'4px 4px',gap:'2px',padding:'2px',borderRadius:'3px',border:'1px solid var(--color-base-300)',backgroundColor:'var(--color-base-100)',flexShrink:0,verticalAlign:'middle'}}>
                <div style={{backgroundColor:'var(--color-base-content)',borderRadius:'50%'}}></div>
                <div style={{backgroundColor:'var(--color-primary)',borderRadius:'50%'}}></div>
                <div style={{backgroundColor:'var(--color-secondary)',borderRadius:'50%'}}></div>
                <div style={{backgroundColor:'var(--color-accent)',borderRadius:'50%'}}></div>
              </div>
              <div className="w-32 truncate capitalize">{t}</div>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"
                   className="h-3 w-3 shrink-0 theme-checkmark" data-theme-name={t}>
                <path d="M20.285 2l-11.285 11.567-5.286-5.011-3.714 3.716 9 8.728 15-15.285z"/>
              </svg>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
