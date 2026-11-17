/** Shared scroll state for the story's WebGL layers (written by the engine in story.tsx). */
export type StoryProgress = {
  /** scroll position in viewport heights */
  p: number;
  /** 0..1 — the lilac world folding away as the showcase forms */
  collapse: number;
  /** deck fully hidden (scaled away or covered) — skip its rendering */
  deckHidden: boolean;
  /** lilac ink coverage 0..1 */
  ink: number;
  lastDeckP: number;
  lastMx: number;
  lastMy: number;
  /** velocity added by dragging the hero spiral */
  spinVel: number;
  /** when the about card was tapped (it turns once) */
  flipAt: number;
  /** last time the page scrolled (idle nudge) */
  lastScrollAt: number;
  /** clients wheel scroll rotation 0..1 */
  g8rot: number;
  /** the about card has landed and its HTML copy is showing: the WebGL card steps aside */
  aboutDom: boolean;
  aboutAt: number;
};

export const newProgress = (): StoryProgress => ({ p: 0, collapse: 0, deckHidden: false, ink: 0, lastDeckP: -1, lastMx: 0, lastMy: 0, spinVel: 0, flipAt: -10, lastScrollAt: 0, g8rot: 1, aboutDom: false, aboutAt: 0 });

export const lin = (a: number, b: number, x: number) => Math.min(1, Math.max(0, (x - a) / (b - a)));
export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
