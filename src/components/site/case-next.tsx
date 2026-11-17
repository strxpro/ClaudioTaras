"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { caseHeroRect, endMorph, jumpTop, maskFlight, viewportBox } from "./morph";

gsap.registerPlugin(ScrollTrigger);

type Props = { href: string; name: string; image: string; imageMobile?: string; label: string; hint: string; category: string };

/**
 * Endless case studies. The next project waits at the bottom: as you keep scrolling, a window (mask)
 * opens on its picture from a frame to the full screen while the picture glides behind it (parallax,
 * no zoom) and a loading line fills. At the end the page moves on by itself: the full-screen picture
 * stays while the next project loads, then its window closes onto that page's hero — same picture,
 * same size, so the hand-over is seamless.
 */
export function CaseNext({ href, name, image, imageMobile, label, hint, category }: Props) {
  const root = useRef<HTMLElement>(null);
  const router = useRouter();
  const fired = useRef(false);

  useEffect(() => {
    router.prefetch(href);
    const el = root.current!;
    const html = document.documentElement;
    const phone = matchMedia("(max-width: 768px)").matches;
    const go = () => {
      if (fired.current) return;
      fired.current = true;
      const src = imageMobile && phone ? imageMobile : image;
      const vp = viewportBox();
      // the picture as it covers the screen now, held while the next page loads
      const keep = maskFlight({ src: [src], base: vp, win0: vp, win1: vp, radius: 0, dur: 1, z: 500 });
      html.dataset.morph = "1";
      // a hand still on the wheel must not scroll the next page down: hold the scroll until it is in
      window.__lenis?.stop();
      let done = false;
      const land = () => {
        if (done) return;
        done = true;
        jumpTop();
        window.__lenis?.start();
        const to = caseHeroRect();
        const fly = maskFlight({
          src: [src],
          base: vp,
          win0: vp,
          win1: to,
          img1: { x: 0, y: to.top },
          radius: to.radius,
          dur: 760,
          fadeOut: 0.3,
          z: 501,
        });
        keep.frame.remove();
        fly.run.finished.then(() => {
          fly.frame.remove();
          endMorph();
        });
      };
      window.addEventListener("case:ready", land, { once: true });
      setTimeout(land, 4500);
      jumpTop();
      router.push(href);
    };

    const ctx = gsap.context(() => {
      ScrollTrigger.create({ trigger: el, start: "top 65%", end: "bottom top", onToggle: (s) => html.toggleAttribute("data-next", s.isActive) });
      gsap
        .timeline({
          scrollTrigger: {
            trigger: el,
            start: "top top",
            end: "bottom bottom",
            scrub: 0.4,
            onUpdate: (s) => {
              // phones: the trigger's viewport (svh/clientHeight) can be taller than the real one, so
              // progress may stop at ~0.97 — reaching the end of the page counts too
              if (s.progress > 0.985 || el.getBoundingClientRect().bottom <= innerHeight + 2) go();
            },
          },
        })
        // the window opens…
        .fromTo("[data-frame]", { clipPath: "inset(24% 28% 24% 28% round 18px)" }, { clipPath: "inset(0% 0% 0% 0% round 0px)", ease: "none" }, 0)
        // …while the picture glides down behind it (desktop; on phones it stays put, already in place)
        .fromTo("[data-img]", { yPercent: phone ? 0 : -14 }, { yPercent: 0, ease: "none" }, 0)
        .fromTo("[data-shade]", { opacity: 0.6 }, { opacity: 0.15, ease: "none" }, 0)
        .fromTo("[data-line]", { scaleX: 0 }, { scaleX: 1, ease: "none" }, 0)
        .fromTo("[data-title]", { yPercent: 40 }, { yPercent: 0, ease: "none" }, 0);
    }, el);
    return () => {
      ctx.revert();
      html.removeAttribute("data-next");
    };
  }, [href, image, imageMobile, router]);

  return (
    <section ref={root} data-theme="dark" aria-label={`${label}: ${name}`} className="relative h-[230svh] bg-ink text-white">
      <div className="sticky top-0 h-[100svh] overflow-hidden">
        <div data-frame className="absolute inset-0 overflow-hidden will-change-[clip-path]">
          <picture className="block size-full">
            {imageMobile ? <source media="(max-width: 768px)" srcSet={imageMobile} /> : null}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img data-img src={image} alt="" loading="lazy" className="absolute inset-x-0 top-0 h-full w-full object-cover object-top will-change-transform md:h-[118%]" />
          </picture>
          <div data-shade className="absolute inset-0 bg-ink" />
        </div>
        <div className="gutter pointer-events-none relative flex h-full flex-col items-center justify-center text-center">
          <p className="mb-3 text-sm text-white/80">
            {label} · {category}
          </p>
          <p data-title className="display text-[clamp(3rem,10vw,10rem)] leading-[0.86]">
            {name}
          </p>
          <div className="mt-8 w-48">
            <div className="h-[3px] w-full bg-white/20">
              <div data-line className="h-full origin-left bg-[#ff5a36]" />
            </div>
            <p className="mt-3 text-xs uppercase tracking-[0.2em] text-white/60">{hint} ↓</p>
          </div>
        </div>
      </div>
    </section>
  );
}
