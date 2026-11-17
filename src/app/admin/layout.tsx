import type { Metadata } from "next";
import "../globals.css";
import { fontVars } from "@/lib/fonts";

export const metadata: Metadata = {
  title: "Panel — Claudio Taras",
  robots: { index: false, follow: false },
};

export default function AdminRoot({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl" className={`${fontVars} admin`} style={{ background: "#f2f0ec" }}>
      {/* inline: the site's unlayered `body { background: ink }` would beat a utility class */}
      <body className="min-h-screen text-ink antialiased" style={{ background: "#f2f0ec" }}>
        {children}
      </body>
    </html>
  );
}
