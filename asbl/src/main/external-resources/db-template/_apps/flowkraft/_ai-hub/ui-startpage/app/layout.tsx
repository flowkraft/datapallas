import type { Metadata } from "next";
import { Inter } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { AINavbar } from "@/components/layout/AINavbar";
import { RbWebComponentsLoader } from "@/components/layout/RbWebComponentsLoader";
import { Toaster } from "sonner";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
  weight: ["400", "500", "600", "700"],
});

const fontHeading = localFont({
  src: "../assets/fonts/CalSans-SemiBold.woff2",
  variable: "--font-heading",
});

// Brand wordmark font — Cormorant Garamond, self-hosted from vendored woff2
// files so the build never reaches out to Google Fonts. Needs italic ("Data")
// + normal ("Pallas"), weight 700.
const fontBrand = localFont({
  src: [
    { path: "../assets/fonts/cormorant-garamond-latin-700-normal.woff2", weight: "700", style: "normal" },
    { path: "../assets/fonts/cormorant-garamond-latin-700-italic.woff2", weight: "700", style: "italic" },
  ],
  display: "swap",
  variable: "--font-brand",
});

export const metadata: Metadata = {
  title: "DataPallas",
  description: "DataPallas — Explore Data & Build Dashboards",
};

// App-wide default daisyUI theme for first-time visitors (no saved choice).
// Single source of truth in code — change this one value to change the default.
// A user's pick is persisted (localStorage 'rb-theme' + server 'theme.color') and always wins.
const DEFAULT_THEME = "dark";
const noFlashScript = `(function() {
  var DEFAULT_THEME = ${JSON.stringify(DEFAULT_THEME)};
  var THEMES = ['light','dark','cupcake','bumblebee','emerald','corporate','synthwave','retro','cyberpunk','valentine','halloween','garden','forest','aqua','lofi','pastel','fantasy','wireframe','black','luxury','dracula','cmyk','autumn','business','acid','lemonade','night','coffee','winter','dim','nord','sunset','caramellatte','abyss','silk'];
  var cached = localStorage.getItem('rb-theme') || DEFAULT_THEME;
  document.documentElement.setAttribute('data-theme', THEMES.indexOf(cached) >= 0 ? cached : DEFAULT_THEME);
  fetch('/api/config?key=theme.color')
    .then(function(r){ return r.json(); })
    .then(function(d){
      if (d.value && !localStorage.getItem('rb-theme') && THEMES.indexOf(d.value) >= 0) {
        document.documentElement.setAttribute('data-theme', d.value);
        localStorage.setItem('rb-theme', d.value);
      }
    })
    .catch(function(){});
})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${fontHeading.variable} ${fontBrand.variable}`}>
      <body className="font-sans antialiased min-h-screen flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: noFlashScript }} />
        <RbWebComponentsLoader />
        <AINavbar />
        <main className="flex-1 pt-16 w-full">
          <div className="w-full">
            {children}
          </div>
        </main>
        <div id="app-toaster"><Toaster position="top-right" richColors /></div>
      </body>
    </html>
  );
}
