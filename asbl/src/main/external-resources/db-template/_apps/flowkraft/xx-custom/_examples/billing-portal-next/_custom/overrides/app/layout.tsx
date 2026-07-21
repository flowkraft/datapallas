import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Northwind Traders — Billing Portal",
  description: "View and pay your invoices with Northwind Traders",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // "corporate" is daisyUI's clean, corporate-ready theme — the Northwind Traders portal default,
  // a deliberate switch away from the DataPallas default. A user's pick still wins.
  const DEFAULT_THEME = "corporate";
  const noFlashScript = `(function() {
  var DEFAULT_THEME = ${JSON.stringify(DEFAULT_THEME)};
  var THEMES = ['light','dark','cupcake','bumblebee','emerald','corporate','synthwave','retro','cyberpunk','valentine','halloween','garden','forest','aqua','lofi','pastel','fantasy','wireframe','black','luxury','dracula','cmyk','autumn','business','acid','lemonade','night','coffee','winter','dim','nord','sunset','caramellatte','abyss','silk'];
  var cached = localStorage.getItem('rb-theme') || DEFAULT_THEME;
  document.documentElement.setAttribute('data-theme', THEMES.indexOf(cached) >= 0 ? cached : DEFAULT_THEME);
})();`;

  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <body className="font-sans antialiased min-h-screen flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: noFlashScript }} />
        {children}
      </body>
    </html>
  );
}
