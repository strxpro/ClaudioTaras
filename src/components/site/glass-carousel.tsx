"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { sfx } from "@/lib/sound";
import { morphTo } from "./morph";
import s from "./glass-carousel.module.css";

export type WorkItem = {
  slug: string;
  name: string;
  category: string;
  year: number;
  tagline: string;
  accent: string;
  /** desktop screenshot (16:10) */
  cover: string;
  /** phone screenshot (tall) */
  mobile: string;
  /** "in progress" label */
  wip?: string;
};

type Labels = { title: string; all: string; open: string; hint: string };

const MAX = 32;

const VERT = `#version 300 es
in vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

/*
 * The strip of project screens seen through liquid glass. Every pixel maps from the screen to the
 * strip: in the middle 1:1, towards both edges through a "glass roll" — the strip runs faster
 * (squeezed), is magnified and twisted (rising on the right, sinking on the left), the colour
 * channels split apart and a rainbow rim lights the card edges. All of it grows with the speed.
 * Three texture reads per pixel, no loops (quick to compile everywhere, D3D included).
 */
const FRAG = `#version 300 es
precision highp float;
precision highp sampler2DArray;
uniform sampler2DArray uTex;
uniform vec2 uRes;
uniform float uDpr;
uniform float uOff;
uniform float uSpeed;
uniform float uDir;
uniform vec2 uCard;
uniform float uGap;
uniform float uN;
uniform float uR;
uniform float uCY;
uniform vec3 uBg;
uniform float uIntro;
uniform float uHover;
uniform vec4 uMeta[${MAX}];
uniform float uDim[${MAX}];
out vec4 outColor;

