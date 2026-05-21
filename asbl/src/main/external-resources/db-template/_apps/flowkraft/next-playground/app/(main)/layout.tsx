import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";

/**
 * Main App Layout
 *
 * Wraps all main app pages (Home, Tabulator, Charts, etc.)
 * with the sticky Navbar and Footer. The Navbar is position:sticky so the
 * main content does NOT need a top padding offset.
 */
export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Navbar />
      <main className="flex-1 w-full">
        <div className="w-full">
          {children}
        </div>
      </main>
      <Footer />
    </>
  );
}
