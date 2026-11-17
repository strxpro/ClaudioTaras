"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { VisitLink } from "./visit";

/** Floating CTA on project pages (opposite the back button): visit the live site, or ask for a demo. */
export function VisitFab({ url, name, label, demoHref, demoLabel }: { url?: string; name: string; label: string; demoHref: string; demoLabel: string }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShown(true), 700);
    return () => clearTimeout(t);
  }, []);
  const cls = `fixed bottom-[max(14px,env(safe-area-inset-bottom))] left-[var(--gutter)] z-[160] flex items-center gap-2 rounded-full bg-[#ff5a36] px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_40px_-12px_rgba(0,0,0,.55)] transition-all duration-700 ease-soft hover:-translate-y-0.5 hover:bg-cream [html[data-next]_&]:pointer-events-none [html[data-next]_&]:translate-y-6 [html[data-next]_&]:opacity-0 ${
    shown ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-6 opacity-0"
  }`;
  if (!url)
    return (
      <Link href={demoHref} className={cls} data-label={demoLabel}>
        {demoLabel} <span aria-hidden>→</span>
      </Link>
    );
  return (
    <VisitLink url={url} name={name} color="#ffd23f" light className={cls}>
      {label} <span aria-hidden>↗</span>
    </VisitLink>
  );
}
