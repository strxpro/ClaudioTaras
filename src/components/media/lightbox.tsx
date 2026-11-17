"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { gsap } from "gsap";
import { useLenis } from "@/components/motion/smooth-scroll";

/** `src` is the image (or the poster of `video`, which then plays in the mask). */
export type Shot = { src: string; alt: string; video?: string };

type Open = { index: number; from: DOMRect } | null;

/**
 * Pop-out viewer. The clicked image grows from its exact spot in the grid into a centred mask
 * (fitted to the image's own proportions), with a close ✕ on the image's top-right corner,
 * arrows / keyboard to step through, and it shrinks back into its tile on close.
 */
export function useLightbox(shots: Shot[], labels: { close: string; prev: string; next: string }) {
  const [open, setOpen] = useState<Open>(null);
  const tiles = useRef<(HTMLElement | null)[]>([]);
  const lenis = useLenis();

  const show = useCallback((index: number) => {
    const el = tiles.current[index];
    if (!el) return;
    setOpen({ index, from: el.getBoundingClientRect() });
  }, []);

  useEffect(() => {
    if (open) lenis?.stop();
    else lenis?.start();
  }, [open, lenis]);

  const node = open ? (
    <Viewer
      shots={shots}
      start={open}
      labels={labels}
      tileRect={(i) => tiles.current[i]?.getBoundingClientRect() ?? null}
      onClosed={() => setOpen(null)}
    />
  ) : null;

  return {
    register: (i: number) => (el: HTMLElement | null) => {
      tiles.current[i] = el;
    },
    show,
    portal: typeof document !== "undefined" && node ? createPortal(node, document.body) : null,
  };
}

function fit(w: number, h: number) {
  const maxW = innerWidth * (innerWidth < 768 ? 0.92 : 0.82);
  const maxH = innerHeight * 0.8;
  const s = Math.min(maxW / w, maxH / h);
  const W = w * s;
  const H = h * s;
  return { left: (innerWidth - W) / 2, top: (innerHeight - H) / 2, width: W, height: H };
}

function Viewer({
  shots,
  start,
  labels,
  tileRect,
  onClosed,
}: {
  shots: Shot[];
  start: NonNullable<Open>;
  labels: { close: string; prev: string; next: string };
  tileRect: (i: number) => DOMRect | null;
  onClosed: () => void;
}) {
  const [index, setIndex] = useState(start.index);
  const frame = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const ui = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const closing = useRef(false);

  const place = useCallback((i: number, animate: boolean) => {
    const el = img.current!;
    const go = () => {
      const r = fit(el.naturalWidth || 16, el.naturalHeight || 10);
      gsap.to(frame.current, { ...r, duration: animate ? 0.9 : 0.6, ease: "expo.inOut" });
    };
    if (el.complete && el.naturalWidth) go();
    else el.onload = go;
    void i;
  }, []);

  useEffect(() => {
    const f = frame.current!;
    const r = start.from;
    gsap.set(f, { left: r.left, top: r.top, width: r.width, height: r.height });
    gsap.fromTo(backdrop.current, { opacity: 0 }, { opacity: 1, duration: 0.6, ease: "power2.out" });
    gsap.fromTo(ui.current, { opacity: 0 }, { opacity: 1, duration: 0.4, delay: 0.6 });
    place(start.index, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    const r = tileRect(index);
    gsap.to(ui.current, { opacity: 0, duration: 0.2 });
    gsap.to(backdrop.current, { opacity: 0, duration: 0.6, delay: 0.2 });
    if (r && r.bottom > 0 && r.top < innerHeight) gsap.to(frame.current, { left: r.left, top: r.top, width: r.width, height: r.height, duration: 0.8, ease: "expo.inOut", onComplete: onClosed });
    else gsap.to(frame.current, { opacity: 0, scale: 0.9, duration: 0.5, onComplete: onClosed });
  }, [index, onClosed, tileRect]);

  const step = useCallback(
    (d: number) => {
      const n = (index + d + shots.length) % shots.length;
      gsap.to(img.current?.parentElement ?? null, {
        opacity: 0,
        x: -d * 40,
        duration: 0.25,
        ease: "power2.in",
        onComplete: () => {
          setIndex(n);
          gsap.fromTo(img.current?.parentElement ?? null, { opacity: 0, x: d * 40 }, { opacity: 1, x: 0, duration: 0.5, ease: "expo.out", delay: 0.05 });
          place(n, false);
        },
      });
    },
    [index, place, shots.length],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, step]);

  const shot = shots[index];
  return (
    <div className="fixed inset-0 z-[480]" role="dialog" aria-modal="true" aria-label={shot.alt}>
      <div ref={backdrop} className="absolute inset-0 bg-ink/85 backdrop-blur-md" onClick={close} />
      <div ref={frame} className="fixed overflow-visible">
        <div className="relative size-full overflow-hidden bg-ink shadow-[0_40px_120px_-30px_rgba(0,0,0,.8)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img ref={img} src={shot.src} alt={shot.alt} className="size-full object-cover object-top" draggable={false} />
          {shot.video ? <video key={shot.video} src={shot.video} poster={shot.src} className="absolute inset-0 size-full object-cover object-top" autoPlay muted loop playsInline /> : null}
        </div>
        <div ref={ui}>
          <button
            type="button"
            onClick={close}
            aria-label={labels.close}
            className="absolute -right-3 -top-3 grid size-11 place-items-center bg-acid text-xl text-ink shadow-lg transition-transform duration-300 hover:rotate-90 md:-right-5 md:-top-5"
          >
            ✕
          </button>
        </div>
      </div>
      {shots.length > 1 ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 flex items-center justify-center gap-3">
          <button type="button" onClick={() => step(-1)} aria-label={labels.prev} className="display pointer-events-auto grid h-11 w-14 place-items-center bg-white/10 text-xl text-white backdrop-blur hover:bg-acid hover:text-ink">
            «
          </button>
          <span className="display min-w-16 text-center text-lg text-white tabular-nums">
            {index + 1}/{shots.length}
          </span>
          <button type="button" onClick={() => step(1)} aria-label={labels.next} className="display pointer-events-auto grid h-11 w-14 place-items-center bg-white/10 text-xl text-white backdrop-blur hover:bg-acid hover:text-ink">
            »
          </button>
        </div>
      ) : null}
    </div>
  );
}
