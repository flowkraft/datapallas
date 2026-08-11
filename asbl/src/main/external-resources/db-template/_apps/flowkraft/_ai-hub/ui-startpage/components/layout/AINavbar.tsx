"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useState, useEffect } from "react"
import { DAISY_THEMES, setTheme } from "@/lib/daisy-themes"
import { BrandLogo } from "@/components/shared/BrandLogo"
import { IconXMark, IconHamburger, IconSettings, IconRocketLaunch, IconEmail } from "@/components/shared/Icons"
import { useDpSession } from "@/components/layout/DpSession"

export function AINavbar() {
  // Same rule as the main application: the navigation disappears while a server waits for a sign-in,
  // because every destination in it needs one. The brand, the support link and the theme picker stay
  // — they are not navigation into the app.
  const { needsSignIn, username, roleLabel } = useDpSession()
  const pathname = usePathname()
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  // Sync checkmarks and trigger swatch on mount
  useEffect(() => {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    document.querySelectorAll<HTMLElement>('.theme-checkmark').forEach((el) => {
      el.style.visibility = el.getAttribute('data-theme-name') === current ? 'visible' : 'hidden';
    });
    const trigger = document.getElementById('themeSwatchTrigger');
    if (trigger) trigger.setAttribute('data-theme', current);
  }, []);

  const isActive = (path: string) =>
    pathname === path || pathname?.startsWith(path + "/")

  const handleUpdateAgents = () => {
    setShowSettings(false)
    // The provisioning dialog and its listener live inside the /agents page.
    // On /agents, fire the in-page event; from anywhere else, navigate there
    // and let the page auto-open the dialog from the ?action flag.
    if (pathname?.startsWith('/agents')) {
      window.dispatchEvent(new Event('trigger-update-agents'))
    } else {
      router.push('/agents?action=update-agents')
    }
  }

  const navLinks = [
    { href: "/explore-data", label: "Explore Data" },
    { href: "/chat2db", label: "Chat2DB" },
    { href: "/agents", label: "Data Greeks (AI Crew)" },
    // Mnemosyne's home — the standalone Data Learning Tutor gets her own front door
    // (exactly like /chat2db is Athena's), instead of a hero on the /agents page.
    { href: "/chat2mnemo", label: "Finding Mnemo" },
  ]

  return (
    <header id="app-navbar" className="bg-base-100/90 text-base-content fixed top-0 left-0 right-0 z-30 flex h-16 w-full backdrop-blur border-b border-base-300">
      <nav className="navbar w-full py-0 px-4">

        {/* Left: brand + nav links */}
        <div className="flex flex-1 items-center gap-2">

          {/* Brand */}
          <Link href="/" className="flex items-center gap-2 shrink-0 no-underline text-base-content">
            <span className="logo-lg flex items-center gap-1">
              <span
              className="text-3xl tracking-tight"
              style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontWeight: 700, lineHeight: 1 }}
            >
              <span style={{ fontStyle: "italic", color: "currentColor" }}>Data</span>
              <span style={{ fontStyle: "normal", color: "#d18361" }}>Pallas</span>
            </span>
              <BrandLogo />
            </span>
          </Link>

          {/* Desktop nav links */}
          {!needsSignIn && (
          <ul className="menu menu-horizontal px-1 hidden md:flex">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={isActive(link.href) ? 'menu-active' : ''}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          )}
        </div>

        {/* Right: support email + settings gear + 35-theme picker */}
        <div className="flex items-center gap-1">

          {/* Support email */}
          <a href="mailto:support@datapallas.com" className="btn btn-ghost btn-sm normal-case gap-1">
            <IconEmail />
            support@datapallas.com
          </a>

          {/* Settings gear — administration, so it goes with the navigation. */}
          {!needsSignIn && (
          <div className="relative">
            <button
              id="navbar-settings-button"
              type="button"
              onClick={() => setShowSettings(!showSettings)}
              className="btn btn-square btn-ghost"
              aria-label="Settings"
            >
              <IconSettings />
            </button>

            {showSettings && (
              <>
                {/* Click-outside overlay */}
                <div className="fixed inset-0 z-30" onClick={() => setShowSettings(false)} />

                {/* Dropdown */}
                <div id="settings-dropdown" className="absolute right-0 top-full mt-1 z-40 w-64 bg-base-100 border border-base-300 rounded-box shadow-lg py-2">
                  {/* Admin section */}
                  <div className="px-4 py-2">
                    <span className="text-xs font-semibold text-base-content/60 uppercase tracking-wider">Administration</span>
                  </div>
                  <button
                    id="settings-update-agents-button"
                    type="button"
                    onClick={handleUpdateAgents}
                    className="w-full text-left px-4 py-2.5 text-sm text-base-content hover:bg-base-200 transition-colors flex items-center gap-3"
                  >
                    <IconRocketLaunch />
                    Update Agents
                  </button>
                </div>
              </>
            )}
          </div>
          )}

          {/* Signed-in user + sign out. Absent on the desktop, where the identity is empty because
              there is nobody to name and nothing to sign out of — exactly as in the main app. */}
          {username && (
            <div className="dropdown dropdown-end">
              <div id="userMenu" tabIndex={0} role="button" className="btn btn-ghost btn-sm gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                     fill="currentColor" className="h-4 w-4 shrink-0">
                  <path d="M12 2a5 5 0 100 10 5 5 0 000-10zm0 12c-4.418 0-8 2.239-8 5v1h16v-1c0-2.761-3.582-5-8-5z" />
                </svg>
                <span className="truncate max-w-32">{username}</span>
              </div>
              <ul tabIndex={0}
                  className="dropdown-content menu bg-base-300 rounded-box w-56 p-2 shadow z-[1031]">
                {roleLabel && (
                  <li className="menu-title"><span id="userMenuRoles">{roleLabel}</span></li>
                )}
                <li>
                  <button id="btnLogout" type="button" className="cursor-pointer"
                          onClick={async () => {
                            // Through the proxy, so the backend clears the very session the browser
                            // holds — the same one DataPallas itself uses.
                            await fetch('/api/dp/auth/logout', { method: 'POST' }).catch(() => {})
                            window.location.reload()
                          }}>
                    Sign Out
                  </button>
                </li>
              </ul>
            </div>
          )}

          {/* 35-theme daisyUI picker */}
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
                  <button
                    type="button"
                    id={`theme-${t}`}
                    onClick={() => setTheme(t)}
                    className="gap-3 px-2 cursor-pointer flex items-center w-full"
                  >
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

          {/* Mobile menu button */}
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="btn btn-square btn-ghost md:hidden"
            aria-label="Toggle menu"
          >
            {isOpen ? <IconXMark /> : <IconHamburger />}
          </button>
        </div>
      </nav>

      {/* Mobile Navigation */}
      {isOpen && (
        <div className="md:hidden absolute top-16 left-0 right-0 border-t border-base-300 bg-base-100 z-50">
          <ul className="menu w-full p-2">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={() => setIsOpen(false)}
                  className={isActive(link.href) ? 'menu-active' : ''}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </header>
  )
}
