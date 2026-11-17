"use client";

import { useEffect } from "react";
import { scrollPos, viewH, viewW } from "@/lib/scroll-pos";

/**
 * Scroll-speed effects, site-wide:
 * - [data-bend] pictures bend with the scroll: the page behaves like a sheet curved around a horizontal
 *   cylinder whose curve grows with the scroll speed — scrolling down the middle of the screen sags
 *   (both edges of every picture become the same "smile"), scrolling up it bulges, at rest it is flat;
 *   a clip-path polygon per visible picture — no WebGL, text stays put, nothing runs at rest;
 * - [data-vel] elements get --vel (signed, -1…1) and --vela (0…1) for CSS leans;
 * - [data-reveal] elements get the class "is-in" once they scroll into view.
 *
 * The frame loop only writes. It never reads layout (no scrollY, no getBoundingClientRect, no
 * innerWidth): the scroll position comes from Lenis (or from the scroll event, when the layout is still
 * clean), and each picture's size and horizontal place from the IntersectionObserver entry — so the
 * effect never forces the browser to lay the page out a second time in the middle of a frame.
 */
type Box = { left: number; width: number; height: number };

export function ScrollFX() {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const touch = matchMedia("(pointer: coarse)").matches;
    let velEls: HTMLElement[] = [];
    const bendOn = new Map<HTMLElement, Box>();
    let observed: HTMLElement[] = [];
    const pos = scrollPos;
    let last = pos();
    let v = 0;
    let shown = "";
    let bent = false;
    let raf = 0;
    const N = 14;

    const bendIo = new IntersectionObserver(
      (ents) =>
        ents.forEach((e) => {
          const el = e.target as HTMLElement;
          if (e.isIntersecting) {
            const r = e.boundingClientRect;
            bendOn.set(el, { left: r.left, width: r.width, height: r.height });
          } else {
            bendOn.delete(el);
            el.style.clipPath = "";
          }
        }),
      { threshold: [0, 0.5, 1] },
    );

    let sleeping = false;
    const wake = () => {
      if (!sleeping) return;
      sleeping = false;
      raf = requestAnimationFrame(loop);
    };
    const onScroll = wake;
    addEventListener("scroll", onScroll, { passive: true });
    // sizes and places change with the window: measure again (fresh observer entries, read for free)
    let resizeT: ReturnType<typeof setTimeout> | undefined;
    const onResize = () => {
      clearTimeout(resizeT);
      resizeT = setTimeout(() => {
        observed = observed.filter((el) => el.isConnected);
        bendIo.disconnect();
        bendOn.clear();
        observed.forEach((el) => bendIo.observe(el));
      }, 150);
    };
    addEventListener("resize", onResize);

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const y = pos();
      const d = y - last;
      last = y;
      v += (Math.max(-1, Math.min(1, d / 34)) - v) * 0.16;
      if (Math.abs(v) < 0.003) v = 0;

      const str = v.toFixed(3);
      if (str !== shown) {
        shown = str;
        const a = Math.abs(v).toFixed(3);
        for (const t of velEls) {
          t.style.setProperty("--vel", str);
          t.style.setProperty("--vela", a);
        }
      }

      if (v === 0) {
        if (bent) {
          bent = false;
          bendOn.forEach((_, el) => (el.style.clipPath = ""));
        }
        // nothing moves: stop until the next scroll
        cancelAnimationFrame(raf);
        sleeping = true;
        return;
      }
      bent = true;
      const W = viewW();
      const amp = v * Math.min(210, viewH() * 0.2); // px the middle of the screen sags at full speed
      const arc = (x: number) => {
        const u = (x - W / 2) / (W / 2);
        return amp * (1 - Math.min(1, u * u));
      };
      const ys: number[] = new Array(N + 1);
      bendOn.forEach((r, el) => {
        if (r.width < 2 || r.height < 2) return;
        let lo = Infinity;
        let hi = -Infinity;
        for (let i = 0; i <= N; i++) {
          const y = arc(r.left + (r.width * i) / N);
          ys[i] = y;
          if (y < lo) lo = y;
          if (y > hi) hi = y;
        }
        // both edges follow the same curve: the top edge drops by (y - lo), the bottom edge rises by (hi - y)
        let top = "";
        let bot = "";
        for (let i = 0; i <= N; i++) {
          const xl = ((r.width * i) / N).toFixed(1);
          top += `${i ? "," : ""}${xl}px ${(ys[i] - lo).toFixed(1)}px`;
          bot = `${xl}px ${(r.height - (hi - ys[i])).toFixed(1)}px${i ? "," : ""}` + bot;
        }
        el.style.clipPath = `polygon(${top},${bot})`;
      });
    };
    raf = requestAnimationFrame(loop);

    const revealIo = new IntersectionObserver(
      (ents) =>
        ents.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.classList.add("is-in");
          revealIo.unobserve(e.target);
        }),
      { rootMargin: "0px 0px -10% 0px" },
    );
    const seen = new WeakSet<Element>();
    const watch = () => {
      velEls = Array.from(document.querySelectorAll<HTMLElement>("[data-vel]"));
      document.querySelectorAll("[data-reveal]:not(.is-in)").forEach((el) => revealIo.observe(el));
      if (!touch)
        document.querySelectorAll<HTMLElement>("[data-bend]").forEach((el) => {
          if (seen.has(el)) return;
          seen.add(el);
          observed.push(el);
          bendIo.observe(el);
        });
    };
    watch();
    // pages and galleries render later (client navigation, lazy media): pick up new elements — only
    // when elements were added (text updates and attribute changes are ignored)
    let queued = 0;
    const mo = new MutationObserver((recs) => {
      if (queued) return;
      if (!recs.some((r) => Array.prototype.some.call(r.addedNodes, (n: Node) => n.nodeType === 1))) return;
      queued = requestAnimationFrame(() => {
        queued = 0;
        observed = observed.filter((el) => el.isConnected);
        watch();
      });
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(queued);
      clearTimeout(resizeT);
      removeEventListener("scroll", onScroll);
      removeEventListener("resize", onResize);
      revealIo.disconnect();
      bendIo.disconnect();
      mo.disconnect();
    };
  }, []);
  return null;
}
