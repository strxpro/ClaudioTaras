"use client";

import { useEffect, useRef } from "react";

const INTERACTIVE = "a, button, [role=button], [role=link], [role=option], [role=tab], label, select, summary, [data-cursor], [data-magnetic]";
const TEXT = "input, textarea, [contenteditable=true]";

/**
 * Custom cursor (fine pointers only), readable on every background (difference blend):
 * - a dot exactly on the pointer, and a ring that follows with a soft spring and stretches with speed;
 * - over buttons and links the ring wraps the element (its size and corner radius) and leans towards
 *   the pointer; [data-magnetic] elements lean back towards it too;
 * - over big clickable things (project cards and rows, images) the ring becomes a disc with an arrow
 *   (data-cursor="arrows": ← or → by the side of the element); over text fields a thin caret; data-cursor="-" hides it (the element draws its own);
 * - a click squeezes the ring and sends out a ripple.
 * No text labels. One rAF loop, time-based easing (same feel at 60 or 120 Hz), and it sleeps when idle.
 */
export function Cursor() {
  const dot = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const wave = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const d = dot.current!;
    const r = ring.current!;
    const w = wave.current!;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const html = document.documentElement;
    html.classList.add("has-cursor");

    // pointer (target) and the ring's animated state
    let px = innerWidth / 2;
    let py = innerHeight / 2;
    let x = px;
    let y = py;
    let W = 36;
    let H = 36;
    let R = 18;
    let press = 1;
    let shown = false;
    let raf = 0;
    let last = 0;
    let idle = 0;

    type Mode = "default" | "snap" | "card" | "text" | "hidden";
    let mode: Mode = "default";
    let target: HTMLElement | null = null;
    let rect: DOMRect | null = null;
    let radius = 18;
    // the magnetic element currently leaning (and one easing back)
    const mags: { el: HTMLElement; x: number; y: number; tx: number; ty: number }[] = [];

    const ease = (k: number, dt: number) => 1 - Math.exp(-k * dt);

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - (last || now)) / 1000) || 1 / 120;
      last = now;
      raf = 0;

      // where the ring wants to be, and how big
      let tx = px;
      let ty = py;
      let tw = 36;
      let th = 36;
      let tr = 18;
      if (mode === "snap" && rect) {
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        tx = cx + (px - cx) * 0.14;
        ty = cy + (py - cy) * 0.14;
        tw = rect.width + 12;
        th = rect.height + 12;
        tr = Math.min(radius + 6, th / 2);
      } else if (mode === "card") {
        tw = th = 92;
        tr = 46;
      } else if (mode === "text") {
        tw = 3;
        th = 28;
        tr = 2;
      } else if (mode === "hidden") {
        tw = th = 0;
        tr = 0;
      }
      const kPos = reduced ? 1 : ease(mode === "snap" ? 16 : 22, dt);
      const kSize = reduced ? 1 : ease(14, dt);
      const vx = (tx - x) * kPos;
      const vy = (ty - y) * kPos;
      x += vx;
      y += vy;
      W += (tw - W) * kSize;
      H += (th - H) * kSize;
      R += (tr - R) * kSize;
      press += (1 - press) * ease(12, dt);

      // squash and stretch along the direction of travel (only as a free ring)
      const speed = Math.hypot(vx, vy) / Math.max(dt * 60, 0.5);
      const st = mode === "default" && !reduced ? Math.min(speed / 30, 0.55) : 0;
      const ang = Math.atan2(vy, vx);
      r.style.width = `${W.toFixed(1)}px`;
      r.style.height = `${H.toFixed(1)}px`;
      r.style.borderRadius = `${R.toFixed(1)}px`;
      r.style.transform = `translate3d(${(x - W / 2).toFixed(2)}px, ${(y - H / 2).toFixed(2)}px, 0) rotate(${st ? ang : 0}rad) scale(${((1 + st) * press).toFixed(3)}, ${((1 - st * 0.42) * press).toFixed(3)})`;
      d.style.transform = `translate3d(${px - 3}px, ${py - 3}px, 0) scale(${mode === "default" ? 1 : 0})`;

      // magnetic elements lean towards the pointer and ease back when left
      for (let i = mags.length - 1; i >= 0; i--) {
        const m = mags[i];
        const k = ease(14, dt);
        m.x += (m.tx - m.x) * k;
        m.y += (m.ty - m.y) * k;
        if (m.tx === 0 && m.ty === 0 && Math.abs(m.x) < 0.1 && Math.abs(m.y) < 0.1) {
          m.el.style.translate = "";
          mags.splice(i, 1);
        } else m.el.style.translate = `${m.x.toFixed(2)}px ${m.y.toFixed(2)}px`;
      }

      const moving = Math.abs(tx - x) + Math.abs(ty - y) + Math.abs(tw - W) + Math.abs(th - H) > 0.2 || Math.abs(1 - press) > 0.002 || mags.length;
      idle = moving ? 0 : idle + 1;
      if (idle < 4) raf = requestAnimationFrame(loop);
    };
    const wake = () => {
      if (!raf) {
        last = 0;
        raf = requestAnimationFrame(loop);
      }
    };

    const measure = (): DOMRect | null => (rect = target ? target.getBoundingClientRect() : null);

    const setMode = (m: Mode) => {
      mode = m;
      r.dataset.mode = m;
    };
    const pick = (el: Element | null) => {
      const t = el instanceof Element ? el.closest<HTMLElement>(`${TEXT}, ${INTERACTIVE}`) : null;
      if (t === target) return;
      // let the previous magnet go
      const old = mags.find((m) => m.el === target);
      if (old) old.tx = old.ty = 0;
      target = t;
      rect = null;
      if (!t) return setMode("default");
      if (t.matches(TEXT) && !/checkbox|radio|range|submit|button/.test((t as HTMLInputElement).type || "")) return setMode("text");
      const attr = t.dataset.cursor;
      if (attr === "-") return setMode("hidden");
      const box = measure();
      // a stage you click left / right of centre (the 3D gallery): a disc with ← or →
      if (attr === "arrows" || attr === "prev" || attr === "next" || attr === "view") return setMode("card");
      const big = !box || box.width * box.height > 220 * 140 || box.width > 420;
      if (big) return setMode("card");
      setMode("snap");
      radius = parseFloat(getComputedStyle(t).borderTopLeftRadius) || 8;
    };

    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      px = e.clientX;
      py = e.clientY;
      if (!shown) {
        shown = true;
        x = px;
        y = py;
        html.dataset.cursorOn = "";
      }
      pick(e.target as Element);
      if (mode === "snap") measure();
      const cur = target?.dataset.cursor;
      if (cur === "arrows" && rect) r.dataset.dir = px < rect.left + rect.width / 2 ? "left" : "right";
      else if (cur === "prev") r.dataset.dir = "left";
      else if (cur === "next") r.dataset.dir = "right";
      else if (r.dataset.dir) delete r.dataset.dir;
      if (target?.hasAttribute("data-magnetic") && rect) {
        let m = mags.find((q) => q.el === target);
        if (!m) mags.push((m = { el: target, x: 0, y: 0, tx: 0, ty: 0 }));
        // lean from where it is drawn now (rect includes the current lean)
        const cx = rect.left - m.x + rect.width / 2;
        const cy = rect.top - m.y + rect.height / 2;
        m.tx = Math.max(-10, Math.min(10, (px - cx) * 0.22));
        m.ty = Math.max(-8, Math.min(8, (py - cy) * 0.22));
      }
      wake();
    };
    // the page moves under a still pointer: look at what is under it now and then (a hit test forces
    // a layout, so not on every scrolled frame)
    let scrollTimer: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      if (!shown || scrollTimer) return;
      scrollTimer = setTimeout(() => {
        scrollTimer = undefined;
        pick(document.elementFromPoint(px, py));
        if (mode === "snap") measure();
        wake();
      }, 140);
    };
    const leave = () => {
      shown = false;
      delete html.dataset.cursorOn;
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      w.style.left = `${px}px`;
      w.style.top = `${py}px`;
      w.classList.remove("cursor-wave-go");
      void w.offsetWidth;
      w.classList.add("cursor-wave-go");
      press = 0.82;
      wake();
    };
    // after a click the page often changes under the pointer (route change, sheet opens)
    const up = () => setTimeout(() => pick(document.elementFromPoint(px, py)), 60);

    addEventListener("pointermove", move, { passive: true });
    addEventListener("scroll", onScroll, { passive: true, capture: true });
    html.addEventListener("pointerleave", leave);
    addEventListener("pointerdown", down, { passive: true });
    addEventListener("pointerup", up, { passive: true });
    addEventListener("blur", leave);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(scrollTimer);
      html.classList.remove("has-cursor");
      delete html.dataset.cursorOn;
      mags.forEach((m) => (m.el.style.translate = ""));
      removeEventListener("pointermove", move);
      removeEventListener("scroll", onScroll, { capture: true });
      html.removeEventListener("pointerleave", leave);
      removeEventListener("pointerdown", down);
      removeEventListener("pointerup", up);
      removeEventListener("blur", leave);
    };
  }, []);

  return (
    <>
      <div ref={ring} aria-hidden data-mode="default" className="ct-cursor ct-ring">
        <svg viewBox="0 0 24 24" className="ct-arrow">
          <path d="M7 17 17 7M9 7h8v8" />
        </svg>
      </div>
      <div ref={dot} aria-hidden className="ct-cursor ct-dot" />
      <div ref={wave} aria-hidden className="ct-cursor ct-wave" />
    </>
  );
}
