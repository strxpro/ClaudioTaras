"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { sfx } from "@/lib/sound";
import { scrollPos } from "@/lib/scroll-pos";
import { whenNear, whenStill } from "@/lib/when-still";

/** mobVideo: the phone screen plays the site's own phone recording (it scrolls down the page) */
export type ShowcaseItem = { desk: string; mob: string; accent: string; mobVideo?: string };

type Props = { items: ShowcaseItem[]; index: number; className?: string };

/** Modelled, lit and baked in Blender (source: .capture/blender/devices.blend):
 *  devices.glb — laptop (lid on its hinge) + phone, baked contact shadows and keyboard occlusion
 *  studio.hdr  — the softbox studio both were lit in, used here for the reflections */
const MODEL = "/models/devices.glb";
const STUDIO = "/models/studio.hdr";

const LID_OPEN = -0.24;
const ENV = 1.5; // overall strength of the studio reflections (walls ≈ the page’s paper white)
const LID_CLOSED = Math.PI / 2 - 0.07;
const PHONE_H = 0.68; // half the phone's height: it stands on the floor
const PHONE_T = 0.0375; // half its thickness: it lies on its back before standing up

const screenVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

/** Screen: two shots cross-fading with a wipe that travels the way you navigated, a light seam on the
 *  wipe, a power-on sweep the first time, and a glare that slides across the glass as the pair turns. */
