"use client";

import { useEffect, useRef } from "react";

type Props = {
  /** how many balls drop into each column */
  counts: number[];
  onCounts: (c: number[]) => void;
  className?: string;
};

type Ball = { x: number; y: number; vx: number; vy: number; sprite: number; col: number };

const COLORS = ["#b9cbe0", "#ffd23f", "#9fe0c0", "#ffb38a"];
const FLAGS: [string, string, string, "v" | "h"][] = [
  ["#009246", "#ffffff", "#ce2b37", "v"],
  ["#ffffff", "#dc143c", "#dc143c", "h"],
  ["#012169", "#ffffff", "#c8102e", "h"],
  ["#aa151b", "#f1bf00", "#aa151b", "h"],
  ["#000000", "#dd0000", "#ffce00", "h"],
  ["#0055a4", "#ffffff", "#ef4135", "v"],
];

/** One ball sprite: a coloured sphere with an icon for its column. */
function sprite(size: number, col: number, variant: number) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const r = size / 2;
  g.save();
  g.beginPath();
  g.arc(r, r, r, 0, Math.PI * 2);
  g.clip();
  if (col === 2) {
    // languages: a round flag
    const [a, b, d, dir] = FLAGS[variant % FLAGS.length];
    for (let k = 0; k < 3; k++) {
      g.fillStyle = [a, b, d][k];
      if (dir === "v") g.fillRect((k * size) / 3, 0, size / 3 + 1, size);
      else g.fillRect(0, (k * size) / 3, size, size / 3 + 1);
    }
    if (variant % FLAGS.length === 2) {
      g.strokeStyle = "#fff";
      g.lineWidth = size * 0.16;
      g.beginPath();
      g.moveTo(r, 0);
      g.lineTo(r, size);
      g.moveTo(0, r);
      g.lineTo(size, r);
      g.stroke();
      g.strokeStyle = "#c8102e";
      g.lineWidth = size * 0.08;
      g.stroke();
    }
  } else {
    g.fillStyle = COLORS[col];
    g.fillRect(0, 0, size, size);
    const ink = col === 1 ? "#3b2a00" : "#17131f";
    g.strokeStyle = ink;
    g.fillStyle = ink;
    g.lineWidth = size * 0.065;
    g.lineCap = "round";
    g.lineJoin = "round";
    const u = size / 100;
    if (col === 0) {
      // calendar
      g.beginPath();
      g.roundRect(28 * u, 32 * u, 44 * u, 38 * u, 6 * u);
      g.stroke();
      g.beginPath();
      g.moveTo(28 * u, 44 * u);
      g.lineTo(72 * u, 44 * u);
      g.moveTo(39 * u, 26 * u);
      g.lineTo(39 * u, 36 * u);
      g.moveTo(61 * u, 26 * u);
      g.lineTo(61 * u, 36 * u);
      g.stroke();
      for (let k = 0; k < 3; k++) g.fillRect((35 + k * 11) * u, 52 * u, 6 * u, 6 * u);
    } else if (col === 1) {
      // browser window
      g.beginPath();
      g.roundRect(24 * u, 30 * u, 52 * u, 40 * u, 7 * u);
      g.stroke();
      g.beginPath();
      g.moveTo(24 * u, 41 * u);
      g.lineTo(76 * u, 41 * u);
      g.stroke();
      for (let k = 0; k < 3; k++) {
        g.beginPath();
        g.arc((31 + k * 6) * u, 35.5 * u, 1.8 * u, 0, Math.PI * 2);
        g.fill();
      }
      g.fillRect(31 * u, 49 * u, 22 * u, 5 * u);
      g.fillRect(31 * u, 58 * u, 34 * u, 4 * u);
    } else {
      // lightning: a fast reply
      g.beginPath();
      g.moveTo(54 * u, 22 * u);
      g.lineTo(34 * u, 54 * u);
      g.lineTo(49 * u, 54 * u);
      g.lineTo(44 * u, 78 * u);
      g.lineTo(66 * u, 44 * u);
      g.lineTo(51 * u, 44 * u);
      g.closePath();
      g.fill();
    }
  }
  // glossy light from the top left
  const hi = g.createRadialGradient(r * 0.6, r * 0.5, 0, r * 0.6, r * 0.5, r * 1.3);
  hi.addColorStop(0, "rgba(255,255,255,0.45)");
  hi.addColorStop(0.5, "rgba(255,255,255,0)");
  hi.addColorStop(1, "rgba(0,0,0,0.12)");
  g.fillStyle = hi;
  g.fillRect(0, 0, size, size);
  g.restore();
  return c;
}

/**
 * Stats playground: balls rain into four columns and pile up under their numbers (calendar = years,
 * window = projects, flags = languages, lightning = hours to reply). Grab and throw them, tap one to
 * make it jump, or sweep the pointer through a pile — simple circle physics, paused off screen.
 */
