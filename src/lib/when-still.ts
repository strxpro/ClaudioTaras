/**
 * Heavy one-off work (building a WebGL scene, parsing a 3D model, opening the audio device) waits for a
 * quiet moment: the page has not scrolled and the pointer has not moved for a little while, and the
 * browser is idle — so it never lands under a moving finger or a moving cursor.
 */
let lastActive = -1e9;
if (typeof window !== "undefined") {
  const mark = () => (lastActive = performance.now());
  for (const n of ["scroll", "wheel", "pointermove", "pointerdown", "touchmove", "keydown"])
    addEventListener(n, mark, { passive: true, capture: true });
}

/** Runs `fn` once the page has been still for `still` ms (then in an idle callback). Returns a cancel. */
export function whenStill(fn: () => void, still = 500): () => void {
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let idle: number | undefined;
  const check = () => {
    if (cancelled) return;
    const quiet = performance.now() - lastActive;
    if (quiet < still) {
      timer = setTimeout(check, still - quiet + 40);
      return;
    }
    if (!("requestIdleCallback" in window)) return fn();
    idle = requestIdleCallback(
      () => {
        idle = undefined;
        if (cancelled) return;
        // the visitor started moving again while we waited for the idle slot: wait for the next pause
        if (performance.now() - lastActive < still) return check();
        fn();
      },
      { timeout: 1200 },
    );
  };
  check();
  return () => {
    cancelled = true;
    clearTimeout(timer);
    if (idle !== undefined) cancelIdleCallback(idle);
  };
}

/**
 * Runs `fn` once, when `el` comes within `far` of the viewport and the visitor pauses for a moment (even
 * between two flicks of the wheel) — or, for someone who never pauses, at the latest within `close`.
 * Returns a cancel.
 */
export function whenNear(el: Element, fn: () => void, far = "320% 0px", close = "90% 0px"): () => void {
  let done = false;
  let cancel = () => {};
  const run = () => {
    if (done) return;
    done = true;
    stop();
    fn();
  };
  const a = new IntersectionObserver(
    ([e]) => {
      if (!e.isIntersecting || done) return;
      cancel();
      cancel = whenStill(run, 160);
    },
    { rootMargin: far },
  );
  const b = new IntersectionObserver(([e]) => e.isIntersecting && run(), { rootMargin: close });
  const stop = () => {
    a.disconnect();
    b.disconnect();
    cancel();
  };
  a.observe(el);
  b.observe(el);
  return stop;
}
