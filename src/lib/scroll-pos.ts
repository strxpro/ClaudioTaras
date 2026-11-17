/**
 * Scroll position and viewport size without asking the browser for layout.
 *
 * Reading `scrollY`, `innerHeight` or `getBoundingClientRect()` inside a frame callback, after anything
 * has written a style in that frame, makes the browser lay the whole page out on the spot — and the
 * home page is long, so every such read costs several milliseconds and turns a smooth scroll into a
 * stuttering one. Lenis keeps the scroll position as a plain number; without Lenis it is read in the
 * scroll event (the layout is clean then). The viewport size is cached and refreshed on resize.
 */
let nativeY = 0;
let vw = 0;
let vh = 0;
if (typeof window !== "undefined") {
  nativeY = scrollY;
  vw = innerWidth;
  vh = innerHeight;
  addEventListener("scroll", () => !window.__lenis && (nativeY = scrollY), { passive: true, capture: true });
  addEventListener("resize", () => {
    vw = innerWidth;
    vh = innerHeight;
    nativeY = scrollY;
  });
}

/** Current scroll position (px from the top). */
export const scrollPos = (): number => (typeof window !== "undefined" && window.__lenis ? window.__lenis.scroll : nativeY);
/** Viewport width (cached). */
export const viewW = (): number => vw;
/** Viewport height (cached). */
export const viewH = (): number => vh;
