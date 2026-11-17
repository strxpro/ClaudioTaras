"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { CARD_H, CARD_W, loadImage, paintBack, paintFront, type DeckCard } from "./cards";
import type { StoryProgress } from "./engine";

type Props = { cards: DeckCard[]; hero: DeckCard; progress: React.RefObject<StoryProgress>; className?: string };

const SLOTS = 18;
const MID = 9;
const CFG = { angleStep: 0.65, radius: 2.6, squish: 0.7, gapX: -0.05, gapY: 0.4, edgeTwist: -0.06, cardScale: 0.6, bend: 0.06, smear: 1, autoSpeed: 0.15, mouseTilt: 0.12, magnet: 0.1 };
const PLANE_W = 2.4;
const PLANE_H = (PLANE_W * CARD_H) / CARD_W;
const CAM_Z = CFG.radius * CFG.squish + 6.5;
const FOV = 38;
/** visible world height at z = 0 */
const VIEW_H = 2 * Math.tan(((FOV / 2) * Math.PI) / 180) * CAM_Z;
// scroll phases, in viewport heights
const STACK = [0.18, 0.72];
const ONE = [1.18, 1.7];
const FLIP = [1.95, 2.55];
const LAND = [2.15, 2.6];
const INTRO_DUR = 2.2;

