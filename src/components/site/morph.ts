/** Jump to the top instantly, killing any smooth-scroll inertia so it can't drag the next page down. */
export function jumpTop() {
  window.__lenis?.scrollTo(0, { immediate: true, force: true });
  window.scrollTo(0, 0);
}

/** sessionStorage key: where the home page was when a project was opened from it (to come back there) */
export const HOME_KEY = "ct_home";

/** Remember the home page's scroll position before leaving it for a project. */
export function rememberHome(slug: string) {
  try {
    sessionStorage.setItem(HOME_KEY, JSON.stringify({ y: window.scrollY, slug, at: Date.now() }));
  } catch {}
}

export type Box = { left: number; top: number; width: number; height: number };

/** Where the case page's hero picture sits (see work/[slug]/case.module.css .hero/.media). */
export function caseHeroRect(): Box & { radius: number } {
  const phone = innerWidth <= 768;
  const H = phone ? Math.max(innerHeight * 0.92, 520) : Math.max(innerHeight, 600);
  const pad = phone ? 8 : 10;
  return { left: pad, top: pad, width: innerWidth - pad * 2, height: H * 0.72 - pad, radius: phone ? 18 : 22 };
}

export const viewportBox = (): Box => ({ left: 0, top: 0, width: innerWidth, height: innerHeight });

/**
 * End of a hand-over onto a case hero: the hero must not play its own wipe-in afterwards (dropping the
 * html[data-morph] flag would start that CSS animation from "hidden" — a blank flash), so it is
 * switched off on the element itself first.
 */
export function endMorph() {
  const media = document.querySelector<HTMLElement>("main [data-vel]");
  if (media) media.style.animation = "none";
  delete document.documentElement.dataset.morph;
}