const screenFrag = /* glsl */ `
precision highp float;
uniform sampler2D uA;
uniform sampler2D uB;
uniform float uMix;
uniform float uDir;
uniform float uPower;
uniform float uSheen;
uniform float uAspect;
uniform vec2 uSizeA;
uniform vec2 uSizeB;
varying vec2 vUv;
vec2 coverTop(vec2 uv, vec2 img) {
  float ia = img.x / img.y;
  vec2 s = ia > uAspect ? vec2(uAspect / ia, 1.0) : vec2(1.0, ia / uAspect);
  vec2 o = ia > uAspect ? vec2((1.0 - s.x) * 0.5, 0.0) : vec2(0.0, 1.0 - s.y);
  return o + uv * s;
}
void main() {
  vec3 a = texture2D(uA, coverTop(vUv, uSizeA)).rgb;
  vec3 b = texture2D(uB, coverTop(vUv, uSizeB)).rgb;
  float x = uDir > 0.0 ? vUv.x : 1.0 - vUv.x;
  float p = x * 0.82 + (1.0 - vUv.y) * 0.18;
  float front = uMix * 1.3 - 0.15;
  vec3 c = mix(b, a, smoothstep(front - 0.15, front, p));
  float live = step(0.001, uMix) * step(uMix, 0.999);
  c += live * (1.0 - smoothstep(0.0, 0.05, abs(p - front + 0.07))) * 0.28;
  float rise = uPower * 1.25 - 0.1;
  c *= clamp((rise - vUv.y) / 0.16, 0.0, 1.0) * mix(0.55, 1.0, uPower);
  c += exp(-pow((vUv.y - rise) * 14.0, 2.0)) * (1.0 - uPower) * step(0.001, uPower) * 0.5;
  c += smoothstep(0.32, 0.0, abs(vUv.x + vUv.y * 0.55 - 0.78 - uSheen)) * 0.06 * uPower;
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

function screenMat() {
  const blank = new THREE.DataTexture(new Uint8Array([12, 12, 14, 255]), 1, 1);
  blank.needsUpdate = true;
  return new THREE.ShaderMaterial({
    vertexShader: screenVert,
    fragmentShader: screenFrag,
    uniforms: {
      uA: { value: blank },
      uB: { value: blank },
      uMix: { value: 1 },
      uDir: { value: 1 },
      uPower: { value: 0 },
      uSheen: { value: 0 },
      uAspect: { value: 1.6 },
      uSizeA: { value: new THREE.Vector2(1, 1) },
      uSizeB: { value: new THREE.Vector2(1, 1) },
    },
  });
}

/**
 * PMREM's filter shaders (a 256-sample GGX loop) take the Direct3D compiler behind Chrome/Opera on
 * Windows over a second — compiled the normal way that second freezes the page. Here they are built
 * first through compileAsync (KHR_parallel_shader_compile: the driver compiles on its own thread),
 * for the same render target the generator will draw into, so fromEquirectangular finds them ready.
 * Uses the generator's internals; if three changes them this simply does nothing.
 */
async function prewarmPmrem(renderer: THREE.WebGLRenderer, pmrem: THREE.PMREMGenerator, hdr: THREE.Texture) {
  const g = pmrem as unknown as {
    _setSize?: (n: number) => void;
    _allocateTargets?: () => THREE.WebGLRenderTarget;
    compileEquirectangularShader?: () => void;
    _equirectMaterial?: THREE.Material | null;
    _blurMaterial?: THREE.Material | null;
    _ggxMaterial?: THREE.Material | null;
    _pingPongRenderTarget?: THREE.WebGLRenderTarget | null;
    _lodMeshes?: THREE.Mesh[];
  };
  if (!g._setSize || !g._allocateTargets || !g.compileEquirectangularShader) return;
  const img = hdr.image as { width: number };
  g._setSize(img.width / 4);
  g._allocateTargets().dispose(); // creates the filter materials and the ping-pong target (kept for reuse)
  g.compileEquirectangularShader();
  const mats = [g._equirectMaterial, g._blurMaterial, g._ggxMaterial].filter(Boolean) as THREE.Material[];
  const geo = g._lodMeshes?.[0]?.geometry;
  const target = g._pingPongRenderTarget;
  if (!mats.length || !geo || !target) return;
  const scene = new THREE.Scene();
  for (const m of mats) scene.add(new THREE.Mesh(geo, m));
  const cam = new THREE.OrthographicCamera();
  const prev = renderer.getRenderTarget();
  // program variants depend on the target (linear, no tone mapping): compile for that one
  renderer.setRenderTarget(target);
  const done = renderer.compileAsync(scene, cam);
  renderer.setRenderTarget(prev);
  await done;
}

/**
 * Can createImageBitmap flip a picture for us? Then a screenshot is decoded and flipped off the main
 * thread and goes to the GPU as it is. An <img> uploaded with WebGL's flipY makes the browser decode
 * it again, on the main thread, during the upload — about 50 ms per screen, a visible hitch mid-turn.
 */
let flipCheck: Promise<boolean> | null = null;
const canFlipBitmaps = () =>
  (flipCheck ??= (async () => {
    try {
      if (typeof createImageBitmap !== "function") return false;
      // 1×2 pixels, red over blue: flipped, the top one reads blue
      const px = new ImageData(new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]), 1, 2);
      const bmp = await createImageBitmap(px, { imageOrientation: "flipY" });
      const c = document.createElement("canvas");
      c.width = 1;
      c.height = 2;
      const x = c.getContext("2d");
      if (!x) return false;
      x.drawImage(bmp, 0, 0);
      bmp.close();
      return x.getImageData(0, 0, 1, 1).data[2] > 128;
    } catch {
      return false;
    }
  })());

/** Width / height of a screen mesh's glass (its two largest extents; portrait for the phone). */
const glassAspect = (m: THREE.Mesh, portrait: boolean) => {
  m.geometry.computeBoundingBox();
  const s = m.geometry.boundingBox!.getSize(new THREE.Vector3());
  const [a, b] = [s.x, s.y, s.z].sort((p, q) => q - p);
  if (!a || !b) return portrait ? 0.46 : 1.6;
  return portrait ? b / a : a / b;
};

/** Damped spring (critically under-damped, so a kick swings past and settles). */
const spring = (k: number, c: number) => ({ x: 0, v: 0, k, c });
type Spring = ReturnType<typeof spring>;
const step = (s: Spring, dt: number) => {
  s.v += (-s.k * s.x - s.c * s.v) * dt;
  s.x += s.v * dt;
};

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** seconds of the full turn when switching projects */
const TURN = 1.15;
const easeOutCubic = (x: number) => 1 - (1 - x) ** 3;
const easeOutBack = (x: number, s = 1.2) => 1 + (s + 1) * (x - 1) ** 3 + s * (x - 1) ** 2;
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);

/**
 * The showcase "totem": the laptop and phone from Blender, their screens showing the selected
 * project. The first time the section comes into view the lid opens, the screens power on and the
 * phone stands up. Switching projects kicks the pair the way you navigated (springs, so it swings
 * and settles) while the screens wipe in the same direction. It sways on its own, leans towards the
 * pointer and can be dragged. Assets load in an idle moment; it renders only while visible.
 */
export function Showcase({ items, index, className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const api = useRef<{ show: (i: number) => void; refresh: () => void } | null>(null);
  // the scene is built once; it reads the latest items (another language may bring other screens)
  const itemsRef = useRef(items);
  const indexRef = useRef(index);
  itemsRef.current = items;
  indexRef.current = index;

  useEffect(() => {
    const canvas = ref.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      return;
    }
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    // 1.5x is plenty for brushed metal and screenshots, and keeps the fill rate low on big screens
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    // neutral tone mapping: the aluminium stays silver and the paper stays warm (no ACES hue shift)
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);

    // the studio HDR carries most of the light; a warm key for crisp edges, a rim tinted per project
    const key = new THREE.DirectionalLight(0xfff2e4, 1.1);
    key.position.set(4, 6, 5);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xb79cff, 1.8);
    rim.position.set(-5, 2.5, -4);
    scene.add(rim);
    const rimTarget = new THREE.Color(0xb79cff);

    const rig = new THREE.Group();
    scene.add(rig);
    const pair = new THREE.Group();
    pair.position.x = -0.2;
    rig.add(pair);
    const laptopSlot = new THREE.Group();
    laptopSlot.position.x = -0.35;
    pair.add(laptopSlot);
    // on a phone the visitor sees the phone: the laptop stays out, the phone stands in the middle
    const phoneOnly = innerWidth <= 768;
    if (phoneOnly) laptopSlot.visible = false;
    // the phone stands up from lying on its back, pivoting on its bottom-back edge
    const phoneBase = new THREE.Group();
    phoneBase.position.set(phoneOnly ? 0.2 : 2.1, 0, phoneOnly ? 0 : 0.55 - PHONE_T);
    phoneBase.rotation.y = phoneOnly ? -0.12 : -0.3;
    pair.add(phoneBase);
    const phoneHinge = new THREE.Group();
    phoneBase.add(phoneHinge);

    const deskMat = screenMat();
    const mobMat = screenMat();
    const screens = [deskMat, mobMat];
    let lid: THREE.Object3D | null = null;
    let laptopShadow: THREE.MeshBasicMaterial | null = null;
    let phoneShadow: THREE.MeshBasicMaterial | null = null;
    let ready = false;
    let failed = false;

    const ownTextures: THREE.Texture[] = [];
    const prepare = (root: THREE.Object3D) => {
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const mat = m.material as THREE.MeshStandardMaterial;
        if (o.name === "LaptopScreen" || o.name === "PhoneScreen") {
          // glTF stores v top-down; the screenshots are sampled bottom-up (TextureLoader flips them)
          const uv = m.geometry.attributes.uv as THREE.BufferAttribute;
          for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
          m.material = o.name === "LaptopScreen" ? deskMat : mobMat;
          // each screen crops its picture to its own glass (the phone is tall, the laptop wide)
          (m.material as THREE.ShaderMaterial).uniforms.uAspect.value = glassAspect(m, o.name === "PhoneScreen");
          mat.dispose();
        } else if (/Shadow$/.test(o.name) && mat.map) {
          // baked in Blender as a grey image (white = shade): used as the alpha of a warm, unlit plane
          const tex = mat.map;
          tex.colorSpace = THREE.NoColorSpace;
          ownTextures.push(tex);
          const sh = new THREE.MeshBasicMaterial({ color: 0x2a2017, alphaMap: tex, transparent: true, opacity: 0, depthWrite: false });
          m.material = sh;
          m.renderOrder = -1;
          mat.dispose();
          if (o.name === "LaptopShadow") laptopShadow = sh;
          else phoneShadow = sh;
        } else if (mat.name === "KeyboardWellAO" && mat.map) {
          // the baked occlusion around every key, multiplied into the dark well
          mat.map.colorSpace = THREE.NoColorSpace;
          ownTextures.push(mat.map);
          mat.color.set(0x111113);
          mat.needsUpdate = true;
        } else if (mat.name === "Keycap") {
          // keys catch a soft sheen from the overhead softbox, so they read against the well
          const k = mat as THREE.MeshPhysicalMaterial;
          k.color.set(0x1b1b1f);
          k.roughness = 0.46;
          if ("specularIntensity" in k) k.specularIntensity = 1;
        } else if (mat.name === "BlackGlass" || mat.name === "Lens") {
          // glossy black glass: keep it black, with crisp but quieter softbox reflections
          mat.envMapIntensity = 0.45;
        } else if (mat.name === "Aluminium" || mat.name === "AluminiumPad") {
          mat.color.set(mat.name === "Aluminium" ? 0xc4c6cd : 0xb7b9c0);
          mat.roughness = mat.name === "Aluminium" ? 0.34 : 0.3;
        }
      });
    };

    // textures for the screens (cached per URL)
    const loader = new THREE.TextureLoader();
    const cache = new Map<string, Promise<THREE.Texture>>();
    const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const upload = (t: THREE.Texture) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = aniso;
      try {
        renderer.initTexture(t); // to the GPU now, not in the middle of a turn
      } catch {}
      return t;
    };
    // fallback (no bitmap flipping): an <img>, decoded off the main thread first
    const loadImg = (src: string) =>
      new Promise<THREE.Texture>((res) =>
        loader.load(
          src,
          (t) => {
            const img = t.image as HTMLImageElement;
            (img.decode ? img.decode().catch(() => undefined) : Promise.resolve()).then(() => res(upload(t)));
          },
          undefined,
          () => res(deskMat.uniforms.uA.value),
        ),
      );
    const loadBitmap = async (src: string) => {
      const r = await fetch(src);
      if (!r.ok) throw new Error(String(r.status));
      // decoded and flipped (WebGL's bottom-up rows) on a worker thread; the upload is then a plain copy
      const bmp = await createImageBitmap(await r.blob(), { imageOrientation: "flipY", premultiplyAlpha: "none" });
      if (failed) {
        bmp.close();
        throw new Error("gone");
      }
      const t = new THREE.Texture(bmp);
      t.flipY = false;
      t.needsUpdate = true;
      return upload(t);
    };
    const load = (src: string) => {
      if (!cache.has(src)) cache.set(src, canFlipBitmaps().then((ok) => (ok ? loadBitmap(src).catch(() => (failed ? (deskMat.uniforms.uA.value as THREE.Texture) : loadImg(src))) : loadImg(src))));
      return cache.get(src)!;
    };
    const size = (t: THREE.Texture) => {
      const img = t.image as { width?: number; height?: number; videoWidth?: number; videoHeight?: number } | undefined;
      return new THREE.Vector2(img?.videoWidth || img?.width || 1, img?.videoHeight || img?.height || 1);
    };
    // phone recordings as live textures: only the shown one plays, and only while the section is on screen
    const videos = new Map<string, Promise<THREE.Texture>>();
    let playing: HTMLVideoElement | null = null;
    const loadVideo = (src: string, fallback: string) => {
      if (!videos.has(src))
        videos.set(
          src,
          new Promise((res) => {
            const v = document.createElement("video");
            Object.assign(v, { muted: true, loop: true, playsInline: true, preload: "auto", crossOrigin: "anonymous" });
            v.setAttribute("muted", "");
            v.setAttribute("playsinline", "");
            const done = () => {
              const t = new THREE.VideoTexture(v);
              t.colorSpace = THREE.SRGBColorSpace;
              res(t);
            };
            v.addEventListener("loadeddata", done, { once: true });
            v.addEventListener("error", () => load(fallback).then(res), { once: true });
            v.src = src;
            v.load();
          }),
        );
      return videos.get(src)!;
    };
    const playOnly = (t: THREE.Texture | undefined) => {
      const v = t?.image instanceof HTMLVideoElement ? t.image : null;
      if (playing && playing !== v) playing.pause();
      playing = v;
      if (v && visible) v.play().catch(() => {});
    };

    const yaw = spring(52, 9.5);
    const hop = spring(70, 11);
    const nod = spring(95, 10);
    const phoneYaw = spring(60, 9);
    const state = { mixAt: -10, cur: -1, rx: 0, ry: 0, tx: 0, ty: 0, drag: 0, dragV: 0, introAt: -1, phoneKick: 0, phoneKickAt: -1, turnAt: -10, turnDir: 1, phoneMixAt: -10 };
    let visible = false;
    let seq = 0;
    const now = () => performance.now() / 1000;

    // on a phone the laptop is small: its screen uses the picture the hero cards already downloaded
    const deskSrc = (it: ShowcaseItem) => (innerWidth <= 768 ? it.desk.replace("w=1200", "w=828") : it.desk);
    // the first pair of screens; the devices only appear once these are in (no black screens)
    let firstScreens: Promise<void> = Promise.resolve();
    const show = (i: number) => {
      const items = itemsRef.current;
      const it = items[i];
      if (!it || i === state.cur) return;
      const first = state.cur < 0;
      let diff = first ? 1 : i - state.cur;
      const n = items.length;
      if (diff > n / 2) diff -= n;
      if (diff < -n / 2) diff += n;
      const dir = diff >= 0 ? 1 : -1;
      state.cur = i;
      const my = ++seq;
      // the whole pair turns once around, right away (no waiting for the pictures); the screens
      // change while its back is to you
      if (!first && !reduced) {
        sfx("swipe");
        state.turnAt = now();
        state.turnDir = dir;
        hop.v += 1.7;
      }
      const pair = Promise.all([phoneOnly ? Promise.resolve(deskMat.uniforms.uB.value as THREE.Texture) : load(deskSrc(it)), load(it.mob)]);
      if (it.mobVideo && !reduced && innerWidth > 768) {
        const wait = first ? 1200 : (TURN + 0.45) * 1000;
        setTimeout(() => {
          if (my !== seq) return;
          loadVideo(it.mobVideo!, it.mob).then((v) => {
            if (my !== seq || !(v.image instanceof HTMLVideoElement)) return;
            playOnly(v);
            mobMat.uniforms.uA.value = mobMat.uniforms.uB.value;
            mobMat.uniforms.uSizeA.value = mobMat.uniforms.uSizeB.value;
            mobMat.uniforms.uB.value = v;
            mobMat.uniforms.uSizeB.value = size(v);
            state.phoneMixAt = now();
          });
        }, wait);
      }
      if (first) firstScreens = pair.then(() => undefined);
      pair.then(([d, m]) => {
        if (my !== seq) return;
        playOnly(m);
        for (const [mat, tex] of [
          [deskMat, d],
          [mobMat, m],
        ] as const) {
          mat.uniforms.uA.value = first ? tex : mat.uniforms.uB.value;
          mat.uniforms.uSizeA.value = first ? size(tex) : mat.uniforms.uSizeB.value;
          mat.uniforms.uB.value = tex;
          mat.uniforms.uSizeB.value = size(tex);
          mat.uniforms.uDir.value = dir;
        }
        // new screens: at the half turn (or at once if they came late / motion is reduced)
        state.mixAt = first ? -10 : Math.max(now() + 0.02, state.turnAt + TURN * 0.42);
        state.phoneMixAt = state.mixAt;
        if (!first && !reduced) {
          // the phone settles a beat after the turn
          state.phoneKick = dir;
          state.phoneKickAt = state.turnAt + TURN * 0.8;
          nod.v += 1.6;
        }
        rimTarget.set(it.accent);
      });
      // preload neighbours
      [items[(i + 1) % n], items[(i - 1 + n) % n]].forEach((x) => x && (phoneOnly || load(deskSrc(x)), load(x.mob)));
    };
    // new screens for the same project (another language): swap them in place, no rebuild
    const refresh = () => {
      const i = state.cur;
      if (i < 0) return;
      state.cur = -1;
      show(i);
    };
    api.current = { show, refresh };
    show(indexRef.current);

    // pull the camera back until the pair fits the canvas: big on a wide screen, small on a phone
    let dist = 9;
    const resize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      const tan = Math.tan((camera.fov * Math.PI) / 360);
      // the canvas is the free band between the texts (see story.tsx), so the pair may fill most of it:
      // a wide, shallow band (desktop) keeps air at the sides, a squarer one (tablet, phone) uses the width
      // the canvas is taller than the free band (story.tsx): fit the height to the band only
      const band = Math.min(1, Math.max(0.3, Number(canvas.dataset.band) || 1));
      const frac = 0.94 - 0.2 * clamp01((camera.aspect / band - 1.2) / 1);
      const fitW = (phoneOnly ? 0.62 : 2.4) / (frac * tan * camera.aspect);
      const fitH = (phoneOnly ? 0.86 : 1.22) / (0.9 * band * tan);
      dist = Math.max(fitW, fitH);
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    // where the canvas is, without asking for layout on every pointer move: taken from the observer and
    // shifted by how far the page has scrolled since
    const box = { left: 0, top: 0, w: 1, h: 1, at: 0 };
    const io = new IntersectionObserver(
      ([e]) => {
        visible = e.isIntersecting;
        const r = e.boundingClientRect;
        Object.assign(box, { left: r.left, top: r.top, w: Math.max(1, r.width), h: Math.max(1, r.height), at: scrollPos() });
        if (!playing) return;
        if (visible) playing.play().catch(() => {});
        else playing.pause();
      },
      { threshold: [0, 0.1, 0.35, 0.6, 0.9, 1] },
    );
    io.observe(canvas);
    // the intro starts once a good part of the section is on screen
    const introIo = new IntersectionObserver(([e]) => {
      if (e.intersectionRatio >= 0.12 && ready && state.introAt < 0) state.introAt = now();
    }, { threshold: [0.12] });
    introIo.observe(canvas);

    // load + warm up before the section scrolls in (a quiet moment a few seconds after load while the
    // visitor is still on the hero, or when the section comes within 1.6 screens), so the first visible
    // frame is not a hitch
    let warmed = false;
    const idle = (fn: () => void, timeout = 600) => ("requestIdleCallback" in window ? requestIdleCallback(fn, { timeout }) : setTimeout(fn, 60));
    const warm = () => {
      if (warmed) return;
      warmed = true;
      near();
      Promise.all([new GLTFLoader().loadAsync(MODEL), new HDRLoader().loadAsync(STUDIO)])
        .then(async ([gltf, hdr]) => {
          if (failed) return;
          hdr.mapping = THREE.EquirectangularReflectionMapping;
          await prewarmPmrem(renderer, pmrem, hdr).catch(() => undefined);
          if (failed) return;
          const env = pmrem.fromEquirectangular(hdr).texture;
          hdr.dispose();
          scene.environment = env;
          prepare(gltf.scene);
          // set per material (not only scene.environment), so each material's envMapIntensity applies
          gltf.scene.traverse((o) => {
            const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
            if (m && "envMapIntensity" in m && !(m as unknown as THREE.ShaderMaterial).isShaderMaterial && !(m as unknown as THREE.MeshBasicMaterial).isMeshBasicMaterial) {
              m.envMap = env;
              m.envMapIntensity *= ENV;
            }
          });
          const laptop = gltf.scene.getObjectByName("Laptop");
          const phone = gltf.scene.getObjectByName("Phone");
          lid = gltf.scene.getObjectByName("LaptopLid") ?? null;
          if (laptop) laptopSlot.add(laptop);
          if (phone) {
            const ps = phone.getObjectByName("PhoneShadow");
            phone.position.set(0, PHONE_H, PHONE_T);
            phoneHinge.add(phone);
            // the shadow stays on the floor while the phone stands up
            if (ps) {
              ps.removeFromParent();
              ps.position.set(0, PHONE_H, PHONE_T);
              phoneBase.add(ps);
            }
          }
          pose(reduced ? 1 : 0);
          return Promise.all([
            renderer.compileAsync(scene, camera).catch(() => undefined),
            Promise.race([firstScreens, new Promise((r) => setTimeout(r, 4000))]),
          ]);
        })
        .then(() => {
          if (failed || !lid) return;
          ready = true;
          const r = canvas.getBoundingClientRect();
          const onScreen = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0)) / Math.max(1, r.height);
          if (reduced || onScreen >= 0.12) state.introAt = reduced ? -100 : now();
          idle(() => !visible && renderer.render(scene, camera));
        })
        .catch((e) => console.warn("[showcase] 3D assets failed to load", e));
    };
    const near = whenNear(canvas, warm);
    // the 3D files load in a quiet moment after the loader has gone (never while it animates)
    let early: ReturnType<typeof setTimeout> | undefined;
    let stillCancel = () => {};
    const afterIntro = () => (early = setTimeout(() => (stillCancel = whenStill(warm)), 1500));
    if (document.documentElement.dataset.intro === "done") afterIntro();
    else addEventListener("intro:done", afterIntro, { once: true });

    /** Places everything for intro progress p (0 = lid shut, phone lying, screens off; 1 = done). */
    let introP = reduced ? 1 : 0;
    const pose = (p: number) => {
      introP = p;
      const T = p * 2.6; // seconds into the intro
      const lidP = clamp01((T - 0.1) / 1.35);
      const powerP = clamp01((T - 0.95) / 1.0);
      const phoneP = clamp01((T - 0.55) / 1.15);
      if (lid) lid.rotation.x = LID_CLOSED + (LID_OPEN - LID_CLOSED) * easeOutBack(lidP, 0.9) + nod.x * 0.12;
      phoneHinge.rotation.x = -Math.PI / 2 * (1 - easeOutBack(phoneP, 1.4));
      for (const s of screens) s.uniforms.uPower.value = easeInOut(powerP);
      if (laptopShadow) laptopShadow.opacity = 0.42 + 0.2 * lidP;
      if (phoneShadow) phoneShadow.opacity = 0.62 * easeOutCubic(phoneP);
    };

    const onMove = (e: PointerEvent) => {
      if (!visible) return;
      const top = box.top - (scrollPos() - box.at);
      state.tx = Math.max(-1.5, Math.min(1.5, ((e.clientX - box.left) / box.w - 0.5) * 2));
      state.ty = Math.max(-1.5, Math.min(1.5, ((e.clientY - top) / box.h - 0.5) * 2));
    };
    let down: number | null = null;
    const onDown = (e: PointerEvent) => (down = e.clientX);
    const onDrag = (e: PointerEvent) => {
      if (down === null) return;
      const dx = e.clientX - down;
      down = e.clientX;
      state.dragV = dx * 0.006;
      state.drag += state.dragV;
    };
    const onUp = () => (down = null);
    window.addEventListener("pointermove", onMove, { passive: true });
    canvas.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onDrag, { passive: true });
    window.addEventListener("pointerup", onUp);

    // dev only: window.__showcase.freeze(0.4) holds the intro at 40% (for checking frames), null resumes
    let freeze: number | null = null;
    if (process.env.NODE_ENV !== "production") (window as unknown as { __showcase?: object }).__showcase = { freeze: (p: number | null) => (freeze = p) };

    let raf = 0;
    let last = now();
    const t0 = last;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const t = now();
      const dt = Math.min(1 / 30, t - last);
      last = t;
      if (!visible || !ready) return;
      // pointer above → the pair tips slightly towards you (more of the keyboard), never edge-on
      state.rx += (-state.ty * 0.05 - state.rx) * 0.06;
      state.ry += (state.tx * 0.35 - state.ry) * 0.06;
      if (down === null) {
        state.dragV *= 0.94;
        state.drag += state.dragV;
        state.drag *= 0.985;
      }
      if (state.phoneKickAt > 0 && t >= state.phoneKickAt) {
        phoneYaw.v -= state.phoneKick * 3.2;
        state.phoneKickAt = -1;
      }
      // fixed small steps keep the springs stable at any frame rate
      for (let k = 0, n = Math.ceil(dt / (1 / 120)); k < n; k++) for (const s of [yaw, hop, nod, phoneYaw]) step(s, dt / n);

      if (freeze !== null) pose(freeze);
      else if (introP < 1) pose(state.introAt < 0 ? 0 : clamp01((t - state.introAt) / 1.9));
      else if (lid) lid.rotation.x = LID_OPEN + nod.x * 0.12;
      const intro = easeOutCubic(introP);

      const mixP = clamp01((t - state.mixAt) / 0.85);
      deskMat.uniforms.uMix.value = mixP;
      mobMat.uniforms.uMix.value = clamp01((t - state.phoneMixAt) / 0.85);
      rim.color.lerp(rimTarget, 0.05);

      const sway = Math.sin((t - t0) * 0.35) * 0.28;
      // one full turn on a project switch (eased; 2π ≡ 0, so it ends exactly where it began)
      const tp = clamp01((t - state.turnAt) / TURN);
      const turn = tp > 0 && tp < 1 ? -state.turnDir * Math.PI * 2 * easeInOut(tp) : 0;
      rig.rotation.y = sway + state.ry + state.drag + yaw.x - 0.55 * (1 - intro) + turn;
      rig.rotation.x = state.rx;
      pair.position.y = Math.sin((t - t0) * 0.9) * 0.04 + hop.x * 0.22;
      phoneBase.rotation.y = (phoneOnly ? -0.12 : -0.3) + phoneYaw.x * 0.5;
      const glare = rig.rotation.y * 0.6;
      deskMat.uniforms.uSheen.value = glare;
      mobMat.uniforms.uSheen.value = glare + 0.3;

      // a slow dolly in during the intro
      const d = dist * (1 + 0.12 * (1 - intro));
      camera.position.set(0, d * 0.183, d);
      camera.lookAt(0, phoneOnly ? 0.7 : 0.62, 0);
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      failed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      introIo.disconnect();
      near();
      clearTimeout(early);
      removeEventListener("intro:done", afterIntro);
      stillCancel();
      window.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onDrag);
      window.removeEventListener("pointerup", onUp);
      api.current = null;
      cache.forEach((p) =>
        p.then((t) => {
          t.dispose();
          if (typeof ImageBitmap !== "undefined" && t.image instanceof ImageBitmap) t.image.close();
        }),
      );
      ownTextures.forEach((t) => t.dispose());
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.geometry?.dispose();
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        mats.forEach((x) => {
          const sm = x as THREE.MeshStandardMaterial;
          sm.map?.dispose();
          x.dispose();
        });
      });
      scene.environment?.dispose();
      pmrem.dispose();
      renderer.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  useEffect(() => {
    api.current?.show(index);
  }, [index]);

  const shownItems = useRef(items);
  useEffect(() => {
    if (shownItems.current === items) return;
    shownItems.current = items;
    api.current?.refresh();
  }, [items]);

  return <canvas ref={ref} className={className} aria-hidden />;
}
