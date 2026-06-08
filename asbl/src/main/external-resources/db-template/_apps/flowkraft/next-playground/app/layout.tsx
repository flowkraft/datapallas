import type { Metadata } from "next";
import { Inter } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { RbWebComponentsLoader } from "@/components/RbWebComponentsLoader";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

// Brand wordmark serif — Cormorant Garamond, self-hosted from vendored woff2
// files so the build never reaches out to Google Fonts. The "DataPallas"
// wordmark needs italic ("Data") + normal ("Pallas"), weight 700.
const cormorantGaramond = localFont({
  src: [
    { path: "../assets/fonts/cormorant-garamond-latin-700-normal.woff2", weight: "700", style: "normal" },
    { path: "../assets/fonts/cormorant-garamond-latin-700-italic.woff2", weight: "700", style: "italic" },
  ],
  display: "swap",
  variable: "--font-brand",
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
  // App-wide default daisyUI theme for first-time visitors (no saved choice).
  // Single source of truth in code — change this one value to change the default.
  // A user's pick is persisted (localStorage 'rb-theme' + server 'theme.color') and always wins.
  const DEFAULT_THEME = "dark";
  const noFlashScript = `(function() {
  var DEFAULT_THEME = ${JSON.stringify(DEFAULT_THEME)};
  var THEMES = ['light','dark','cupcake','bumblebee','emerald','corporate','synthwave','retro','cyberpunk','valentine','halloween','garden','forest','aqua','lofi','pastel','fantasy','wireframe','black','luxury','dracula','cmyk','autumn','business','acid','lemonade','night','coffee','winter','dim','nord','sunset','caramellatte','abyss','silk'];
  var cached = localStorage.getItem('rb-theme') || DEFAULT_THEME;
  document.documentElement.setAttribute('data-theme', THEMES.indexOf(cached) >= 0 ? cached : DEFAULT_THEME);
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
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${cormorantGaramond.variable}`}>
      <body className="font-sans antialiased min-h-screen flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: noFlashScript }} />
        <RbWebComponentsLoader />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
