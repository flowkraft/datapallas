"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ThemePicker } from "@/components/shared/ThemePicker"
import { BrandLogo } from "@/components/shared/BrandLogo"
import { BrandWordmark } from "@/components/shared/BrandWordmark"
import { IconPortal, IconAdmin, IconEmail } from "@/components/shared/Icons"

const navLinks = [
  { href: "/", label: "Analytics (Home)" },
  { href: "/tabulator", label: "Tabulator" },
  { href: "/charts", label: "Charts" },
  { href: "/pivot-tables", label: "Pivot Tables" },
  { href: "/report-parameters", label: "Parameters" },
  { href: "/reports", label: "Reports" },
  { href: "/data-warehouse", label: "Data Warehouse" },
  { href: "/dashboards", label: "Dashboards" },
  { href: "/your-canvas", label: "Your Canvas" },
]

export function Navbar() {
  const pathname = usePathname()

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/"
    return pathname.startsWith(href)
  }

  return (
    <header className="bg-base-100/90 text-base-content sticky top-0 z-30 flex h-16 w-full backdrop-blur border-b border-base-300">
      <nav className="navbar w-full py-0 px-4">

        {/* Left: brand + nav links */}
        <div className="flex flex-1 items-center gap-2">

          {/* Brand */}
          <Link href="/" className="flex items-center gap-2 shrink-0 no-underline">
            <span className="logo-lg flex items-center gap-1">
              <BrandWordmark />
              <BrandLogo />
            </span>
          </Link>

          {/* Top nav links — hidden on small screens */}
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

        {/* Right: cross-area links + support email + theme picker */}
        <div className="flex items-center gap-1">
          <Link href="/portal" className="btn btn-ghost btn-sm normal-case gap-1">
            <IconPortal />{" "}Self-Service Portal
          </Link>
          <Link href="/admin" className="btn btn-ghost btn-sm normal-case">
            <IconAdmin />{" "}Admin
          </Link>
          <a href="mailto:support@datapallas.com" className="btn btn-ghost btn-sm normal-case gap-1">
            <IconEmail />{" "}support@datapallas.com
          </a>

          {/* 35-theme daisyUI picker */}
          <ThemePicker />
        </div>

      </nav>
    </header>
  )
}
