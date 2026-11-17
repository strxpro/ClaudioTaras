"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { locales, localeNames, type Locale } from "@/lib/i18n";
import type { Dictionary } from "@/lib/dict";
import { useLenis } from "@/components/motion/smooth-scroll";
import { LangLink } from "./lang-switch";
import { LogoMark } from "./logo";

type Props = {
  locale: Locale;
  dict: Dictionary;
  email: string;
  available: boolean;
  socials: { label: string; url: string }[];
};

/** Open or close the site menu from anywhere (header, dock…). */
export const toggleMenu = (open?: boolean) => window.dispatchEvent(new CustomEvent("menu:toggle", { detail: open }));

export function Monogram({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden className={`inline-grid place-items-center leading-none ${className}`}>
      <LogoMark bare size={26} />
    </span>
  );
}

/**
 * Top bar (scrolls away with the page): name on the left; language, menu and a project CTA on the
 * right. The menu itself is a cream sheet that rises from the bottom with the links in big serif.
 */
export function Header({ locale, dict, email, available, socials }: Props) {
  const pathname = usePathname();
  const home = `/${locale}`;
  const onHome = /^\/[a-z]{2}\/?$/.test(pathname ?? "");
  // the about and contact pages are paper-light: ink text there
  const light = /\/(about|contact)\/?$/.test(pathname ?? "");
  // the contact page is the contact: no "start a project" button pointing elsewhere
  const onContact = /\/contact\/?$/.test(pathname ?? "");
  const router = useRouter();
  // back to where the visitor came from on this site, or home
  const goBack = () => {
    if (history.length > 1 && document.referrer.startsWith(location.origin)) router.back();
    else router.push(home);
  };
  const base = onHome ? "" : home;
  const [lang, setLang] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!lang) return;
    const off = (e: PointerEvent) => !langRef.current?.contains(e.target as Node) && setLang(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setLang(false);
    window.addEventListener("pointerdown", off);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("pointerdown", off);
      window.removeEventListener("keydown", esc);
    };
  }, [lang]);

  const skip = (
    <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[400] focus:rounded-full focus:bg-acid focus:px-4 focus:py-2 focus:text-night">
      {dict.nav.skip}
    </a>
  );
  // the home page is one continuous story with its own navigation in the hero
  if (onHome) return skip;

  return (
    <>
      {skip}

      <header className={`absolute inset-x-0 top-0 z-[150] ${light ? "text-[#17131f]" : "text-cream"}`}>
        <div className="flex h-20 items-center justify-between px-[var(--gutter)]">
          <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={goBack}
            aria-label={dict.work.back}
            className={`group grid size-10 place-items-center rounded-full border transition-colors ${light ? "border-[#17131f]/20 hover:bg-[#17131f] hover:text-white" : "border-white/25 hover:bg-white hover:text-night"}`}
          >
            <svg viewBox="0 0 24 24" className="size-4 transition-transform duration-300 group-hover:-translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M19 12H5m6-6-6 6 6 6" />
            </svg>
          </button>
          <Link href={home} aria-label="Claudio Taras" className="group flex items-center gap-2.5">
            <span className="grid size-10 place-items-center rounded-[12px] bg-cream text-night transition-transform duration-500 ease-soft group-hover:-rotate-6 group-hover:scale-105">
              <Monogram className="text-[1.35rem]" />
            </span>
            <span className="hidden text-[0.95rem] font-semibold leading-none sm:block">
              Claudio Taras
              <span className="mt-1 flex items-center gap-1.5 text-[0.72rem] font-normal opacity-60">
                <span className={`size-1.5 rounded-full ${available ? "bg-[#3ddc84]" : "bg-[#ff5a36]"}`} />
                {available ? dict.nav.available : dict.nav.unavailable}
              </span>
            </span>
          </Link>
          </div>

          <div className="mr-[60px] flex items-center gap-2 md:mr-[76px]">
            <div className="relative" ref={langRef}>
              <button
                type="button"
                onClick={() => setLang((v) => !v)}
                aria-expanded={lang}
                aria-haspopup="listbox"
                aria-label={dict.nav.language}
                className="glass flex h-10 items-center gap-1.5 rounded-full bg-white/10 px-3.5 text-sm font-semibold uppercase transition-colors hover:bg-white/20"
              >
                {locale}
                <span className={`text-[0.6rem] transition-transform duration-300 ${lang ? "rotate-180" : ""}`} aria-hidden>
                  ▼
                </span>
              </button>
              <div className={`absolute right-0 top-full pt-2 transition-all duration-500 ease-soft ${lang ? "visible translate-y-0 opacity-100" : "invisible -translate-y-2 opacity-0"}`}>
                <ul className="min-w-44 overflow-hidden rounded-2xl bg-cream p-1.5 text-night shadow-2xl" role="listbox" aria-label={dict.nav.language}>
                  {locales.map((l) => (
                    <li key={l} role="option" aria-selected={l === locale}>
                      <LangLink
                        locale={l}
                        current={locale}
                        onDone={() => setLang(false)}
                        className={`flex items-center justify-between gap-6 rounded-xl px-3 py-2 text-sm transition-colors hover:bg-night/5 ${l === locale ? "font-semibold" : ""}`}
                      >
                        {localeNames[l]}
                        <span className="text-xs uppercase text-night/45">{l}</span>
                      </LangLink>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            {onContact ? null : (
              <a
                href={`${base}#contact`}
                data-label={dict.nav.contact}
                className="hidden h-10 items-center gap-2 rounded-full bg-[#ff5a36] px-4 text-sm font-semibold text-white transition-transform duration-500 ease-soft hover:-translate-y-0.5 md:flex"
              >
                {dict.hero.cta}
                <span aria-hidden>→</span>
              </a>
            )}
          </div>
        </div>
      </header>
    </>
  );
}

function Menu({ locale, dict, email, socials, base }: { locale: Locale; dict: Dictionary; email: string; socials: { label: string; url: string }[]; base: string }) {
  const root = useRef<HTMLDivElement>(null);
  const tl = useRef<gsap.core.Timeline>(null);
  const [open, setOpen] = useState(false);
  const lenis = useLenis();
  const pathname = usePathname();
  const links = [
    { href: `${base}#work`, label: dict.nav.work, n: "02" },
    { href: `${base}#services`, label: dict.nav.services, n: "03" },
    { href: `${base}#process`, label: dict.nav.process, n: "04" },
    { href: `${base}#about`, label: dict.nav.about, n: "05" },
    { href: `${base}#contact`, label: dict.nav.contact, n: "06" },
  ];

  useEffect(() => {
    const on = (e: Event) => setOpen((v) => ((e as CustomEvent<boolean | undefined>).detail ?? !v));
    window.addEventListener("menu:toggle", on);
    return () => window.removeEventListener("menu:toggle", on);
  }, []);

  useEffect(() => {
    const el = root.current!;
    const ctx = gsap.context(() => {
      gsap.set(el, { visibility: "hidden" });
      tl.current = gsap
        .timeline({ paused: true })
        .set(el, { visibility: "visible" })
        .fromTo("[data-backdrop]", { opacity: 0 }, { opacity: 1, duration: 0.5, ease: "power2.out" }, 0)
        .fromTo("[data-panel]", { yPercent: 104, borderRadius: "48px 48px 0 0" }, { yPercent: 0, borderRadius: "28px 28px 0 0", duration: 0.85, ease: "expo.out" }, 0)
        .fromTo("[data-link] > span", { yPercent: 110 }, { yPercent: 0, duration: 0.9, ease: "expo.out", stagger: 0.05 }, 0.15)
        .fromTo("[data-fade]", { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.6, ease: "expo.out", stagger: 0.04 }, 0.3);
    }, el);
    return () => ctx.revert();
  }, []);

  useEffect(() => {
    if (open) {
      tl.current?.timeScale(1).play();
      lenis?.stop();
    } else {
      tl.current?.timeScale(1.7).reverse();
      lenis?.start();
    }
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, lenis]);

  useEffect(() => setOpen(false), [pathname]);

  return (
    <div ref={root} id="site-menu" role="dialog" aria-modal="true" aria-hidden={!open} aria-label={dict.nav.menu} className="fixed inset-0 z-[300]" data-lenis-prevent>
      <div data-backdrop className="glass absolute inset-0 bg-night/50" onClick={() => setOpen(false)} />
      <div data-panel className="absolute inset-x-0 bottom-0 flex max-h-[100svh] flex-col overflow-y-auto bg-cream text-night md:inset-x-[var(--gutter)] md:bottom-3 md:max-h-[calc(100svh-24px)] md:!rounded-[28px]">
        <div className="flex items-center justify-between px-6 pt-5 md:px-10 md:pt-8">
          <p data-fade className="label text-night/50">
            {dict.nav.menu}
          </p>
          <button
            type="button"
            onClick={() => setOpen(false)}
            tabIndex={open ? 0 : -1}
            className="grid size-11 place-items-center rounded-full bg-night text-cream transition-transform duration-500 ease-soft hover:rotate-90"
            aria-label={dict.nav.close}
          >
            ✕
          </button>
        </div>
        <nav aria-label="Menu" className="px-6 pb-6 pt-4 md:px-10">
          {links.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} tabIndex={open ? 0 : -1} data-link data-label={l.label} className="group flex items-baseline justify-between overflow-hidden border-b border-night/10 py-2">
              <span className="headline block text-[clamp(3rem,10vw,7.5rem)] transition-transform duration-500 ease-soft group-hover:translate-x-3 group-hover:italic">{l.label}</span>
              <span className="label text-night/35">{l.n}</span>
            </a>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-5 px-6 pb-8 md:flex-row md:items-end md:justify-between md:px-10 md:pb-10">
          <div data-fade className="flex flex-wrap gap-1.5">
            {locales.map((l) => (
              <LangLink
                key={l}
                locale={l}
                current={locale}
                onDone={() => setOpen(false)}
                className={`rounded-full px-3.5 py-2 text-sm uppercase ${l === locale ? "bg-night text-cream" : "bg-night/5 text-night/70 hover:bg-night/10"}`}
              >
                {l}
              </LangLink>
            ))}
          </div>
          <div data-fade className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <a href={`mailto:${email}`} tabIndex={open ? 0 : -1} className="font-semibold underline-offset-4 hover:underline">
              {email}
            </a>
            {socials.map((s) => (
              <a key={s.label} href={s.url} target="_blank" rel="noreferrer" tabIndex={open ? 0 : -1} className="text-night/60 hover:text-night">
                {s.label} ↗
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
