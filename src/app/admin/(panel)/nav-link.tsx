"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const path = usePathname();
  const active = href === "/admin" ? path === href : path.startsWith(href);
  return (
    <Link
      href={href}
      className={`flex items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
        active ? "bg-ink text-white" : "text-ink/65 hover:bg-ink/5 hover:text-ink"
      }`}
    >
      {children}
    </Link>
  );
}
