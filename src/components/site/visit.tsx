"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";

type Detail = { url: string; name: string; color: string; light: boolean };

/**
 * Awwwards-style "visit site" transition: a colored curtain sweeps in with the site's name
 * and a loading line, the site opens in a new tab, then the curtain sweeps away.
 */
export function visitSite(detail: Detail) {
  window.dispatchEvent(new CustomEvent<Detail>("visit:site", { detail }));
}

export function VisitLink({ url, name, color, light, className, children, cursor }: Detail & { className?: string; children: React.ReactNode; cursor?: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={className}
      data-cursor={cursor ?? "↗"}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        e.preventDefault();
        visitSite({ url, name, color, light });
      }}
    >
      {children}
    </a>
  );
}

export function VisitCurtain({ label }: { label: string }) {
  const root = useRef<HTMLDivElement>(null);
  const [d, setD] = useState<Detail | null>(null);

  useEffect(() => {
    const on = (e: Event) => setD((e as CustomEvent<Detail>).detail);
    window.addEventListener("visit:site", on);
    return () => window.removeEventListener("visit:site", on);
  }, []);

  useEffect(() => {
    if (!d) return;
    const el = root.current!;
    const host = d.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*$/, "");
    el.querySelector("[data-host]")!.textContent = host;
    const tl = gsap.timeline({ onComplete: () => setD(null) });
    tl.set(el, { display: "flex" })
      .fromTo(el, { clipPath: "inset(100% 0 0 0)" }, { clipPath: "inset(0% 0 0 0)", duration: 0.75, ease: "expo.inOut" })
      .fromTo(el.querySelectorAll("[data-line] > span"), { yPercent: 110 }, { yPercent: 0, duration: 0.7, ease: "expo.out", stagger: 0.06 }, "-=0.25")
      .fromTo(el.querySelector("[data-bar]"), { scaleX: 0 }, { scaleX: 1, duration: 0.7, ease: "power2.inOut" }, "<")
      .add(() => {
        const w = window.open(d.url, "_blank", "noopener");
        if (!w) window.location.href = d.url;
      })
      .to(el, { clipPath: "inset(0 0 100% 0)", duration: 0.8, ease: "expo.inOut", delay: 0.35 })
      .set(el, { display: "none" });
    return () => {
      tl.kill();
    };
  }, [d]);

  return (
    <div
      ref={root}
      aria-live="polite"
      className={`fixed inset-0 z-[260] hidden flex-col justify-between p-[var(--gutter)] ${d?.light ? "text-ink" : "text-bone"}`}
      style={{ backgroundColor: d?.color ?? "#0e0e0c" }}
    >
      <p className="eyebrow opacity-70">{label}</p>
      <div>
        <p data-line className="line-mask">
          <span className="display block text-[clamp(3rem,11vw,12rem)] leading-[0.85]">{d?.name}</span>
        </p>
        <p data-line className="line-mask mt-4">
          <span className="serif-italic block text-[clamp(1.4rem,3vw,3rem)]" data-host />
        </p>
      </div>
      <div className="h-[3px] w-full bg-current/15">
        <div data-bar className="h-full origin-left bg-current" />
      </div>
    </div>
  );
}