vec3 cardAt(vec2 q, out float dist, out float valid) {
  float stepX = uCard.x + uGap;
  float f = q.x / stepX + uOff;
  float i = floor(f + 0.5);
  vec2 l = vec2((f - i) * stepX, q.y);
  vec2 dd = abs(l) - uCard * 0.5 + uR;
  float d = min(max(dd.x, dd.y), 0.0) + length(max(dd, 0.0)) - uR;
  valid = (i >= 0.0 && i < uN) ? 1.0 : 0.0;
  dist = valid > 0.5 ? d : 1e4;
  int k = int(clamp(i, 0.0, ${MAX - 1}.0));
  vec2 uv = clamp(vec2(l.x / uCard.x + 0.5, 0.5 - l.y / uCard.y), 0.0, 1.0);
  vec4 meta = uMeta[k];
  vec3 tex = texture(uTex, vec3(uv, float(k))).rgb;
  vec3 col = mix(meta.rgb * 0.45 + 0.06, tex, meta.a);
  col *= 1.0 - 0.62 * uDim[k];
  col += i == uHover ? 0.045 : 0.0;
  return col;
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uDpr;
  p.y -= uCY;
  p /= mix(0.84, 1.0, uIntro);
  float hw = 0.5 * uRes.x / uDpr;
  float side = p.x < 0.0 ? -1.0 : 1.0;
  float ax = abs(p.x);
  float zone = hw * (0.34 + 0.12 * uSpeed);
  float t = clamp((ax - (hw - zone)) / zone, 0.0, 1.0);
  float tt = t * t * (3.0 - 2.0 * t);
  float xin = hw - zone;
  float qx = ax <= xin ? ax : xin + (ax - xin) * (1.0 + (0.9 + 0.9 * uSpeed) * tt);
  float mag = 1.0 + (0.5 + 0.4 * uSpeed) * tt;
  float twist = tt * tt * uCard.y * (0.2 + 0.3 * uSpeed) * side * (1.0 + 0.35 * uDir * side);
  vec2 q = vec2(side * qx, (p.y - twist) / mag);
  float disp = tt * (3.0 + 10.0 * uSpeed) * side;
  float dR; float dG; float dB; float vR; float vG; float vB;
  vec3 r = cardAt(q + vec2(disp, 0.0), dR, vR);
  vec3 g = cardAt(q, dG, vG);
  vec3 b = cardAt(q - vec2(disp, 0.0), dB, vB);
  float px = max(length(fwidth(q)), 0.6);
  float aR = vR * clamp(0.5 - dR / px, 0.0, 1.0);
  float aG = vG * clamp(0.5 - dG / px, 0.0, 1.0);
  float aB = vB * clamp(0.5 - dB / px, 0.0, 1.0);
  vec3 col = vec3(mix(uBg.r, r.r, aR), mix(uBg.g, g.g, aG), mix(uBg.b, b.b, aB));
  // glass light: a thin rainbow rim on the edges inside the lens, a soft halo just outside
  float ds = dG * mag;
  float rim = tt * exp(-abs(ds) / (2.5 + 5.0 * uSpeed));
  float halo = tt * exp(-max(ds, 0.0) / 26.0) * step(0.0, ds) * vG;
  vec3 rainbow = 0.55 + 0.45 * cos(6.2832 * (vec3(0.0, 0.33, 0.67) + q.y / uCard.y * 0.9 + t * 0.7));
  col += rainbow * (rim * 0.9 + halo * 0.32);
  // a hint of depth: the far edges dim a little
  col *= 1.0 - 0.18 * tt * (1.0 - min(aG + rim, 1.0));
  outColor = vec4(mix(uBg, col, uIntro), 1.0);
}`;

const hex = (c: string): [number, number, number] => {
  const m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
  const n = m ? parseInt(m[1], 16) : 0x444444;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

/** A screenshot, decoded and cut to the card's shape off the main thread (cover, top-aligned). */
async function layerBitmap(url: string, w: number, h: number): Promise<ImageBitmap | HTMLCanvasElement> {
  const blob = await (await fetch(url)).blob();
  const full = await createImageBitmap(blob);
  const ar = w / h;
  let sw = full.width;
  let sh = sw / ar;
  if (sh > full.height) {
    sh = full.height;
    sw = sh * ar;
  }
  const sx = (full.width - sw) / 2;
  let out: ImageBitmap | HTMLCanvasElement = await createImageBitmap(full, sx, 0, sw, sh, { resizeWidth: w, resizeHeight: h, resizeQuality: "high" });
  if (out.width !== w || out.height !== h) {
    // (browsers without resize options)
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    c.getContext("2d")!.drawImage(full, sx, 0, sw, sh, 0, 0, w, h);
    (out as ImageBitmap).close?.();
    out = c;
  }
  full.close();
  return out;
}

/**
 * All projects on one stage: a strip of their screens under liquid glass (WebGL), moved by dragging,
 * the wheel, the arrow keys or the arrows' sides; it glides with inertia and settles on a project.
 * The centred one is named above and counted below; a click opens it (morphing into its page).
 * Phones get the sites' phone layouts as tall cards. Without WebGL2 the same projects show as a
 * plain swipeable row.
 */
export function GlassCarousel({ locale, items: all, labels }: { locale: string; items: WorkItem[]; labels: Labels }) {
  const items = useMemo(() => all.slice(0, MAX), [all]);
  // the WebGL scene is rebuilt only when something it draws changes: a live text edit
  // (site/live-updates.tsx) brings a new list but must not blank the canvas
  const sceneKey = items.map((i) => [i.slug, i.cover, i.mobile, i.accent, i.category].join("|")).join(" ");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const scene = useMemo(() => items, [sceneKey]);
  const router = useRouter();
  const root = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [index, setIndex] = useState(0);
  const [cat, setCat] = useState<string | null>(null);
  const [gl2, setGl2] = useState(true);
  const cats = useMemo(() => [...new Set(items.map((i) => i.category))], [items]);
  const api = useRef<{ go: (i: number) => void; dim: (c: string | null) => void } | null>(null);
  const cur = items[index] ?? items[0];

  useEffect(() => {
    const host = root.current!;
    const cv = canvas.current!;
    const gl = cv.getContext("webgl2", { antialias: false, alpha: false, powerPreference: "high-performance" });
    if (!gl) {
      setGl2(false);
      return;
    }
    const phone = matchMedia("(max-width: 768px)").matches;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const N = scene.length;

    // ---- program (compiled on the driver's thread where possible; drawn once ready)
    const par = gl.getExtension("KHR_parallel_shader_compile") as { COMPLETION_STATUS_KHR: number } | null;
    const shader = (type: number, src: string) => {
      const x = gl.createShader(type)!;
      gl.shaderSource(x, src);
      gl.compileShader(x);
      return x;
    };
    const fs = shader(gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, fs);
    gl.bindAttribLocation(prog, 0, "aPos");
    gl.linkProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    let ready = false;
    let failed = false;
    const U: Record<string, WebGLUniformLocation | null> = {};
    const poll = () => {
      if (ready || failed) return ready;
      if (par && !gl.getProgramParameter(prog, par.COMPLETION_STATUS_KHR)) return false;
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        console.warn(gl.getShaderInfoLog(fs) || gl.getProgramInfoLog(prog));
        failed = true;
        setGl2(false);
        return false;
      }
      for (const n of ["uTex", "uRes", "uDpr", "uOff", "uSpeed", "uDir", "uCard", "uGap", "uN", "uR", "uCY", "uBg", "uIntro", "uHover", "uMeta", "uDim"]) U[n] = gl.getUniformLocation(prog, n);
      ready = true;
      return true;
    };

    // ---- the screens: one texture array, a layer per project, filled as the pictures arrive
    const LW = phone ? 384 : 896;
    const LH = phone ? 686 : 560;
    const levels = Math.floor(Math.log2(Math.max(LW, LH))) + 1;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, levels, gl.RGBA8, LW, LH, Math.max(1, N));
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const meta = new Float32Array(MAX * 4);
    const dimA = new Float32Array(MAX);
    scene.forEach((it, k) => meta.set([...hex(it.accent), 0], k * 4));
    let alive = true;
    let loaded = 0;
    const order = scene.map((_, k) => k);
    (async () => {
      const queue = [...order];
      const worker = async () => {
        while (alive && queue.length) {
          const k = queue.shift()!;
          const it = scene[k];
          const url = phone ? it.mobile || it.cover : it.cover;
          if (!url) continue;
          try {
            const bmp = await layerBitmap(url, LW, LH);
            if (!alive) return;
            gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
            gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, k, LW, LH, 1, gl.RGBA, gl.UNSIGNED_BYTE, bmp);
            (bmp as ImageBitmap).close?.();
            meta[k * 4 + 3] = 1;
            loaded++;
            if (loaded === N) {
              gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
              gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
              const an = gl.getExtension("EXT_texture_filter_anisotropic");
              if (an) gl.texParameterf(gl.TEXTURE_2D_ARRAY, an.TEXTURE_MAX_ANISOTROPY_EXT, 4);
            }
            wake();
          } catch {}
        }
      };
      await Promise.all([worker(), worker()]);
    })();

    // ---- layout
    let W = 0;
    let H = 0;
    let dpr = 1;
    let card = [400, 250];
    let gap = 32;
    let cy = 0;
    const layout = () => {
      W = host.clientWidth;
      H = host.clientHeight;
      dpr = Math.min(devicePixelRatio || 1, phone ? 1.25 : 1.5);
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      if (phone) {
        // filters + the name take the top 236 px, the counter and the pill the bottom 190
        const top = 236;
        const ch = Math.max(260, Math.min(H * 0.54, H - top - 190));
        card = [ch * 0.56, ch];
        gap = 14;
        cy = H / 2 - (top + ch / 2);
      } else {
        const cw = Math.min(W * 0.34, 660, H * 0.46 / 0.625);
        card = [cw, cw * 0.625];
        gap = Math.max(24, W * 0.024);
        cy = -H * 0.035;
      }
      host.style.setProperty("--cw", `${card[0]}px`);
      host.style.setProperty("--ch", `${card[1]}px`);
      host.style.setProperty("--cy", `${cy}px`);
      wake();
    };
    const ro = new ResizeObserver(layout);
    ro.observe(host);

    // ---- motion: a target the strip glides to; speed feeds the glass
    let off = 0;
    let tgt = 0;
    let speed = 0;
    let dir = 0;
    let introRaw = reduced ? 1 : 0;
    let intro = introRaw;
    let last = performance.now();
    let prevOff = 0;
    let raf = 0;
    let hover = -1;
    let dragging = false;
    let shown = -1;
    const stepPx = () => card[0] + gap;
    const settle = () => {
      const i = Math.round(Math.max(0, Math.min(N - 1, tgt)));
      if (i !== shown) {
        shown = i;
        setIndex(i);
        sfx("tick");
      }
    };
    const draw = () => {
      gl.viewport(0, 0, cv.width, cv.height);
      gl.useProgram(prog);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
      gl.uniform1i(U.uTex, 0);
      gl.uniform2f(U.uRes, cv.width, cv.height);
      gl.uniform1f(U.uDpr, dpr);
      gl.uniform1f(U.uOff, off);
      gl.uniform1f(U.uSpeed, speed);
      gl.uniform1f(U.uDir, dir);
      gl.uniform2f(U.uCard, card[0], card[1]);
      gl.uniform1f(U.uGap, gap);
      gl.uniform1f(U.uN, N);
      gl.uniform1f(U.uR, phone ? 16 : 14);
      gl.uniform1f(U.uCY, cy);
      gl.uniform3f(U.uBg, 0x14 / 255, 0x11 / 255, 0x1b / 255);
      gl.uniform1f(U.uIntro, intro);
      gl.uniform1f(U.uHover, hover);
      gl.uniform4fv(U.uMeta, meta);
      gl.uniform1fv(U.uDim, dimA);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    const frame = (now: number) => {
      raf = 0;
      if (!alive) return;
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      if (!dragging) off += (tgt - off) * (reduced ? 1 : 1 - Math.exp(-dt * 8));
      const v = (off - prevOff) / dt;
      prevOff = off;
      const k = 1 - Math.exp(-dt * 9);
      speed += (Math.min(1, Math.abs(v) / 6) - speed) * k;
      dir += (Math.max(-1, Math.min(1, v / 3)) - dir) * k;
      // the intro starts once the program is ready (no half-played entrance behind a compile)
      if (introRaw < 1 && ready) introRaw = Math.min(1, introRaw + dt / 1.1);
      intro = 1 - (1 - introRaw) ** 3;
      if (poll()) draw();
      const moving = dragging || Math.abs(tgt - off) > 0.0004 || speed > 0.002 || introRaw < 1 || !ready || loaded < N;
      if (moving) raf = requestAnimationFrame(frame);
    };
    function wake() {
      if (!raf && alive) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    }
    const go = (i: number) => {
      tgt = Math.max(0, Math.min(N - 1, i));
      settle();
      wake();
    };
    api.current = {
      go,
      dim: (c) => {
        scene.forEach((it, k) => (dimA[k] = c && it.category !== c ? 1 : 0));
        if (c) {
          const first = scene.findIndex((it) => it.category === c);
          if (first >= 0) go(first);
        }
        wake();
      },
    };
    layout();

    // ---- input
    let wheelIdle: ReturnType<typeof setTimeout> | undefined;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      const px = e.deltaMode === 1 ? d * 32 : d;
      tgt = Math.max(-0.3, Math.min(N - 0.7, tgt + (px / stepPx()) * 1.6));
      settle();
      clearTimeout(wheelIdle);
      wheelIdle = setTimeout(() => go(Math.round(tgt)), 160);
      wake();
    };
    let x0 = 0;
    let y0 = 0;
    let o0 = 0;
    let moved = false;
    let samples: [number, number][] = [];
    const rubber = (o: number) => (o < 0 ? o * 0.35 : o > N - 1 ? N - 1 + (o - (N - 1)) * 0.35 : o);
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).closest("button, a, [data-noswipe]")) return;
      dragging = true;
      moved = false;
      x0 = e.clientX;
      y0 = e.clientY;
      o0 = off;
      samples = [[performance.now(), off]];
      host.setPointerCapture?.(e.pointerId);
      wake();
    };
    const onMove = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      const lx = e.clientX - r.left - W / 2;
      const ly = e.clientY - r.top - (H / 2 - cy);
      // hover lift on the card under the pointer (only the flat middle reads 1:1)
      const h = Math.abs(ly) < card[1] / 2 ? Math.round(lx / stepPx() + off) : -1;
      if (h !== hover && !dragging) {
        hover = h;
        wake();
      }
      if (!dragging) return;
      const dx = e.clientX - x0;
      const dy = e.clientY - y0;
      if (!moved && Math.hypot(dx, dy) > 6) moved = true;
      // phones: a vertical swipe moves the strip too
      const d = e.pointerType === "touch" && Math.abs(dy) > Math.abs(dx) ? dy * 0.8 : dx;
      off = rubber(o0 - (d / stepPx()) * 1.1);
      tgt = off;
      const now = performance.now();
      samples.push([now, off]);
      while (samples.length > 2 && now - samples[0][0] > 90) samples.shift();
      settle();
      wake();
    };
    const onUp = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      if (!moved) {
        // a click: the middle card opens, a side one comes to the middle
        const r = host.getBoundingClientRect();
        const lx = e.clientX - r.left - W / 2;
        const ly = e.clientY - r.top - (H / 2 - cy);
        if (Math.abs(lx) <= card[0] / 2 && Math.abs(ly) <= card[1] / 2) open(Math.round(off));
        else go(Math.round(off) + (lx < 0 ? -1 : 1));
        return;
      }
      const [ta, oa] = samples[0];
      const [tb, ob] = samples[samples.length - 1];
      const vel = tb > ta ? ((ob - oa) / (tb - ta)) * 1000 : 0;
      go(Math.round(off + vel * 0.22));
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(Math.round(tgt) + 1);
      else if (e.key === "ArrowLeft") go(Math.round(tgt) - 1);
      else if (e.key === "Enter" && document.activeElement === host) open(Math.round(tgt));
    };
    const open = (i: number) => {
      const it = scene[i];
      if (!it) return;
      sfx("whoosh");
      const r = host.getBoundingClientRect();
      const ghost = document.createElement("div");
      Object.assign(ghost.style, {
        position: "fixed",
        left: `${r.left + W / 2 - card[0] / 2}px`,
        top: `${r.top + H / 2 - cy - card[1] / 2}px`,
        width: `${card[0]}px`,
        height: `${card[1]}px`,
        pointerEvents: "none",
      });
      document.body.appendChild(ghost);
      const href = `/${locale}/work/${it.slug}`;
      router.prefetch(href);
      morphTo(ghost, [phone ? it.mobile || it.cover : it.cover, it.cover], () => router.push(href, { scroll: true }));
      setTimeout(() => ghost.remove(), 60);
    };
    host.addEventListener("wheel", onWheel, { passive: false });
    host.addEventListener("pointerdown", onDown);
    addEventListener("pointermove", onMove, { passive: true });
    addEventListener("pointerup", onUp);
    addEventListener("pointercancel", onUp);
    addEventListener("keydown", onKey);
    const onLost = (e: Event) => e.preventDefault();
    cv.addEventListener("webglcontextlost", onLost);
    // offscreen (another tab, the menu over it…) nothing draws; the loop sleeps anyway at rest
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      clearTimeout(wheelIdle);
      ro.disconnect();
      host.removeEventListener("wheel", onWheel);
      host.removeEventListener("pointerdown", onDown);
      removeEventListener("pointermove", onMove);
      removeEventListener("pointerup", onUp);
      removeEventListener("pointercancel", onUp);
      removeEventListener("keydown", onKey);
      cv.removeEventListener("webglcontextlost", onLost);
      api.current = null;
    };
  }, [scene, locale, router]);

  const pick = (c: string | null) => {
    setCat(c);
    sfx("tap");
    api.current?.dim(c);
  };

  return (
    <section ref={root} className={s.root} tabIndex={0} aria-roledescription="carousel" aria-label={labels.title}>
      {gl2 ? <canvas ref={canvas} className={s.canvas} aria-hidden /> : null}

      <div className={s.head}>
        <h1 className={s.title}>
          {labels.title} <sup>({items.length})</sup>
        </h1>
        <div className={s.filters} role="group" data-noswipe>
          <button type="button" className={!cat ? s.on : ""} onClick={() => pick(null)}>
            {labels.all}
          </button>
          {cats.map((c) => (
            <button key={c} type="button" className={cat === c ? s.on : ""} onClick={() => pick(c)}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {gl2 && cur ? (
        <>
          <div className={s.info} aria-live="polite">
            <p key={`k${index}`} className={s.kicker}>
              {cur.category} · {cur.year}
              {cur.wip ? (
                <span className={s.wip}>
                  <i /> {cur.wip}
                </span>
              ) : null}
            </p>
            <p className={s.nameMask}>
              <span key={`n${index}`} className={s.name}>
                {cur.name}
              </span>
            </p>
          </div>
          {/* where the cursor reads "previous / open / next" */}
          <div className={s.zoneL} data-cursor="prev" aria-hidden />
          <div className={s.zoneC} data-cursor="view" aria-hidden />
          <div className={s.zoneR} data-cursor="next" aria-hidden />
          <div className={s.foot}>
            <p className={s.count}>
              <b>{String(index + 1).padStart(2, "0")}</b> / {String(items.length).padStart(2, "0")}
            </p>
            <p className={s.hint}>{labels.hint}</p>
          </div>
        </>
      ) : (
        // no WebGL2: the same projects as a plain swipeable row
        <div className={s.fallback}>
          {items.map((it) => (
            <a key={it.slug} href={`/${locale}/work/${it.slug}`} className={s.fbCard} style={{ ["--a" as string]: it.accent } as CSSProperties}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={it.cover} alt="" loading="lazy" />
              <span>{it.name}</span>
            </a>
          ))}
        </div>
      )}

      {/* every project as a plain link too (keyboard, screen readers, search engines) */}
      <ol className="sr-only">
        {items.map((it) => (
          <li key={it.slug}>
            <a href={`/${locale}/work/${it.slug}`}>
              {it.name} — {labels.open}
            </a>
          </li>
        ))}
      </ol>
    </section>
  );
}
