"use client";

import { useEffect, useRef } from "react";
import { scrollPos, viewH } from "@/lib/scroll-pos";

/**
 * Custom scrollbar (fine pointers; touch devices keep their native overlay bar): a slim violet pill
 * on the right that shows while scrolling or when the pointer comes near, and can be dragged.
 */
export function Scrollbar() {
  const track = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    document.documentElement.classList.add("has-scrollbar");
    const t = track.current!;
    const th = thumb.current!;
    let hide: ReturnType<typeof setTimeout> | undefined;
    let drag: { y: number; top: number } | null = null;
    let raf = 0;
    const show = () => {
      if (t.dataset.on !== "1") t.dataset.on = "1";
      clearTimeout(hide);
      hide = setTimeout(() => !drag && delete t.dataset.on, 1100);
    };
    // the page height is measured when it changes (in the ResizeObserver callback, where the layout is
    // fresh anyway); while scrolling only the cached numbers are used — no layout reads per frame
    let total = document.documentElement.scrollHeight;
    let shownH = "";
    let shownD = "";
    const paint = () => {
      raf = 0;
      const vh = viewH() || innerHeight;
      const max = total - vh;
      const h = Math.max(40, (vh / total) * (vh - 16));
      const y = max > 0 ? (Math.min(max, Math.max(0, scrollPos())) / max) * (vh - 16 - h) : 0;
      const hs = `${h.toFixed(1)}px`;
      if (hs !== shownH) th.style.height = shownH = hs;
      th.style.transform = `translateY(${y.toFixed(1)}px)`;
      const d = max > 4 ? "" : "none";
      if (d !== shownD) t.style.display = shownD = d;
    };
    const onScroll = () => {
      show();
      if (!raf) raf = requestAnimationFrame(paint);
    };
    const near = (e: PointerEvent) => e.clientX > innerWidth - 24 && show();
    const down = (e: PointerEvent) => {
      e.preventDefault();
      drag = { y: e.clientY, top: scrollPos() };
      t.dataset.drag = "1";
      th.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      const doc = document.documentElement;
      const max = doc.scrollHeight - innerHeight;
      const h = th.offsetHeight;
      const y = drag.top + ((e.clientY - drag.y) / (innerHeight - 16 - h)) * max;
      if (window.__lenis) window.__lenis.scrollTo(y, { immediate: true });
      else scrollTo(0, y);
    };
    const up = () => {
      drag = null;
      delete t.dataset.drag;
      show();
    };
    paint();
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll);
    addEventListener("pointermove", near, { passive: true });
    th.addEventListener("pointerdown", down);
    th.addEventListener("pointermove", move);
    th.addEventListener("pointerup", up);
    const ro = new ResizeObserver(() => {
      total = document.documentElement.scrollHeight;
      if (!raf) raf = requestAnimationFrame(paint);
    });
    ro.observe(document.body);
    return () => {
      document.documentElement.classList.remove("has-scrollbar");
      clearTimeout(hide);
      cancelAnimationFrame(raf);
      removeEventListener("scroll", onScroll);
      removeEventListener("resize", onScroll);
      removeEventListener("pointermove", near);
      th.removeEventListener("pointerdown", down);
      th.removeEventListener("pointermove", move);
      th.removeEventListener("pointerup", up);
      ro.disconnect();
    };
  }, []);

  return (
    <div ref={track} className="ct-scrollbar" aria-hidden>
      <div ref={thumb} className="ct-thumb" />
    </div>
  );
}
