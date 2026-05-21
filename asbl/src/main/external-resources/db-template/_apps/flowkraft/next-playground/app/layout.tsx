import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { RbWebComponentsLoader } from "@/components/RbWebComponentsLoader";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "DataPallas - Dashboards & Self Service Portals",
  description: "Bring your reports to the frontend: dashboards, portals, anywhere your users need them",
};

/**
 * Root Layout
 *
 * Provides HTML/body structure, no-flash theme script (runs synchronously before
 * body renders), Toaster, and RbWebComponentsLoader.
 * Navigation is handled by route group layouts:
 *   (main)/layout.tsx  — Main app with Navbar/Footer
 *   (admin)/layout.tsx — Admin area with AdminSidebar/AdminHeader
 *   (portal)/layout.tsx — Self-service portal
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const noFlashScript = `(function() {
  var THEMES = ['light','dark','cupcake','bumblebee','emerald','corporate','synthwave','retro','cyberpunk','valentine','halloween','garden','forest','aqua','lofi','pastel','fantasy','wireframe','black','luxury','dracula','cmyk','autumn','business','acid','lemonade','night','coffee','winter','dim','nord','sunset','caramellatte','abyss','silk'];
  var cached = localStorage.getItem('rb-theme') || 'light';
  document.documentElement.setAttribute('data-theme', THEMES.indexOf(cached) >= 0 ? cached : 'light');
  fetch('/api/settings?key=theme.color')
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d.value && !localStorage.getItem('rb-theme') && THEMES.indexOf(d.value) >= 0) {
        document.documentElement.setAttribute('data-theme', d.value);
        localStorage.setItem('rb-theme', d.value);
      }
    })
    .catch(function() {});
})();`;

  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <body className="font-sans antialiased min-h-screen flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: noFlashScript }} />
        <RbWebComponentsLoader />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
