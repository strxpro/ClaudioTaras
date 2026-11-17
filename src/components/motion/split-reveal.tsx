"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

type Props = {
  as?: "div" | "h1" | "h2" | "h3" | "p";
  /** Lines to reveal, each masked and sliding up. */
  lines: ReactNode[];
  className?: string;
  lineClassName?: string;
  delay?: number;
  stagger?: number;
  /** Animate immediately (e.g. hero) instead of on scroll. */
  immediate?: boolean;
  start?: string;
};

/** Masked line-by-line reveal (the classic editorial "slide up from below the baseline"). */
export function SplitReveal({ as: Tag = "div", lines, className, lineClassName, delay = 0, stagger = 0.09, immediate, start = "top 85%" }: Props) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const inner = el.querySelectorAll<HTMLElement>(".line-mask > span");
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        inner,
        { yPercent: 110, rotate: 2.5 },
        {
          yPercent: 0,
          rotate: 0,
          duration: 1.25,
          ease: "expo.out",
          stagger,
          delay,
          scrollTrigger: immediate ? undefined : { trigger: el, start, toggleActions: "play none none none" },
        },
      );
    }, el);
    return () => ctx.revert();
  }, [delay, stagger, immediate, start]);

  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <Tag ref={ref as any} className={className}>
      {lines.map((line, i) => (
        <span key={i} className={`line-mask ${lineClassName ?? ""}`}>
          <span className="origin-[0%_100%]">{line}</span>
        </span>
      ))}
    </Tag>
  );
}

/** Simple fade/slide-in for blocks of content. */
export function Reveal({ children, className, y = 40, delay = 0 }: { children: ReactNode; className?: string; y?: number; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        { y, opacity: 0 },
        { y: 0, opacity: 1, duration: 1.1, delay, ease: "expo.out", scrollTrigger: { trigger: el, start: "top 88%", toggleActions: "play none none none" } },
      );
    }, el);
    return () => ctx.revert();
  }, [y, delay]);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
