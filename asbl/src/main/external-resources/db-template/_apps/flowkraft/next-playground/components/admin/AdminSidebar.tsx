"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { IconDashboard, IconPayslip, IconInvoice, IconSettings } from "@/components/shared/Icons"

export function AdminSidebar() {
  const pathname = usePathname()

  const isActive = (href: string, exact = false) => {
    if (exact) return pathname === href
    return pathname === href || (href !== "/admin" && pathname.startsWith(href))
  }

  return (
    <aside id="adminSidebar" style={{position:'fixed',top:0,left:0,bottom:0,width:'var(--sidebar-w)',overflowX:'hidden',overflowY:'auto',transition:'width 0.2s ease',display:'flex',flexDirection:'column',backgroundColor:'var(--color-base-200)',borderRight:'1px solid var(--color-base-300)',zIndex:40}}>

      {/* Sidebar navigation */}
      <nav className="flex-1 py-2">
        <ul className="menu w-full py-0">
          <li className="menu-title">Menu</li>

          <li>
            <Link href="/admin" className={isActive('/admin', true) ? 'menu-active' : ''}>
              <IconDashboard />
              <span>Dashboard</span>
            </Link>
          </li>

          <li>
            <Link href="/admin/payslips" className={isActive('/admin/payslips') ? 'menu-active' : ''}>
              <IconPayslip />
              <span>Payslips</span>
            </Link>
          </li>

          <li>
            <Link href="/admin/invoices" className={isActive('/admin/invoices') ? 'menu-active' : ''}>
              <IconInvoice />
              <span>Invoices</span>
            </Link>
          </li>

          <li>
            <Link href="/admin/settings" className={isActive('/admin/settings') ? 'menu-active' : ''}>
              <IconSettings />
              <span>Settings</span>
            </Link>
          </li>
        </ul>
      </nav>

    </aside>
  )
}
