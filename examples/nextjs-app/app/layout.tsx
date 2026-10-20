import type { ReactNode } from "react";
import Link from "next/link";
import "@your-org/erp-label-studio/styles.css";
import "./globals.css";

export const metadata = { title: "Acme ERP" };

// The host's application shell (server component). The label editor renders
// only inside <main>; the navbar and sidebar are untouched.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="erp-shell">
          <header className="erp-navbar" data-testid="host-navbar">
            <strong>Acme ERP</strong>
            <span>Branch: Chennai</span>
          </header>
          <nav className="erp-sidebar" data-testid="host-sidebar" aria-label="Main">
            <Link href="/">Dashboard</Link>
            <Link href="/stickers">Stickers</Link>
            <Link href="/stickers/antd">Stickers (Ant Design)</Link>
            <Link href="/print">Print labels</Link>
          </nav>
          <main className="erp-content">{children}</main>
        </div>
      </body>
    </html>
  );
}
