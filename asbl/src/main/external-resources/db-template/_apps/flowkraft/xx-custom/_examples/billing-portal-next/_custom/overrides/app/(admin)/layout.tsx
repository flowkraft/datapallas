import Link from "next/link";
import { getSession } from "@/lib/auth";
import { ThemePicker } from "@/components/shared/ThemePicker";
import { FlashToast } from "@/components/shared/FlashToast";
import { readFlash } from "@/lib/flash";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  const flash = await readFlash();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-base-100/90 text-base-content sticky top-0 z-30 flex h-16 w-full backdrop-blur border-b border-base-300">
        <nav className="navbar w-full py-0 px-4">
          <div className="flex-1 flex items-center gap-4">
            <Link href="/admin" className="flex items-center gap-2 shrink-0 no-underline">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-primary text-primary-content font-bold text-lg">N</span>
              <span className="text-xl font-bold tracking-tight">Northwind Traders <span className="text-base-content/50 font-normal">Admin</span></span>
            </Link>
          </div>
          <div className="flex items-center gap-1">
            <Link href="/portal" className="btn btn-ghost btn-sm normal-case">Portal</Link>
            {s ? (
              <>
                <span id="current-user" className="text-sm text-base-content/60 hidden sm:inline px-2">{s.username}</span>
                <a id="btn-logout" href="/api/auth/logout" className="btn btn-ghost btn-sm normal-case">Logout</a>
              </>
            ) : null}
            <a href="mailto:billing@northwind.example.com" className="btn btn-ghost btn-sm normal-case gap-1 hidden md:inline-flex" title="Contact support">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"/></svg>
              billing@northwind.example.com
            </a>
            <ThemePicker />
          </div>
        </nav>
      </header>

      <div className="flex flex-1">
        {/* #adminSidebar / #adminMain name the same two regions as the Grails admin.gsp twin. */}
        <aside id="adminSidebar" className="w-56 shrink-0 border-r border-base-300 bg-base-200 hidden md:block">
          <ul className="menu w-full py-2">
            <li className="menu-title">Billing</li>
            <li><Link href="/admin">Dashboard</Link></li>
            <li><Link href="/admin/invoices">Invoices</Link></li>
            <li><Link href="/admin/customers">Customers</Link></li>
          </ul>
        </aside>
        <main id="adminMain" className="flex-1 p-6">{children}</main>
      </div>

      <footer className="border-t border-base-300 bg-base-200 text-base-content/60 text-sm py-4 px-6">
        <span>&copy; 2026 Northwind Traders — Billing Admin</span>
      </footer>

      {flash ? <FlashToast kind={flash.kind} text={flash.text} /> : null}
    </div>
  );
}
