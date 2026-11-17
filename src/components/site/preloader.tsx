"use client";

import { useEffect, useRef, useState } from "react";
import s from "./preloader.module.css";

type Props = { label: string; names?: string[]; role?: string; cta?: string; locale?: string; word?: string };

declare global {
  interface Window {
    __ctBooted?: boolean;
    __plGo?: number;
  }
}

/**
 * Starts the loader's animations right after the first paint (two frames in), straight from the HTML:
 * on a phone the first frame of this long page can take a while, and animations started before it
 * would be over by the time anything shows. Runs during parsing, long before React hydrates.
 */
const BOOT = `(function(){var r=document.currentScript.parentNode;if(window.__ctBooted)return;requestAnimationFrame(function(){requestAnimationFrame(function(){window.__plGo=performance.now();r.setAttribute("data-go","")})})})()`;

/**
 * First-visit loader. Everything that moves is CSS on transform / opacity (plus a CSS counter), so it
 * keeps a steady pace while the page hydrates and builds its 3D underneath:
 *  - the name rises letter by letter, big; the italic word follows; counter and a fine line run to 92;
 *  - once fonts, hydration and the page's load are in (never under ~1.7 s, never over ~4 s) they finish to 100;
 *  - the letters leave through their masks, a paper curtain and an ink one slide away on curved edges
 *    ("intro:open" lets the hero start underneath, "intro:done" when the loader has gone).
 * JavaScript only flips three data attributes and fires the events.
 */
export function Preloader({ label, role = "", word = "Portfolio" }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const [done, setDone] = useState(false);
  const name = "Claudio Taras";

  useEffect(() => {
    const el = root.current!;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let announced = false;
    let lock: ReturnType<typeof setInterval> | undefined;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (fn: () => void, ms: number) => timers.push(setTimeout(fn, ms));
    const announce = () => {
      if (announced) return;
      announced = true;
      clearInterval(lock);
      window.__lenis?.start();
      document.documentElement.style.overflow = "";
      window.__ctBooted = true;
      document.documentElement.dataset.intro = "done";
      later(() => dispatchEvent(new Event("intro:done")), 0);
    };
    if (window.__ctBooted || reduced) {
      el.style.display = "none";
      announce();
      setDone(true);
      return;
    }
    document.documentElement.style.overflow = "hidden";
    lock = setInterval(() => window.__lenis?.stop(), 100);
    // the boot script normally did this already; a client-only mount starts here
    if (!el.hasAttribute("data-go")) {
      window.__plGo = performance.now();
      el.setAttribute("data-go", "");
    }
    const go = window.__plGo ?? performance.now();

    let fonts = false;
    let loaded = document.readyState === "complete";
    document.fonts?.ready.then(
      () => (fonts = true),
      () => (fonts = true),
    );
    const onLoad = () => (loaded = true);
    if (!loaded) addEventListener("load", onLoad, { once: true });

    const exit = () => {
      el.setAttribute("data-exit", "");
      later(() => dispatchEvent(new Event("intro:open")), 420);
      later(announce, 1350);
      later(() => setDone(true), 1750);
    };
    const finish = () => {
      // carry the running values over so phase 2 continues from where phase 1 is (no jump back)
      const count = el.querySelector<HTMLElement>("[data-count]")!;
      const bar = el.querySelector<HTMLElement>("[data-bar]")!;
      count.style.setProperty("--n", getComputedStyle(count).getPropertyValue("--n").trim() || "0");
      bar.style.transform = getComputedStyle(bar).transform;
      el.setAttribute("data-ready", "");
      later(exit, 520);
    };

    // poll lightly (no per-frame work while the page is busy booting)
    const MIN = 1700;
    const SOFT = 2900; // stop waiting for every image after this
    const MAX = 4000;
    const poll = setInterval(() => {
      const t = performance.now() - go;
      if (t < MIN) return;
      if ((fonts && (loaded || t > SOFT)) || t > MAX) {
        clearInterval(poll);
        finish();
      }
    }, 100);

    return () => {
      clearInterval(lock);
      clearInterval(poll);
      removeEventListener("load", onLoad);
      timers.forEach(clearTimeout);
      document.documentElement.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (done) return null;
  let i = 0;
  return (
    <div ref={root} role="status" aria-label={label} className={s.root} suppressHydrationWarning>
      <div className={s.under} aria-hidden />
      <div className={s.sheet}>
        <div className={s.inner}>
          <p className={s.name} aria-hidden>
            {name.split(" ").map((w, wi) => (
              <span key={wi} className={s.wordMask}>
                {[...w].map((ch, k) => (
                  <span key={k} className={s.ch} style={{ ["--i" as string]: i++ }}>
                    {ch}
                  </span>
                ))}
              </span>
            ))}
          </p>
          <p className={s.word} aria-hidden>
            {word}
          </p>
        </div>
        <div className={s.foot} aria-hidden>
          <span className={s.role}>{role}</span>
          <span data-count className={s.count} />
        </div>
        <span className={s.track} aria-hidden>
          <i data-bar className={s.bar} />
        </span>
      </div>
      <script dangerouslySetInnerHTML={{ __html: BOOT }} />
    </div>
  );
}
