"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { useLenis } from "@/components/motion/smooth-scroll";
import { sfx } from "@/lib/sound";

/**
 * Shape transition for in-site navigation. Any internal link (a section anchor or another page)
 * sends three liquid layers up the screen, tangerine, ink, then paper. Their top edge is a curve
 * through six points that rise with staggered delays, so it bulges and settles flat. The paper
 * layer shows the destination's name; underneath, the page jumps; then the layers leave upwards
 * in reverse order with the same wave on their lower edge.
 * Links that handle themselves (preventDefault), new tabs, mail/tel and modified clicks are ignored.
 */
const LAYERS = ["#ff5a36", "#17131f", "#f5efe4"];
const POINTS = 6;
const DUR = 0.6; // seconds for one point to cross the screen
const SPREAD = 0.2; // largest delay between points: how much the edge bends
const STAGGER = 0.075; // between layers

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);

/** Closed path from `base` (100 = bottom, 0 = top) to a smooth edge through ys at even x. */
function shape(ys: number[], base: 0 | 100) {
  const step = 100 / (ys.length - 1);
  let d = `M 0 ${base} V ${ys[0].toFixed(2)} `;
  for (let i = 0; i < ys.length - 1; i++) {
    const x0 = i * step;
    const x1 = (i + 1) * step;
    d += `C ${(x0 + step / 2).toFixed(2)} ${ys[i].toFixed(2)} ${(x1 - step / 2).toFixed(2)} ${ys[i + 1].toFixed(2)} ${x1.toFixed(2)} ${ys[i + 1].toFixed(2)} `;
  }
  return d + `V ${base} Z`;
}

