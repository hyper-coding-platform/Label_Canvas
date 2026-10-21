import type { ReactNode } from "react";
import "@pythonprakash/erp-label-studio/styles.css";

export const metadata = { title: "Label Studio Playground" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f6f7f9" }}>{children}</body>
    </html>
  );
}
