"use client"

import Link from "next/link"
import { ThemePicker } from "@/components/shared/ThemePicker"
import { BrandLogo } from "@/components/shared/BrandLogo"
import { BrandWordmark } from "@/components/shared/BrandWordmark"
import { IconAnalytics, IconPortal, IconEmail, IconHamburger } from "@/components/shared/Icons"

export function AdminHeader() {
  return (
    <header className="bg-base-100/90 text-base-content fixed top-0 left-0 right-0 z-50 flex h-16 w-full backdrop-blur border-b border-base-300">
      <nav className="navbar w-full py-0 px-4">

        {/* Left: hamburger + brand */}
        <div className="flex flex-1 items-center gap-4">
          <button
            type="button"
            onClick={() => {
              document.documentElement.classList.toggle('admin-sidebar-closed');
              localStorage.setItem('rb-admin-sidebar',
                document.documentElement.classList.contains('admin-sidebar-closed') ? 'closed' : 'open');
            }}
            className="btn btn-square btn-ghost"
            aria-label="Toggle sidebar"
          >
            <IconHamburger />
          </button>
          <Link href="/admin" className="flex items-center gap-2 shrink-0 no-underline">
            <span className="logo-lg flex items-center gap-1">
              <BrandWordmark />
              <BrandLogo />
            </span>
          </Link>
        </div>

        {/* Right: cross-area links + support email + theme picker */}
        <div className="flex items-center gap-1">

          <Link href="/" className="btn btn-ghost btn-sm normal-case gap-1">
            <IconAnalytics />
            Analytics
          </Link>

          <Link href="/portal" className="btn btn-ghost btn-sm normal-case gap-1">
            <IconPortal />
            Portal
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
  )
}