const vert = /* glsl */ `
uniform float uBend;
uniform float uFlip;
uniform float uCardH;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec3 p = position;
  // bent plane: side edges curl back, a gentle vertical bow
  p.z -= uBend * position.x * position.x;
  p.z -= uBend * 0.35 * position.y * position.y;
  // a full turn that ripples from the top edge down
  if (uFlip > 0.0001) {
    float yN = position.y / uCardH + 0.5;
    float rp = clamp((uFlip - (1.0 - yN) * 0.2) / 0.8, 0.0, 1.0);
    float a = rp * 6.2831853;
    float s = sin(a), c = cos(a);
    float nx = p.x * c - p.z * s;
    p.z = p.x * s + p.z * c;
    p.x = nx;
  }
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const frag = /* glsl */ `
precision highp float;
uniform sampler2D uTex;
uniform sampler2D uBack;
uniform float uSmear;
uniform vec2 uDir;
uniform float uDim;
varying vec2 vUv;
void main() {
  if (!gl_FrontFacing) {
    vec4 b = texture2D(uBack, vec2(1.0 - vUv.x, vUv.y));
    gl_FragColor = vec4(b.rgb * max(uDim, 0.7), b.a);
    return;
  }
  if (uSmear < 0.0008) {
    vec4 c0 = texture2D(uTex, vUv);
    gl_FragColor = vec4(c0.rgb * uDim, c0.a);
    return;
  }
  vec4 acc = vec4(0.0);
  float total = 0.0;
  for (int i = 0; i < 7; i++) {
    float t = float(i) / 6.0 - 0.5;
    float w = 1.0 - abs(t) * 1.3;
    acc += texture2D(uTex, vUv + uDir * t * uSmear) * w;
    total += w;
  }
  vec4 c = acc / total;
  gl_FragColor = vec4(c.rgb * uDim, c.a);
}`;

const ss = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * The hero deck: project cards on a slowly turning helix (bent WebGL planes, back = screenshot,
 * velocity smear, pointer tilt and a soft magnet towards the cursor). Scrolling gathers them into a
 * stack, the stack collapses into one card ("your project"), it turns once and lands in the phone.
 */
export function Deck({ cards, hero, progress, className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  // the scene is built once; it reads the latest cards from here
  const cardsRef = useRef(cards);
  const heroRef = useRef(hero);
  cardsRef.current = cards;
  heroRef.current = hero;
  const relist = useRef<(() => void) | null>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mobile = innerWidth < 768;
    const dpr = Math.min(devicePixelRatio || 1, mobile ? 1.25 : 2);
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, alpha: true, powerPreference: "high-performance" });
    } catch {
      return;
    }
    renderer.setPixelRatio(dpr);
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
    camera.position.z = CAM_Z;
    const group = new THREE.Group();
    scene.add(group);

    let spin = 0;
    let shown = 0;
    let lastShown = 0;
    let vel = 0;
    let tiltX = 0;
    let tiltZ = 0;
    let last = performance.now() / 1000;
    let dirty = last + 1;
    let raf = 0;
    let locked: number | null = null;

    const size = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      dirty = performance.now() / 1000 + 0.3;
    };

    // textures: one front + back per project, plus the "about me" card. Painted one card per task (never
    // one long block on a phone), the cards nearest the front first: the words straight away, the
    // screenshot as soon as that card's own image has arrived. A new language repaints only the fronts.
    let list = [...cardsRef.current, heroRef.current];
    const N = list.length;
    const tdpr = mobile ? 1.5 : 2;
    const fronts = list.map(() => document.createElement("canvas"));
    const backs = list.map(() => document.createElement("canvas"));
    const tex = (c: HTMLCanvasElement) => {
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = Math.min(mobile ? 2 : 8, renderer.capabilities.getMaxAnisotropy());
      return t;
    };
    [...fronts, ...backs].forEach((c) => {
      c.width = 4;
      c.height = 4;
    });
    const frontTex = fronts.map(tex);
    const backTex = backs.map(tex);
    const imgs: (HTMLImageElement | null | undefined)[] = list.map(() => undefined);
    const needFront = new Set<number>(list.map((_, i) => i));
    const needBack = new Set<number>([N - 1]);
    let alive = true;
    let fontsIn = !document.fonts;
    let pumping = false;
    const upload = (c: HTMLCanvasElement, t: THREE.CanvasTexture, w: number, h: number) => {
      // a canvas that changed size needs new GPU storage (WebGL2 texture storage is immutable)
      if (c.width !== w || c.height !== h) t.dispose();
      t.needsUpdate = true;
    };
    /** Card indices by how close to the front they sit right now. */
    const order = () => {
      const seen = new Set<number>();
      const out: number[] = [];
      for (let d = 0; d <= MID; d++)
        for (const sl of d ? [MID - d, MID + d] : [MID]) {
          const idx = meshCard[sl] ?? wrapI(sl - MID);
          if (idx !== undefined && idx < N && !seen.has(idx)) {
            seen.add(idx);
            out.push(idx);
          }
        }
      for (let i = 0; i < N; i++) if (!seen.has(i)) out.push(i);
      return out;
    };
    const pump = () => {
      if (!alive || !fontsIn || pumping) return;
      pumping = true;
      const step = () => {
        if (!alive) return;
        const i = order().find((k) => needFront.has(k) || needBack.has(k));
        if (i === undefined) {
          pumping = false;
          return;
        }
        const c = list[i];
        const img = imgs[i] ?? null;
        if (needFront.delete(i)) {
          const cv = fronts[i];
          const [w, h] = [cv.width, cv.height];
          // the about card is read up close inside the phone: paint it sharper
          paintFront(cv, c, img, c.about ? (mobile ? 2.5 : 3) : tdpr);
          upload(cv, frontTex[i], w, h);
        }
        if (needBack.delete(i)) {
          const cv = backs[i];
          const [w, h] = [cv.width, cv.height];
          paintBack(cv, img, c.accent, tdpr, !!c.about);
          upload(cv, backTex[i], w, h);
        }
        dirty = performance.now() / 1000 + 0.5;
        setTimeout(step, 0);
      };
      step();
    };
    const fetchImg = (i: number) => {
      const src = list[i].img;
      loadImage(src).then((img) => {
        if (!alive || list[i].img !== src) return;
        imgs[i] = img;
        needFront.add(i);
        needBack.add(i);
        pump();
      });
    };
    list.forEach((_, i) => fetchImg(i));
    document.fonts?.ready.then(() => {
      fontsIn = true;
      pump();
    });
    relist.current = () => {
      const next = [...cardsRef.current, heroRef.current];
      if (next.length !== N) return;
      const old = list;
      list = next;
      next.forEach((c, i) => {
        needFront.add(i);
        // the old picture stays until the new one is in
        if (c.img !== old[i].img) fetchImg(i);
      });
      pump();
    };

    const geo = new THREE.PlaneGeometry(PLANE_W, PLANE_H, 24, 16);
    const meshes: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>[] = [];
    for (let i = 0; i < SLOTS; i++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uTex: { value: frontTex[0] },
          uBack: { value: backTex[0] },
          uBend: { value: CFG.bend },
          uSmear: { value: 0 },
          uDir: { value: new THREE.Vector2(0, 1) },
          uDim: { value: 1 },
          uFlip: { value: 0 },
          uCardH: { value: PLANE_H },
        },
        vertexShader: vert,
        fragmentShader: frag,
        transparent: true,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
      });
      const m = new THREE.Mesh(geo, mat);
      group.add(m);
      meshes.push(m);
    }

    const n = N - 1;
    const wrapI = (i: number) => ((i % n) + n) % n;
    // which card each slot shows right now (for taps), and a tap → the front-most card under the finger
    const meshCard: number[] = [];
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const onTap = (e: Event) => {
      const { x, y } = (e as CustomEvent<{ x: number; y: number }>).detail;
      ndc.set((x / innerWidth) * 2 - 1, -((y / innerHeight) * 2 - 1));
      ray.setFromCamera(ndc, camera);
      const hits = ray.intersectObjects(meshes.filter((m) => m.visible), false);
      if (!hits.length) return;
      hits.sort((a, b) => b.object.renderOrder - a.object.renderOrder);
      const mesh = hits[0].object as (typeof meshes)[number];
      const idx = meshCard[meshes.indexOf(mesh)];
      if (idx === undefined || idx >= n) return;
      // the card's rectangle on screen, so the picture can fly from exactly there
      const box = new THREE.Box3().setFromObject(mesh);
      const pts = [box.min, box.max].map((v) => v.clone().project(camera));
      const xs = pts.map((p) => ((p.x + 1) / 2) * innerWidth);
      const ys = pts.map((p) => ((1 - p.y) / 2) * innerHeight);
      const rect = { left: Math.min(...xs), top: Math.min(...ys), width: Math.abs(xs[1] - xs[0]), height: Math.abs(ys[1] - ys[0]) };
      dispatchEvent(new CustomEvent("deck:pick", { detail: { index: idx, rect } }));
    };
    addEventListener("deck:tap", onTap);
    const mouse = { x: 0, y: 0 };
    const onMove = (e: PointerEvent) => {
      mouse.x = (e.clientX / innerWidth) * 2 - 1;
      mouse.y = -((e.clientY / innerHeight) * 2 - 1);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    const ro = new ResizeObserver(size);
    ro.observe(canvas);
    size();

    // intro: the helix winds in from wide once the loader has opened
    let introAt = -1;
    // the helix winds in as soon as the loader's backdrop opens ("intro:open"), or on "intro:done"
    const startIntro = () => {
      if (introAt < 0) introAt = performance.now() / 1000;
    };
    if (document.documentElement.dataset.intro === "done" || reduced) introAt = 0;
    else {
      window.addEventListener("intro:open", startIntro, { once: true });
      window.addEventListener("intro:done", startIntro, { once: true });
    }


    const loop = () => {
      raf = requestAnimationFrame(loop);
      const t = performance.now() / 1000;
      const dt = Math.min(0.05, t - last) || 0.016;
      last = t;
      const P = progress.current;
      if (!P || P.deckHidden) return;
      const p = P.p;
      const l = ss(STACK[0], STACK[1], p);
      const u = ss(ONE[0], ONE[1], p);
      const d = ss(FLIP[0], FLIP[1], p);
      const f = ss(LAND[0], LAND[1], p);
      const stacked = Math.max(l, u);

      let m = 1;
      if (introAt < 0) m = 0;
      else if (introAt > 0) {
        const e = Math.min(1, (t - introAt) / INTRO_DUR);
        m = 1 - (1 - e) ** 3;
        if (e < 1) dirty = t + 0.3;
      }
      const radius = mix(12, CFG.radius, m);
      const speed = mix(1, CFG.autoSpeed, m);
      const scale0 = mix(0.4, CFG.cardScale, m);
      if (!reduced) spin += speed * dt * (1 - l);
      // dragging the hero adds its own spin, which then glides out
      spin += P.spinVel * (1 - l);
      P.spinVel *= 0.9;
      if (Math.abs(P.spinVel) > 1e-4) dirty = t + 0.45;
      shown += (spin - shown) * Math.min(1, dt * 8);
      const v = (shown - lastShown) / dt;
      lastShown = shown;
      vel += (v - vel) * 0.25;
      const smear = Math.min(0.055, Math.abs(vel) * 0.012 * CFG.smear);

      const C = radius * CFG.squish;
      camera.position.z = C + 6.5;
      tiltX += (-mouse.y * CFG.mouseTilt - tiltX) * Math.min(1, dt * 4);
      tiltZ += (mouse.x * CFG.mouseTilt - tiltZ) * Math.min(1, dt * 4);
      group.rotation.x = tiltX * (1 - stacked);
      group.rotation.z = -tiltZ * (1 - stacked);
      // the spiral sits a little lower than the headline
      group.position.y = -0.38 * (1 - stacked);
      // tapping the about card turns it once more
      const tap = Math.min(1, (t * 1000 - P.flipAt) / 900);
      const tapFlip = tap > 0 && tap < 1 ? tap * tap * (3 - 2 * tap) : 0;
      if (tapFlip) dirty = t + 0.3;

      // where the pointer is, in world units (for the magnet)
      const halfH = Math.tan(((FOV / 2) * Math.PI) / 180) * camera.position.z;
      const mx = mouse.x * halfH * camera.aspect;
      const my = mouse.y * halfH;

      if (l > 0.001 && locked === null) locked = Math.round(shown);
      if (l < 0.001) locked = null;
      const base = (locked ?? Math.round(shown)) - MID;

      // landing target: the card sits inside the phone screen (see .phone in story.module.css)
      // same phone size as .phone in story.module.css
      const phVh = innerWidth <= 768 ? Math.min(54, (112 * innerWidth) / innerHeight) : 60;
      // the HTML copy fades in over the landed card; the WebGL card steps aside once it is opaque
      const domFull = P.aboutDom && performance.now() - P.aboutAt > 340;
      if (P.aboutDom && !domFull) dirty = t + 0.1;
      const landScale = ((0.6 * 0.957 * phVh) / 100) * VIEW_H / PLANE_H;
      const one = CFG.cardScale * 1.35;
      const landY = ((0.067 * phVh) / 100) * VIEW_H;

      for (let i = 0; i < SLOTS; i++) {
        const slot = base + i;
        const off = slot - shown;
        const ang = off * CFG.angleStep;
        const cos = Math.cos(ang);
        const sin = Math.sin(ang);
        const k = i - MID;
        let x = radius * sin + off * CFG.gapX;
        let y = off * CFG.gapY;
        const dx = mx - x;
        const dy = my - y;
        const pull = CFG.magnet * Math.exp(-(dx * dx + dy * dy) / 9) * (1 - l);
        x += dx * pull;
        y += dy * pull;
        const z = C * cos;
        const twist = -sin * CFG.edgeTwist;
        const dim = Math.max(0.32, 0.5 + 0.5 * cos);
        // spiral → stack → one card
        let px = mix(x, k * 0.004, l);
        let py = mix(y, k * 0.0035, l);
        let pz = mix(z, -Math.abs(k) * 0.012, l);
        let ry = mix(ang, 0, l);
        let rz = mix(twist, 0, l);
        let sc = mix(scale0, CFG.cardScale * 1.15, l);
        let dm = mix(dim, 1, l);
        px = mix(px, 0, u);
        py = mix(py, 0, u);
        pz = mix(pz, 0, u);
        ry = mix(ry, 0, u);
        rz = mix(rz, 0, u);
        sc = mix(sc, i === MID ? one : 0, u);
        dm = mix(dm, 1, u);
        // → into the phone
        sc *= mix(1, landScale / one, f);
        py += landY * f;
        const mesh = meshes[i];
        mesh.position.set(px, py, pz);
        mesh.rotation.set(0, ry, rz);
        mesh.scale.setScalar(Math.max(0.0001, sc));
        // the landed about card is shown as crisp HTML inside the phone (see .aboutCard)
        mesh.visible = sc > 0.002 && !(domFull && i === MID && f > 0.99);
        mesh.renderOrder = Math.round(mix(z * 100, (50 - Math.abs(k)) * 2, stacked));
        const un = mesh.material.uniforms;
        const idx = i === MID && l > 0.98 ? n : wrapI(slot);
        meshCard[i] = idx;
        un.uTex.value = frontTex[idx];
        un.uBack.value = backTex[idx];
        un.uBend.value = CFG.bend * (1 - u);
        un.uSmear.value = smear;
        un.uDim.value = dm;
        un.uFlip.value = i === MID && u > 0.99 && tapFlip ? tapFlip : d;
      }
      const moving = !reduced && l < 0.999;
      const changed = Math.abs(p - P.lastDeckP) > 1e-5 || Math.abs(mouse.x - P.lastMx) > 1e-4 || Math.abs(mouse.y - P.lastMy) > 1e-4;
      P.lastDeckP = p;
      P.lastMx = mouse.x;
      P.lastMy = mouse.y;
      if (moving || changed || Math.abs(spin - shown) > 3e-4) dirty = t + 0.45;
      if (t <= dirty) renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      alive = false;
      relist.current = null;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("intro:done", startIntro);
      removeEventListener("deck:tap", onTap);
      window.removeEventListener("intro:open", startIntro);
      geo.dispose();
      meshes.forEach((m) => m.material.dispose());
      frontTex.forEach((t) => t.dispose());
      backTex.forEach((t) => t.dispose());
      renderer.dispose();
    };
  }, [progress, cards.length]);

  // a new language: same cards, new words — repaint them in place (the helix keeps turning)
  const shown = useRef({ cards, hero });
  useEffect(() => {
    if (shown.current.cards === cards && shown.current.hero === hero) return;
    shown.current = { cards, hero };
    relist.current?.();
  }, [cards, hero]);

  return <canvas ref={ref} className={className} aria-hidden />;
}