const expoInOut = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? 2 ** (20 * x - 10) / 2 : (2 - 2 ** (-20 * x + 10)) / 2);
const quartInOut = (x: number) => (x < 0.5 ? 8 * x ** 4 : 1 - (-2 * x + 2) ** 4 / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * A picture seen through a moving window: the MASK (the window) travels from one box to another while
 * the picture inside keeps its own size — no zoom — and drifts more slowly than the window's edges
 * (parallax), from `img0` to `img1` (offsets of the picture from `base`, in screen px).
 *
 * Everything is transforms on two layers, played as Web Animations: the compositor runs them even
 * while the main thread is busy building the next page. The window is a box at `base` scaled to the
 * current window; the picture inside is counter-scaled by exactly the inverse, so it never stretches.
 */
export function maskFlight(o: {
  src: string[];
  base: Box;
  win0: Box;
  win1: Box;
  img0?: { x: number; y: number };
  img1?: { x: number; y: number };
  radius: number;
  dur: number;
  fadeIn?: number; // share of the flight spent fading in
  fadeOut?: number; // share of the flight spent fading out at the end
  z?: number;
}) {
  const { base, win0, win1, radius, dur } = o;
  const img0 = o.img0 ?? { x: 0, y: 0 };
  const img1 = o.img1 ?? { x: 0, y: 0 };
  const frame = document.createElement("div");
  frame.setAttribute("aria-hidden", "true");
  Object.assign(frame.style, {
    position: "fixed",
    left: `${base.left}px`,
    top: `${base.top}px`,
    width: `${base.width}px`,
    height: `${base.height}px`,
    zIndex: String(o.z ?? 500),
    overflow: "hidden",
    background: "#0b0b0d",
    borderRadius: `${radius}px`,
    transformOrigin: "0 0",
    willChange: "transform, opacity",
    pointerEvents: "none",
    contain: "strict",
  } as CSSStyleDeclaration);
  const pic = document.createElement("div");
  Object.assign(pic.style, {
    position: "absolute",
    inset: "0",
    backgroundImage: o.src
      .filter(Boolean)
      .map((u) => `url("${u}")`)
      .join(", "),
    backgroundSize: "cover",
    backgroundPosition: "center top",
    transformOrigin: "0 0",
    willChange: "transform",
  } as CSSStyleDeclaration);
  frame.appendChild(pic);
  document.body.appendChild(frame);

  const N = 30;
  const fk: Keyframe[] = [];
  const pk: Keyframe[] = [];
  for (let k = 0; k <= N; k++) {
    const t = k / N;
    const e = expoInOut(t); // the window
    const p = quartInOut(t); // the picture: a softer curve, so it lags the window (parallax)
    const L = lerp(win0.left, win1.left, e);
    const T = lerp(win0.top, win1.top, e);
    const sx = lerp(win0.width, win1.width, e) / base.width;
    const sy = lerp(win0.height, win1.height, e) / base.height;
    const dx = L - base.left;
    const dy = T - base.top;
    const ox = lerp(img0.x, img1.x, p);
    const oy = lerp(img0.y, img1.y, p);
    let op = 1;
    if (o.fadeIn) op = Math.min(op, t / o.fadeIn);
    if (o.fadeOut) op = Math.min(op, (1 - t) / o.fadeOut);
    fk.push({ offset: t, opacity: Math.max(0, Math.min(1, op)), transform: `translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0) scale(${sx.toFixed(5)}, ${sy.toFixed(5)})` });
    pk.push({ offset: t, transform: `translate3d(${((ox - dx) / sx).toFixed(2)}px, ${((oy - dy) / sy).toFixed(2)}px, 0) scale(${(1 / sx).toFixed(5)}, ${(1 / sy).toFixed(5)})` });
  }
  const opts: KeyframeAnimationOptions = { duration: dur, easing: "linear", fill: "forwards" };
  const run = frame.animate(fk, opts);
  pic.animate(pk, opts);
  const fade = (ms = 420) =>
    frame
      .animate([{ opacity: getComputedStyle(frame).opacity }, { opacity: 0 }], { duration: ms, easing: "ease-out", fill: "forwards" })
      .finished.then(() => frame.remove());
  return { frame, run, fade };
}

/**
 * Opening a project: the picture on the card becomes the case page's hero. A window grows from the
 * card to the hero's place; the picture, already at the hero's size, slides from the card into
 * position behind it. The route changes part-way (the next page builds while the compositor plays),
 * and the overlay fades once the case page is ready.
 */
export function morphTo(img: HTMLElement, src: string | string[], navigate: () => void) {
  const from = img.getBoundingClientRect();
  const to = caseHeroRect();
  const phone = innerWidth <= 768;
  const dur = phone ? 820 : 950;
  // the picture starts centred on the card (its middle, not the site's menu bar, shows in the small
  // window) and drifts up into place behind the opening window
  const img0 = { x: from.left + from.width / 2 - (to.left + to.width / 2), y: from.top + from.height / 2 - (to.top + to.height / 2) };
  const fly = maskFlight({
    src: Array.isArray(src) ? src : [src],
    base: to,
    win0: from,
    win1: to,
    img0,
    radius: to.radius,
    dur,
    fadeIn: 0.12,
  });
  // the page behind turns to the case page's paper while the window grows, so the swap underneath
  // (and the new hero, already there) never shows around the opening window
  const veil = document.createElement("div");
  veil.setAttribute("aria-hidden", "true");
  Object.assign(veil.style, { position: "fixed", inset: "0", zIndex: "499", background: "#f2f0ec", pointerEvents: "none", opacity: "0" } as CSSStyleDeclaration);
  document.body.appendChild(veil);
  veil.animate([{ opacity: 0 }, { opacity: 1, offset: 0.55 }, { opacity: 1 }], { duration: dur, easing: "ease-in-out", fill: "forwards" });
  // the case hero skips its own wipe-in while the overlay hands over
  document.documentElement.dataset.morph = "1";
  // stop any scroll momentum where it is and hold the wheel until the case page is in
  window.__lenis?.scrollTo(window.scrollY, { immediate: true, force: true });
  window.__lenis?.stop();
  // the next page builds under the veil while the compositor finishes the flight
  const go = setTimeout(navigate, dur * 0.6);

  let ready = false;
  let landed = false;
  let done = false;
  const finish = () => {
    if (done || !ready || !landed) return;
    done = true;
    veil.remove();
    fly.fade(460).then(endMorph);
  };
  fly.run.finished.then(() => {
    landed = true;
    finish();
  });
  window.addEventListener(
    "case:ready",
    () => {
      jumpTop();
      window.__lenis?.start();
      ready = true;
      finish();
    },
    { once: true },
  );
  // safety: never leave the overlay on screen
  setTimeout(() => {
    clearTimeout(go);
    window.__lenis?.start();
    ready = landed = true;
    finish();
  }, 5000);
}
