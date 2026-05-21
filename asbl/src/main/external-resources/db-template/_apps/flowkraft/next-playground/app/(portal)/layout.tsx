"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect } from "react"
import { ThemePicker } from "@/components/shared/ThemePicker"
import { BrandLogo } from "@/components/shared/BrandLogo"
import { IconAnalytics, IconAdmin, IconEmail, IconHome, IconPayslip, IconInvoice } from "@/components/shared/Icons"

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  useEffect(() => {
    const saved = localStorage.getItem('rb-theme')
    if (saved) {
      document.documentElement.setAttribute('data-theme', saved)
    }
  }, [])

  const isActive = (href: string) => {
    if (href === "/portal") return pathname === "/portal"
    return pathname.startsWith(href)
  }

  return (
    <div className="min-h-screen flex flex-col">

      {/* Portal sticky navbar */}
      <header className="bg-base-100/90 text-base-content sticky top-0 z-30 flex h-16 w-full backdrop-blur border-b border-base-300">
        <nav className="navbar w-full py-0 px-4">

          {/* Brand → Portal (Home) */}
          <div className="flex-1 flex items-center gap-4">
            <Link href="/portal" className="flex items-center gap-2 shrink-0 no-underline">
              <span className="logo-lg flex items-center gap-1">
                <span className="text-2xl font-bold tracking-tight"><strong>Data</strong><em>Pallas</em></span>
                <BrandLogo />
              </span>
            </Link>

            {/* Portal nav links */}
            <ul className="menu menu-horizontal px-1 hidden md:flex">
              <li>
                <Link href="/portal" className={pathname === '/portal' ? 'menu-active' : ''}>
                  <IconHome />
                  Portal (Home)
                </Link>
              </li>
              <li>
                <Link href="/portal/payslips" className={isActive('/portal/payslips') ? 'menu-active' : ''}>
                  <IconPayslip />
                  My Payslips
                </Link>
              </li>
              <li>
                <Link href="/portal/invoices" className={isActive('/portal/invoices') ? 'menu-active' : ''}>
                  <IconInvoice />
                  My Invoices
                </Link>
              </li>
            </ul>
          </div>

          {/* Right: Analytics + Admin + support email + theme picker */}
          <div className="flex items-center gap-1">

            <Link href="/" className="btn btn-ghost btn-sm normal-case gap-1">
              <IconAnalytics />
              Analytics
            </Link>

            <Link href="/admin" className="btn btn-ghost btn-sm normal-case gap-1">
              <IconAdmin />
              Admin
            </Link>

            <a href="mailto:support@datapallas.com" className="btn btn-ghost btn-sm normal-case gap-1">
              <IconEmail />
              support@datapallas.com
            </a>

            {/* 35-theme daisyUI picker */}
            <ThemePicker />

          </div>

        </nav>
      </header>

      {/* Portal content */}
      <main className="flex-1 p-4">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-base-300 bg-base-200 text-base-content/60 text-sm py-4 px-4 text-center">
        <span>&copy; 2026 FlowKraft Systems</span>
      </footer>

    </div>
  )
}
