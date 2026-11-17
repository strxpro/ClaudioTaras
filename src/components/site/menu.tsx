"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { sfx } from "@/lib/sound";
import s from "./menu.module.css";

type Link = { label: string; href: string };

/**
 * Site menu, kept small: an ink square in the corner (bottom right on desktop, top right on phones).
 * Tapping it grows the square into a compact ink panel — the subpages in big type, right-aligned,
 * the two lines of the button turn into a cross in the same corner. Outside click, Esc or a link
 * closes it. Other buttons can open it with a "menu:toggle" event.
 */
type MenuSet = { links: Link[]; labels: { menu: string; close: string } };

export function SiteMenu({ menus, locale, socials }: { menus: Record<string, MenuSet>; locale: string; socials: { label: string; url: string }[] }) {
  const [open, setOpen] = useState(false);
  // follows the home page's in-place language switch
  const [lang, setLang] = useState(locale);
  useEffect(() => {
    const on = (e: Event) => setLang((e as CustomEvent<string>).detail);
    addEventListener("locale:changed", on);
    return () => removeEventListener("locale:changed", on);
  }, []);
  useEffect(() => setLang(locale), [locale]);
  const { links, labels } = menus[lang] ?? menus[locale];
  const box = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // an ink square on an ink section disappears: look at what is under the button and turn light there
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const btn = el.querySelector("button");
    let raf = 0;
    let lastAt = 0;
    let tone = el.dataset.tone ?? "";
    const luminance = (c: string) => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      if (a < 0.6) return null;
      return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    };
    const probe = () => {
      raf = 0;
      lastAt = performance.now();
      if (!btn) return;
      const b = btn.getBoundingClientRect();
      let dark = false;
      for (const n of document.elementsFromPoint(b.left + b.width / 2, b.top + b.height / 2)) {
        if (el.contains(n)) continue;
        const L = luminance(getComputedStyle(n).backgroundColor);
        if (L !== null) {
          dark = L < 0.42;
          break;
        }
      }
      const t = dark ? "light" : "";
      if (t !== tone) el.dataset.tone = tone = t;
    };
    const queue = () => {
      if (raf) return;
      const wait = Math.max(0, 180 - (performance.now() - lastAt));
      // a plain task between two frames: the layout is already up to date there, so measuring and
      // hit-testing cost next to nothing (inside a frame callback they forced a fresh page layout)
      raf = window.setTimeout(probe, wait) as unknown as number;
    };
    probe();
    const late = setTimeout(probe, 700); // after the page transition has settled
    // (the loader covers the page at first: look again once it has gone; pages without scrolling
    // would otherwise keep the tone they had under it)
    addEventListener("intro:done", queue);
    addEventListener("scroll", queue, { passive: true, capture: true });
    addEventListener("resize", queue);
    return () => {
      clearTimeout(late);
      removeEventListener("intro:done", queue);
      clearTimeout(raf);
      removeEventListener("scroll", queue, { capture: true });
      removeEventListener("resize", queue);
    };
  }, [pathname]);

  useEffect(() => {
    const on = (e: Event) => setOpen((o) => ((e as CustomEvent<boolean | undefined>).detail ?? !o));
    addEventListener("menu:toggle", on);
    return () => removeEventListener("menu:toggle", on);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    addEventListener("keydown", onKey);
    addEventListener("pointerdown", onDown);
    return () => {
      removeEventListener("keydown", onKey);
      removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <div ref={box} data-kb-hide className={`${s.box} ${open ? s.open : ""}`}>
      <nav className={s.panel} aria-label={labels.menu} aria-hidden={!open}>
        {links.map((l, k) => (
          <a key={l.href} href={l.href} className={s.link} style={{ ["--i" as string]: k }} tabIndex={open ? 0 : -1} onClick={() => setOpen(false)}>
            <span className={s.roll} data-copy={l.label}>
              {l.label}
            </span>
          </a>
        ))}
        <p className={s.small} style={{ ["--i" as string]: links.length }}>
          {socials.map((x) => (
            <a key={x.url} href={x.url} target="_blank" rel="noreferrer" tabIndex={open ? 0 : -1}>
              {x.label}
            </a>
          ))}
        </p>
      </nav>
      <button
        type="button"
        data-magnetic
        className={s.btn}
        aria-expanded={open}
        aria-label={open ? labels.close : labels.menu}
        onClick={() => {
          sfx(open ? "tap" : "pop");
          setOpen((o) => !o);
        }}
      >
        <span />
        <span />
      </button>
    </div>
  );
}