export function Balls({ counts, onCounts, className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const cb = useRef(onCounts);
  cb.current = onCounts;

  useEffect(() => {
    const canvas = ref.current!;
    const g = canvas.getContext("2d")!;
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    let W = 0;
    let H = 0;
    let R = 24;
    const balls: Ball[] = [];
    let sprites: HTMLCanvasElement[][] = [];
    // soft shadow baked once (canvas shadowBlur per ball per frame was the stutter)
    let shade: HTMLCanvasElement | null = null;
    const build = () => {
      const size = Math.ceil(R * 2 * dpr);
      sprites = [0, 1, 2, 3].map((col) => (col === 2 ? FLAGS.map((_, v) => sprite(size, col, v)) : [sprite(size, col, 0)]));
      const sh = document.createElement("canvas");
      sh.width = sh.height = Math.ceil(R * 3 * dpr);
      const c = sh.getContext("2d")!;
      const m = sh.width / 2;
      const gr = c.createRadialGradient(m, m, R * 0.6 * dpr, m, m, R * 1.45 * dpr);
      gr.addColorStop(0, "rgba(23,19,31,0.22)");
      gr.addColorStop(1, "rgba(23,19,31,0)");
      c.fillStyle = gr;
      c.fillRect(0, 0, sh.width, sh.height);
      shade = sh;
    };
    const geo = () => {
      const floor = H - 28;
      const wallTop = H * 0.6;
      const pad = W < 768 ? 12 : 40;
      const span = (W - pad * 2) / 4;
      const edges = [0, 1, 2, 3, 4].map((i) => pad + i * span);
      return { floor, wallTop, edges };
    };
    const resize = () => {
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      R = Math.max(14, Math.min(30, W * 0.021));
      build();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    const queue: number[] = [];
    const left = counts.slice();
    while (left.some((n) => n > 0)) left.forEach((n, i) => n > 0 && (queue.push(i), left[i]--));
    let spawnAt = 0;

    let grab: { b: Ball; ox: number; oy: number; px: number; py: number; t: number; moved: number } | null = null;
    let ptr: { x: number; y: number; vx: number; vy: number; t: number } | null = null;
    // the canvas rect is cached (re-read on scroll/resize), not measured on every pointer move
    let rect: DOMRect | null = null;
    const pos = (e: PointerEvent) => {
      const r = rect ?? (rect = canvas.getBoundingClientRect());
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const forget = () => (rect = null);
    addEventListener("scroll", forget, { passive: true });
    addEventListener("resize", forget);
    const hit = (p: { x: number; y: number }) => balls.find((b) => (b.x - p.x) ** 2 + (b.y - p.y) ** 2 < R * R * 1.4);
    const down = (e: PointerEvent) => {
      const p = pos(e);
      const b = hit(p);
      if (!b) return;
      e.preventDefault();
      canvas.setPointerCapture?.(e.pointerId);
      grab = { b, ox: b.x - p.x, oy: b.y - p.y, px: p.x, py: p.y, t: performance.now(), moved: 0 };
      canvas.style.cursor = "grabbing";
    };
    const move = (e: PointerEvent) => {
      const p = pos(e);
      const now = performance.now();
      if (ptr) {
        const dt = Math.max(8, now - ptr.t) / 1000;
        ptr.vx = (p.x - ptr.x) / dt;
        ptr.vy = (p.y - ptr.y) / dt;
      }
      ptr = { x: p.x, y: p.y, vx: ptr?.vx ?? 0, vy: ptr?.vy ?? 0, t: now };
      if (!grab) {
        canvas.style.cursor = hit(p) ? "grab" : "";
        return;
      }
      const dt = Math.max(1, now - grab.t) / 1000;
      grab.moved += Math.abs(p.x - grab.px) + Math.abs(p.y - grab.py);
      grab.b.vx = (p.x - grab.px) / dt;
      grab.b.vy = (p.y - grab.py) / dt;
      grab.b.x = p.x + grab.ox;
      grab.b.y = p.y + grab.oy;
      grab.px = p.x;
      grab.py = p.y;
      grab.t = now;
    };
    const up = () => {
      if (grab) {
        if (grab.moved < 6) {
          // a tap: the ball jumps
          grab.b.vy = -900 - Math.random() * 300;
          grab.b.vx = (Math.random() - 0.5) * 300;
        } else {
          grab.b.vx = Math.max(-2600, Math.min(2600, grab.b.vx));
          grab.b.vy = Math.max(-2600, Math.min(2600, grab.b.vy));
        }
        canvas.style.cursor = "grab";
      }
      grab = null;
    };
    const leave = () => (ptr = null);
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerleave", leave);
    addEventListener("pointerup", up);

    // paused off screen; the balls start raining once a third of the playground is in view
    let visible = false;
    let started = false;
    const io = new IntersectionObserver(
      ([e]) => {
        visible = e.isIntersecting;
        if (e.intersectionRatio >= 0.3) started = true;
      },
      { threshold: [0, 0.3] },
    );
    io.observe(canvas);

    const step = (dt: number) => {
      const { floor, wallTop, edges } = geo();
      for (const b of balls) {
        if (grab?.b === b) continue;
        b.vy += 2200 * dt;
        b.vx *= 0.999;
        // sweeping the pointer through the balls pushes them
        if (ptr && !grab) {
          const dx = b.x - ptr.x;
          const dy = b.y - ptr.y;
          const d2 = dx * dx + dy * dy;
          const reach = R * 2.2;
          if (d2 < reach * reach) {
            const k = (1 - Math.sqrt(d2) / reach) * 0.06;
            b.vx += ptr.vx * k;
            b.vy += Math.min(0, ptr.vy * k) - 40 * k;
          }
        }
        b.x += b.vx * dt;
        b.y += b.vy * dt;
      }
      for (let it = 0; it < 3; it++) {
        for (let i = 0; i < balls.length; i++) {
          const a = balls[i];
          for (let j = i + 1; j < balls.length; j++) {
            const b = balls[j];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const d2 = dx * dx + dy * dy;
            const min = R * 2;
            if (d2 >= min * min || d2 === 0) continue;
            const d = Math.sqrt(d2);
            const nx = dx / d;
            const ny = dy / d;
            const push = (min - d) / 2;
            const wa = grab?.b === a ? 0 : grab?.b === b ? 2 : 1;
            const wb = grab?.b === b ? 0 : grab?.b === a ? 2 : 1;
            a.x -= nx * push * wa;
            a.y -= ny * push * wa;
            b.x += nx * push * wb;
            b.y += ny * push * wb;
            const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
            if (rv < 0) {
              const k = -1.25 * rv * 0.5;
              a.vx -= k * nx;
              a.vy -= k * ny;
              b.vx += k * nx;
              b.vy += k * ny;
            }
          }
        }
        for (const b of balls) {
          if (b.y > floor - R) {
            b.y = floor - R;
            b.vy *= -0.3;
            b.vx *= 0.9;
          }
          if (b.y < R) {
            b.y = R;
            b.vy = Math.abs(b.vy) * 0.4;
          }
          if (b.x < R) {
            b.x = R;
            b.vx *= -0.5;
          }
          if (b.x > W - R) {
            b.x = W - R;
            b.vx *= -0.5;
          }
          for (let k = 1; k < 4; k++) {
            const wx = edges[k];
            if (b.y + R * 0.3 < wallTop) {
              const dx = b.x - wx;
              const dy = b.y - wallTop;
              const d = Math.hypot(dx, dy);
              if (d < R && d > 0) {
                b.x = wx + (dx / d) * R;
                b.y = wallTop + (dy / d) * R;
              }
              continue;
            }
            if (Math.abs(b.x - wx) < R) {
              b.x = b.x < wx ? wx - R : wx + R;
              b.vx *= -0.4;
            }
          }
        }
      }
    };

    const draw = () => {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      const { floor, wallTop, edges } = geo();
      g.strokeStyle = "rgba(23,19,31,0.12)";
      g.lineWidth = 1;
      g.beginPath();
      for (let k = 1; k < 4; k++) {
        g.moveTo(edges[k] + 0.5, wallTop);
        g.lineTo(edges[k] + 0.5, floor);
      }
      g.moveTo(edges[0], floor + 0.5);
      g.lineTo(edges[4], floor + 0.5);
      g.stroke();
      if (shade) for (const b of balls) g.drawImage(shade, b.x - R * 1.5, b.y - R * 1.5 + 4, R * 3, R * 3);
      for (const b of balls) {
        const set = sprites[b.col];
        const sp = set?.[b.sprite % set.length];
        if (sp) g.drawImage(sp, b.x - R, b.y - R, R * 2, R * 2);
      }
    };

    let last = performance.now();
    let lastDraw = 0;
    let lastCounts = "";
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      if (!visible) return;
      if (started && queue.length && now > spawnAt) {
        const col = queue.shift()!;
        const { edges } = geo();
        const cx = (edges[col] + edges[col + 1]) / 2;
        balls.push({ x: cx + (Math.random() - 0.5) * R * 2, y: -R * 2, vx: (Math.random() - 0.5) * 80, vy: 200, sprite: balls.filter((b) => b.col === col).length, col });
        spawnAt = now + 70;
      }
      step(dt / 2);
      step(dt / 2);
      // settled and untouched: keep the last frame instead of redrawing the same picture
      let moving = !!grab || queue.length > 0 || (ptr !== null && now - ptr.t < 120);
      for (let i = 0; !moving && i < balls.length; i++) moving = Math.abs(balls[i].vx) + Math.abs(balls[i].vy) > 6;
      if (moving || now - lastDraw > 500) {
        draw();
        lastDraw = now;
      }
      const { edges, wallTop } = geo();
      const c = [0, 0, 0, 0];
      for (const b of balls) {
        if (b.y < wallTop - R) continue;
        for (let k = 0; k < 4; k++) if (b.x >= edges[k] && b.x < edges[k + 1]) c[k]++;
      }
      const key = c.join(",");
      if (key !== lastCounts) {
        lastCounts = key;
        cb.current(c);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerleave", leave);
      removeEventListener("pointerup", up);
      removeEventListener("scroll", forget);
      removeEventListener("resize", forget);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counts]);

  return <canvas ref={ref} className={className} aria-hidden />;
}
