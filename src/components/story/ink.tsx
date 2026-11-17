"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { StoryProgress } from "./engine";

const vert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const frag = /* glsl */ `
precision highp float;
uniform float uP;
uniform float uTime;
uniform vec2 uRes;
uniform vec3 uBase;
uniform vec3 uBright;
uniform vec3 uDeep;
varying vec2 vUv;

vec2 hash(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(dot(hash(i), f), dot(hash(i + vec2(1, 0)), f - vec2(1, 0)), u.x),
             mix(dot(hash(i + vec2(0, 1)), f - vec2(0, 1)), dot(hash(i + vec2(1, 1)), f - vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.02; a *= 0.5; }
  return v;
}
void main() {
  float asp = uRes.x / uRes.y;
  vec2 p = (vUv - 0.5) * vec2(asp, 1.0);
  float far = 0.5 * length(vec2(asp, 1.0));
  float d = length(p) / far;
  float n = fbm(p * 3.2 + vec2(uTime * 0.12, -uTime * 0.08));
  float r = uP * 1.18;
  // the noisy edge only exists once the pool has started to spread (no stray blob at rest)
  float grow = smoothstep(0.0, 0.12, uP);
  float e = r - d + n * 0.32 * (1.0 - uP * 0.55) * grow - (1.0 - grow) * 0.2;
  float a = smoothstep(0.0, 0.015, e) * step(0.0005, uP);
  float rim = 1.0 - smoothstep(0.0, 0.22, e);
  vec3 col = mix(uBase, uDeep, rim * 0.85);
  float swirl = smoothstep(0.08, 0.5, fbm(p * 1.6 - vec2(uTime * 0.05, uTime * 0.04)));
  col = mix(col, uBright, swirl * 0.55 * (1.0 - rim));
  gl_FragColor = vec4(col, a);
}`;

/**
 * Fog-blue "ink": an organic, noise-edged pool that spreads from the centre of the screen as the
 * project is accepted, and recedes when the showcase forms. Renders only while it changes.
 */
export function Ink({ progress, className }: { progress: React.RefObject<StoryProgress>; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
    } catch {
      return;
    }
    const mobile = innerWidth < 768;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 0.6 : 1.25));
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    const camera = new THREE.Camera();
    const mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      uniforms: {
        uP: { value: 0 },
        uTime: { value: 0 },
        uRes: { value: new THREE.Vector2(1, 1) },
        uBase: { value: new THREE.Color("#dde4ec") },
        uBright: { value: new THREE.Color("#f6f8fb") },
        uDeep: { value: new THREE.Color("#9fb0c4") },
      },
    });
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
    const size = () => {
      renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
      mat.uniforms.uRes.value.set(canvas.clientWidth, canvas.clientHeight);
      draw();
    };
    let shown = -1;
    let time = 0;
    let last = performance.now() / 1000;
    let until = 0;
    const draw = () => renderer.render(scene, camera);
    const ro = new ResizeObserver(size);
    ro.observe(canvas);
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const t = performance.now() / 1000;
      const dt = Math.min(0.05, t - last);
      last = t;
      const v = progress.current?.ink ?? 0;
      const moving = v > 0.001 && v < 0.999;
      if (Math.abs(v - shown) > 1e-4 || moving) until = t + 0.4;
      if (t > until) return;
      if (moving) time += dt * 1.7;
      shown = v;
      mat.uniforms.uP.value = v;
      mat.uniforms.uTime.value = time;
      draw();
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mat.dispose();
      renderer.dispose();
    };
  }, [progress]);

  return <canvas ref={ref} className={className} aria-hidden />;
}
