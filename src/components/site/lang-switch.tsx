"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { gsap } from "gsap";
import type { Locale } from "@/lib/i18n";

const TEXT = "h1,h2,h3,h4,p,li,dt,dd,legend,label,blockquote,figcaption,a,button";
const FLAG = "ct_lang_switch";

/** Visible, text-bearing elements in the viewport (outermost only, so lines animate as units). */
function visibleText(): HTMLElement[] {
  const vh = innerHeight;
  const all = Array.from(document.querySelectorAll<HTMLElement>(`main ${TEXT.split(",").join(", main ")}`));
  const out: HTMLElement[] = [];
  for (const el of all) {
    if (!el.textContent?.trim()) continue;
    const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > vh || r.width === 0) continue;
    if (out.some((o) => o.contains(el))) continue;
    out.push(el);
    if (out.length > 70) break;
  }
  return out;
}

export function swapLocale(pathname: string, l: Locale) {
  return pathname.replace(/^\/[a-z]{2}(?=\/|$)/, `/${l}`);
}

/** Switch language with a sentence-by-sentence text animation and no full reload. */
export function useSwitchLocale() {
  const router = useRouter();
  const pathname = usePathname();
  return (l: Locale) => {
    // the home page swaps its words in place (StoryHost): no navigation, nothing reloads
    if (/^\/[a-z]{2}\/?$/.test(location.pathname) && window.__storySwap) return window.__storySwap(l);
    const href = swapLocale(pathname, l) + location.hash;
    const els = visibleText();
    const go = () => {
      try {
        sessionStorage.setItem(FLAG, String(scrollY));
      } catch {}
      router.push(href, { scroll: false });
    };
    if (!els.length || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return go();
    gsap.to(els, { opacity: 0, y: -10, filter: "blur(6px)", duration: 0.35, ease: "power2.in", stagger: { each: 0.012, from: "start" }, onComplete: go });
  };
}

/** Mounted once per locale layout: if we arrived through a language switch, fade the new text in line by line. */
export function LangAnimator() {
  useEffect(() => {
    let y: string | null = null;
    try {
      y = sessionStorage.getItem(FLAG);
      sessionStorage.removeItem(FLAG);
    } catch {}
    if (y === null) return;
    window.scrollTo(0, Number(y));
    requestAnimationFrame(() => {
      const els = visibleText();
      gsap.fromTo(
        els,
        { opacity: 0, y: 14, filter: "blur(8px)" },
        { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.7, ease: "expo.out", stagger: { each: 0.03, from: "start" }, clearProps: "filter,transform" },
      );
    });
  }, []);
  return null;
}

/** Language link that uses the animated switch (falls back to a normal link without JS). */
export function LangLink({ locale, current, className, children, onDone }: { locale: Locale; current: Locale; className?: string; children: React.ReactNode; onDone?: () => void }) {
  const pathname = usePathname();
  const sw = useSwitchLocale();
  return (
    <Link
      href={swapLocale(pathname, locale)}
      // no prefetch: every language link in view would download that page and its pictures
      prefetch={false}
      hrefLang={locale}
      aria-current={locale === current ? "true" : undefined}
      className={className}
      onPointerEnter={() => dispatchEvent(new CustomEvent("locale:prefetch", { detail: locale }))}
      onFocus={() => dispatchEvent(new CustomEvent("locale:prefetch", { detail: locale }))}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey) return;
        e.preventDefault();
        onDone?.();
        if (locale !== current) sw(locale);
      }}
    >
      {children}
    </Link>
  );
}
