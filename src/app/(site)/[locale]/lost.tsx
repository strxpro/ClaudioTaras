"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { defaultLocale, isLocale } from "@/lib/i18n";

export function Lost({ texts }: { texts: Record<string, { title: string; back: string }> }) {
  const first = (usePathname() ?? "").split("/")[1];
  const locale = isLocale(first) ? first : defaultLocale;
  const t = texts[locale] ?? texts[defaultLocale];
  return (
    <main id="main" className="grid min-h-[100svh] place-items-center bg-ink px-6 text-bone">
      <div className="text-center">
        <p className="display text-[30vw] leading-[0.8] text-[#ff5a36] md:text-[22vw]">404</p>
        <p className="mt-6 text-2xl">{t.title}</p>
        <Link href={`/${locale}`} className="eyebrow mt-8 inline-block underline underline-offset-4">
          ← {t.back}
        </Link>
      </div>
    </main>
  );
}
