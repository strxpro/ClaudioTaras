"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export type AeEffect = "wipe" | "wipe-side" | "blinds" | "pixels" | "zoom";

type Props = {
  src: string;
  alt?: string;
  effect?: AeEffect;
  /** Background colour of the reveal layers (match the section). */
  cover?: string;
  /** Inner image drifts against the scroll. */
  parallax?: boolean;
  className?: string;
  imgClassName?: string;
  delay?: number;
  eager?: boolean;
};

const COLS = 8;
const ROWS = 5;
const BLINDS = 7;

/**
 * Image with After-Effects-style reveals, played once when it scrolls into view:
 * - wipe / wipe-side: clip mask opens while the picture settles from 1.35× scale
 * - blinds: horizontal strips flip away one after another
 * - pixels: a grid of squares dissolves in random order
 * - zoom: scale + blur settle
 * Optional scrubbed parallax on the inner image. Respects reduced motion.
 */
export function AeImage({ src, alt = "", effect = "wipe", cover = "#ffffff", parallax = true, className, imgClassName, delay = 0, eager }: Props) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current!;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.querySelectorAll<HTMLElement>("[data-cover]").forEach((c) => (c.style.display = "none"));
      return;
    }
    const img = el.querySelector<HTMLElement>("[data-img]")!;
    const end = parallax ? 1.12 : 1;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ delay, scrollTrigger: { trigger: el, start: "top 88%", toggleActions: "play none none none" } });
      if (effect === "wipe" || effect === "wipe-side") {
        const from = effect === "wipe" ? "inset(100% 0% 0% 0%)" : "inset(0% 100% 0% 0%)";
        tl.fromTo(el, { clipPath: from }, { clipPath: "inset(0% 0% 0% 0%)", duration: 1.4, ease: "expo.inOut" }).fromTo(img, { scale: 1.35 }, { scale: end, duration: 1.8, ease: "expo.out" }, "<0.15");
      } else if (effect === "blinds") {
        tl.to("[data-blind]", { scaleY: 0, duration: 0.9, ease: "expo.inOut", stagger: { each: 0.07, from: "start" } }).fromTo(img, { scale: 1.25 }, { scale: end, duration: 1.6, ease: "expo.out" }, "<");
      } else if (effect === "pixels") {
        tl.to("[data-px]", { opacity: 0, duration: 0.25, ease: "power1.out", stagger: { each: 0.018, from: "random" } }).fromTo(img, { scale: 1.2, filter: "grayscale(1)" }, { scale: end, filter: "grayscale(0)", duration: 1.4, ease: "expo.out" }, "<0.2");
      } else {
        tl.fromTo(img, { scale: 1.4, filter: "blur(14px)", opacity: 0 }, { scale: end, filter: "blur(0px)", opacity: 1, duration: 1.6, ease: "expo.out" });
      }
      if (parallax) {
        gsap.fromTo(img, { yPercent: -6 }, { yPercent: 6, ease: "none", scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: true } });
      }
    }, el);
    return () => ctx.revert();
  }, [effect, parallax, delay]);

  return (
    <div ref={root} className={`relative overflow-hidden ${className ?? ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img data-img src={src} alt={alt} loading={eager ? "eager" : "lazy"} decoding="async" className={`block size-full origin-center object-cover will-change-transform ${parallax ? "scale-[1.12]" : ""} ${imgClassName ?? ""}`} />
      {effect === "blinds" ? (
        <div data-cover className="pointer-events-none absolute inset-0 flex flex-col" aria-hidden>
          {Array.from({ length: BLINDS }).map((_, i) => (
            <span key={i} data-blind className="block flex-1 origin-top" style={{ background: cover }} />
          ))}
        </div>
      ) : null}
      {effect === "pixels" ? (
        <div data-cover className="pointer-events-none absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)`, gridTemplateRows: `repeat(${ROWS}, 1fr)` }} aria-hidden>
          {Array.from({ length: COLS * ROWS }).map((_, i) => (
            <span key={i} data-px className="block" style={{ background: cover }} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
