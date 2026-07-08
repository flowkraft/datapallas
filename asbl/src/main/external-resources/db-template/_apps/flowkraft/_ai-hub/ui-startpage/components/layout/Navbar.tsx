"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { setTheme } from "@/lib/daisy-themes"
import { BrandLogo } from "@/components/shared/BrandLogo"
import { IconSun, IconXMark, IconHamburger } from "@/components/shared/Icons"

export function Navbar() {
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(false)

  const isActive = (path: string) => pathname === path

  const toggleTheme = () => {
    const current = document.documentElement.getAttribute('data-theme') || 'light'
    setTheme(current === 'light' ? 'dark' : 'light')
  }

  const navLinks = [
    { href: "/", label: "Home" },
    { href: "/tabulator", label: "Tabulator" },
    { href: "/charts", label: "Charts" },
    { href: "/pivot-tables", label: "Pivot Tables" },
    { href: "/report-parameters", label: "Parameters" },
    { href: "/reports", label: "Reports" },
    { href: "/your-canvas", label: "Your Canvas" },
  ]

  return (
    <header className="bg-base-100/90 text-base-content fixed top-0 left-0 right-0 z-30 flex h-16 w-full backdrop-blur border-b border-base-300">
      <nav className="navbar w-full py-0 px-4">
        {/* Brand */}
        <div className="flex flex-1 items-center gap-2">
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

          {/* Desktop nav */}
          <ul className="menu menu-horizontal px-1 hidden md:flex">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className={isActive(link.href) ? 'menu-active' : ''}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Right: theme toggle + mobile menu */}
        <div className="flex items-center gap-1">
          <button onClick={toggleTheme} className="btn btn-square btn-ghost" aria-label="Toggle theme">
            <IconSun />
          </button>

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
