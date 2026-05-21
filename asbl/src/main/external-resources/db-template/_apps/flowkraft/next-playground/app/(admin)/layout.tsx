import type { Metadata } from "next";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminHeader } from "@/components/admin/AdminHeader";

export const metadata: Metadata = {
  title: "Admin — DataPallas",
  description: "DataPallas Admin Dashboard",
};

/**
 * Admin Layout
 *
 * Header is full-width fixed at top (z-50) — stays visible when sidebar toggles.
 * Sidebar is repositioned to top:64px via CSS override so it sits below the header.
 * Main content is offset right by sidebar and below header.
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sidebarCss = `
    :root { --sidebar-w: 256px; --header-h: 64px; }
    html.admin-sidebar-closed { --sidebar-w: 0px; }
    #adminSidebar { top: var(--header-h) !important; height: calc(100vh - var(--header-h)) !important; }
    #adminMain { margin-left: var(--sidebar-w); margin-top: var(--header-h); transition: margin-left 0.2s ease; }
  `

  const sidebarScript = `
    (function() {
      if (localStorage.getItem('rb-admin-sidebar') === 'closed') {
        document.documentElement.classList.add('admin-sidebar-closed');
      }
    })();
  `

  return (
    <>
      <style>{sidebarCss}</style>
      <script dangerouslySetInnerHTML={{ __html: sidebarScript }} />
      {/* Full-width header always visible above sidebar */}
      <AdminHeader />
      {/* Sidebar positioned below header via CSS override */}
      <AdminSidebar />
      {/* Main content offset right of sidebar and below header */}
      <div id="adminMain" className="flex flex-col bg-base-100" style={{minHeight:'calc(100vh - 64px)'}}>
        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
        <footer className="border-t border-base-300 bg-base-200 text-base-content/60 text-sm py-4 px-6 flex justify-between items-center">
          <span>&copy; 2026 FlowKraft Systems</span>
        </footer>
      </div>
    </>
  )
}