export function PageTransition() {
  const root = useRef<HTMLDivElement>(null);
  const paths = useRef<(SVGPathElement | null)[]>([]);
  const router = useRouter();
  const pathname = usePathname();
  const lenis = useLenis();
  const pending = useRef<null | (() => void)>(null);
  const busy = useRef(false);

  /** Runs the layers once: "in" covers the screen from below, "out" uncovers it upwards. */
  const wave = (mode: "in" | "out") =>
    new Promise<void>((resolve) => {
      // a smooth arc of delays: either the middle leads (a bulge) or the sides do (a dip)
      const phase = Math.random() < 0.5 ? 0 : Math.PI;
      const delays = Array.from({ length: POINTS }, (_, i) => ((Math.sin(phase + (i / (POINTS - 1)) * Math.PI) + 1) / 2) * SPREAD);
      const order = mode === "in" ? [0, 1, 2] : [2, 1, 0];
      const base = mode === "in" ? 100 : 0;
      const total = DUR + SPREAD + STAGGER * (LAYERS.length - 1);
      const t0 = performance.now();
      const tick = () => {
        const t = (performance.now() - t0) / 1000;
        paths.current.forEach((p, li) => {
          if (!p) return;
          const lt = t - order.indexOf(li) * STAGGER;
          p.setAttribute("d", shape(delays.map((dl) => 100 - 100 * ease(clamp01((lt - dl) / DUR))), base));
        });
        if (t < total) requestAnimationFrame(tick);
        else resolve();
      };
      tick();
    });

  const cover = async (label: string) => {
    const el = root.current!;
    // scoped: a page-wide "[data-label]" also hit the pill button (data-label) and left it lifted
    const q = gsap.utils.selector(el);
    el.querySelector("[data-label]")!.textContent = label;
    gsap.set(el, { visibility: "visible" });
    gsap.set(q("[data-label]"), { yPercent: 110 });
    gsap.set(q("[data-bar]"), { scaleX: 0 });
    gsap.set(q("[data-meta]"), { autoAlpha: 0 });
    sfx("transition");
    await wave("in");
    gsap.set(q("[data-meta]"), { autoAlpha: 1 });
    // the name rises while the next page is already on its way (no waiting on the label)
    gsap
      .timeline()
      .to(q("[data-label]"), { yPercent: 0, duration: 0.45, ease: "expo.out" })
      .to(q("[data-bar]"), { scaleX: 1, duration: 0.5, ease: "power2.inOut" }, "<");
  };

  const reveal = async () => {
    const el = root.current!;
    const q = gsap.utils.selector(el);
    gsap.to(q("[data-label]"), { yPercent: -110, duration: 0.28, ease: "expo.in" });
    gsap.to(q("[data-meta]"), { autoAlpha: 0, duration: 0.2, delay: 0.12 });
    await new Promise((r) => setTimeout(r, 90));
    await wave("out");
    gsap.set(el, { visibility: "hidden" });
    paths.current.forEach((p) => p?.setAttribute("d", ""));
    busy.current = false;
  };

  // finish route transitions once the new page is rendered
  useEffect(() => {
    if (pending.current) {
      const done = pending.current;
      pending.current = null;
      requestAnimationFrame(() => requestAnimationFrame(done));
    }
  }, [pathname]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement).closest<HTMLAnchorElement>("a[href]");
      if (!a || a.target === "_blank" || a.hasAttribute("download") || a.dataset.noTransition !== undefined) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || /^\/(admin|api|uploads|media)/.test(url.pathname)) return;
      const samePage = url.pathname === location.pathname;
      // a link to the page you are on (the menu's "Portfolio" on the home page): glide to the top
      // instead of letting the browser reload everything (preloader and all)
      if (samePage && !url.hash) {
        e.preventDefault();
        if (lenis) lenis.scrollTo(0, { duration: 1.4 });
        else window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      const target = samePage ? document.querySelector<HTMLElement>(url.hash) : null;
      if (samePage && !target) return;
      e.preventDefault();
      if (busy.current) return;
      busy.current = true;
      // start fetching the next page now, while the layers cover the screen
      if (!samePage) router.prefetch(url.pathname);
      const label = (a.dataset.label || a.textContent || "").replace(/[↗→←↘✕]/g, "").trim().slice(0, 28) || "Claudio Taras";
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (samePage && target) {
        if (reduced) {
          lenis ? lenis.scrollTo(target, { immediate: true }) : target.scrollIntoView();
          busy.current = false;
          return;
        }
        cover(label).then(() => {
          const top = target.getBoundingClientRect().top + scrollY;
          lenis ? lenis.scrollTo(top, { immediate: true, force: true }) : window.scrollTo(0, top);
          history.replaceState(null, "", url.hash);
          setTimeout(reveal, 80);
        });
        return;
      }
      if (reduced) {
        busy.current = false;
        router.push(url.pathname + url.search + url.hash);
        return;
      }
      cover(label).then(() => {
        pending.current = () => {
          if (url.hash) document.querySelector(url.hash)?.scrollIntoView();
          else window.scrollTo(0, 0);
          setTimeout(reveal, 80);
        };
        router.push(url.pathname + url.search + url.hash, { scroll: !url.hash });
      });
    };
    // hovering (or touching) a link to another page fetches it, so the click finds it ready
    const seen = new Set<string>();
    const warm = (e: Event) => {
      const a = (e.target as HTMLElement | null)?.closest?.<HTMLAnchorElement>("a[href]");
      if (!a || a.target === "_blank") return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname === location.pathname || /^\/(admin|api|uploads|media)/.test(url.pathname) || seen.has(url.pathname)) return;
      seen.add(url.pathname);
      router.prefetch(url.pathname);
    };
    document.addEventListener("click", onClick);
    document.addEventListener("pointerover", warm, { passive: true });
    document.addEventListener("touchstart", warm, { passive: true });
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("pointerover", warm);
      document.removeEventListener("touchstart", warm);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lenis, router]);

  return (
    <div ref={root} aria-hidden className="pointer-events-none fixed inset-0 z-[450] overflow-hidden" style={{ visibility: "hidden" }}>
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        {LAYERS.map((fill, i) => (
          <path
            key={fill}
            ref={(el) => {
              paths.current[i] = el;
            }}
            fill={fill}
            d=""
          />
        ))}
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div data-meta className="text-center">
          <p className="overflow-hidden pt-[0.14em]">
            <span data-label className="headline block text-[clamp(3rem,9vw,8rem)] text-night" />
          </p>
          <div className="mx-auto mt-5 h-[2px] w-32 overflow-hidden rounded-full bg-night/10">
            <div data-bar className="h-full origin-left scale-x-0 bg-night" />
          </div>
        </div>
      </div>
    </div>
  );
}
