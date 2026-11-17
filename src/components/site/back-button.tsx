"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { maskFlight, viewportBox } from "./morph";

/** sessionStorage key: the project the home page should land on (and morph back into) when it mounts */
export const BACK_KEY = "ct_back";

/**
 * Floating glass "back" button for project pages — the reverse of the open morph, as a mask (no zoom):
 * the hero's window opens to the whole screen while the home page loads underneath; once home has
 * landed on this project's row, the window closes onto that row's picture, the picture drifting into
 * place behind it, and hands over to the real element.
 */
export function BackButton({ href, label, image, slug }: { href: string; label: string; image?: string; slug: string }) {
  const router = useRouter();
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShown(true), 600);
    router.prefetch(href);
    return () => clearTimeout(t);
  }, [href, router]);

  const go = () => {
    try {
      sessionStorage.setItem(BACK_KEY, slug);
    } catch {}
    if (!image || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return router.push(href);

    // 1) the hero's window opens to the whole screen (the picture keeps its size)
    const vp = viewportBox();
    const hero = document.querySelector<HTMLElement>("main [data-vel]")?.getBoundingClientRect();
    const visible = !!hero && hero.bottom > innerHeight * 0.3;
    const cover = maskFlight({ src: [image], base: vp, win0: visible && hero ? hero : vp, win1: vp, radius: 0, dur: 520, fadeIn: visible ? 0 : 0.5, z: 520 });

    // 2) once home has landed on this project's row, the window closes onto that row
    let done = false;
    const land = (e: Event) => {
      if (done) return;
      done = true;
      const target = document.querySelector<HTMLElement>(`[data-morph="${(e as CustomEvent<string>).detail}"]`);
      const r = target?.getBoundingClientRect();
      // the row is not on screen (it was opened from the hero or the 3D gallery): just fade
      if (!target || !r || r.bottom < 0 || r.top > innerHeight) return void cover.fade(560);
      const radius = parseFloat(getComputedStyle(target).borderTopLeftRadius) || 14;
      const fly = maskFlight({
        src: [image],
        base: vp,
        win0: vp,
        win1: { left: r.left, top: r.top, width: r.width, height: r.height },
        // the picture's top-centre ends on the row picture's top-centre
        img1: { x: r.left + r.width / 2 - vp.width / 2, y: r.top },
        radius,
        dur: 900,
        fadeOut: 0.22,
        z: 521,
      });
      cover.frame.remove();
      fly.run.finished.then(() => fly.frame.remove());
    };
    window.addEventListener("wheel:ready", land, { once: true });
    setTimeout(() => {
      if (done) return;
      done = true;
      window.removeEventListener("wheel:ready", land);
      cover.fade(560);
    }, 4000);
    router.push(href);
  };

  return (
    <button
      type="button"
      onClick={go}
      className={`glass fixed bottom-[max(14px,env(safe-area-inset-bottom))] left-[var(--gutter)] max-md:hidden z-[160] flex items-center gap-2 rounded-full bg-night/55 py-3 pl-4 pr-5 text-sm font-semibold text-cream shadow-[0_14px_40px_-12px_rgba(0,0,0,.55)] ring-1 ring-white/15 transition-all duration-700 ease-soft hover:bg-cream hover:text-night [html[data-next]_&]:pointer-events-none [html[data-next]_&]:translate-y-6 [html[data-next]_&]:opacity-0 ${
        shown ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-6 opacity-0"
      }`}
      data-magnetic
    >
      <span aria-hidden>←</span> {label}
    </button>
  );
}
