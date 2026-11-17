/** Card art for the WebGL deck, painted on 2D canvases (front: the project, back: its screenshot). */
import { LOGO } from "@/components/site/logo";
import { CT_PARTS, CT_VIEWBOX } from "@/components/site/ct-mark";

export type DeckCard = {
  label: string;
  title: string;
  body: string;
  chips: string[];
  footer: string;
  img: string;
  accent: string;
  /** the "about me" card: portrait (or the mark) instead of a screenshot */
  about?: boolean;
  role?: string;
};

export const CARD_W = 345;
export const CARD_H = 490;
const PAD = 7; // room for the soft shadow inside the texture

export function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.decoding = "async";
    // decode off the main thread before anyone draws it (a first drawImage would decode synchronously)
    img.onload = () => (img.decode ? img.decode().catch(() => undefined) : Promise.resolve()).then(() => resolve(img));
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function fontVar(name: string, fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v ? `${v}, ${fallback}` : fallback;
}

function cover(g: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, top = true) {
  const s = Math.max(w / img.width, h / img.height);
  const dw = img.width * s;
  const dh = img.height * s;
  g.drawImage(img, x + (w - dw) / 2, top ? y : y + (h - dh) / 2, dw, dh);
}

/** Word-wrap `text` into the box; returns the y after the last line. */
function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number, maxLines = 99) {
  let line = "";
  let n = 0;
  const words = text.split(" ");
  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i];
    if (g.measureText(test).width <= maxW || !line) {
      line = test;
      continue;
    }
    if (n === maxLines - 1) {
      while (line && g.measureText(`${line}…`).width > maxW) line = line.slice(0, -1);
      g.fillText(`${line}…`, x, y);
      return y + lh;
    }
    g.fillText(line, x, y);
    y += lh;
    n++;
    line = words[i];
  }
  if (line) {
    g.fillText(line, x, y);
    y += lh;
  }
  return y;
}

/** The CT monogram drawn on canvas (same as <LogoMark/>: the interlocked letters on an ink disc). */
// built on first use (Path2D exists only in the browser; this module is also evaluated on the server)
let CT_PATHS: { accent: boolean; path: Path2D }[] | null = null;
function mark(g: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const k = size / 48;
  const [vx, vy, vw, vh] = CT_VIEWBOX;
  const w = 31;
  const h = (w * vh) / vw;
  g.save();
  g.translate(x, y);
  g.scale(k, k);
  g.fillStyle = LOGO.disc;
  g.beginPath();
  g.arc(24, 24, 24, 0, Math.PI * 2);
  g.fill();
  g.translate((48 - w) / 2 + 0.6, (48 - h) / 2);
  g.scale(w / vw, h / vh);
  g.translate(-vx, -vy);
  CT_PATHS ??= CT_PARTS.map((p) => ({ accent: p.accent, path: new Path2D(p.svg.match(/ d="([^"]+)"/)?.[1] ?? "") }));
  for (const p of CT_PATHS) {
    g.fillStyle = p.accent ? LOGO.dot : LOGO.letters;
    g.fill(p.path);
  }
  g.restore();
}

/** Draw `text` like a CSS line box: `top` of the box and its line-height (so it matches the HTML copy). */
function textLine(g: CanvasRenderingContext2D, text: string, x: number, top: number, lh: number) {
  const m = g.measureText(text);
  const asc = m.fontBoundingBoxAscent || m.actualBoundingBoxAscent;
  const desc = m.fontBoundingBoxDescent || m.actualBoundingBoxDescent;
  g.fillText(text, x, top + (lh - (asc + desc)) / 2 + asc);
}

/** Break `text` into at most `max` lines of `width`, the last one ending in an ellipsis if cut. */
function lines(g: CanvasRenderingContext2D, text: string, width: number, max: number) {
  const out: string[] = [];
  let line = "";
  const words = text.split(" ");
  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i];
    if (g.measureText(test).width <= width || !line) {
      line = test;
      continue;
    }
    out.push(line);
    line = words[i];
    if (out.length === max) {
      let last = out[max - 1];
      while (last && g.measureText(`${last}…`).width > width) last = last.slice(0, -1);
      out[max - 1] = `${last.trimEnd()}…`;
      return out;
    }
  }
  if (line) out.push(line);
  return out;
}

/** A round portrait (or the mark on a warm gradient while there's no photo yet). */
function avatar(g: CanvasRenderingContext2D, img: HTMLImageElement | null, cx: number, cy: number, r: number) {
  g.save();
  g.beginPath();
  g.arc(cx, cy, r + 3, 0, Math.PI * 2);
  g.fillStyle = "#fff";
  g.shadowColor = "rgba(23, 19, 31, 0.18)";
  g.shadowBlur = 10;
  g.shadowOffsetY = 2;
  g.fill();
  g.restore();
  g.save();
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.clip();
  if (img) {
    // centre-crop, slightly favouring the top (faces)
    const s = Math.max((r * 2) / img.width, (r * 2) / img.height);
    const dw = img.width * s;
    const dh = img.height * s;
    g.imageSmoothingQuality = "high";
    g.drawImage(img, cx - dw / 2, cy - r - (dh - r * 2) * 0.2, dw, dh);
  } else mark(g, cx - r, cy - r, r * 2);
  g.restore();
}

export function paintFront(canvas: HTMLCanvasElement, c: DeckCard, img: HTMLImageElement | null, dpr: number) {
  const W = CARD_W;
  const H = CARD_H;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const g = canvas.getContext("2d")!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const sans = fontVar("--font-inter", "-apple-system, system-ui, sans-serif");
  const x0 = PAD;
  const y0 = PAD;
  const w = W - PAD * 2;
  const h = H - PAD * 2;

  g.clearRect(0, 0, W, H);
  // soft shadow so white cards read on the light page
  g.save();
  g.shadowColor = "rgba(23, 19, 31, 0.2)";
  g.shadowBlur = 12;
  g.shadowOffsetY = 3;
  g.beginPath();
  g.roundRect(x0, y0, w, h, 20);
  g.fillStyle = "#fff";
  g.fill();
  g.restore();
  g.save();
  g.beginPath();
  g.roundRect(x0, y0, w, h, 20);
  g.clip();

  if (c.about) {
    paintAbout(g, c, img, x0, y0, w, h, sans);
    g.restore();
    return;
  }

  // picture: the project's screen
  const ix = x0 + 10;
  const iy = y0 + 10;
  const iw = w - 20;
  const ih = 212;
  g.save();
  g.beginPath();
  g.roundRect(ix, iy, iw, ih, 14);
  g.clip();
  if (img) cover(g, img, ix, iy, iw, ih, true);
  else {
    g.fillStyle = c.accent;
    g.fillRect(ix, iy, iw, ih);
  }
  g.restore();

  let y = iy + ih + 30;
  g.font = `500 13px ${sans}`;
  g.fillStyle = "#8a8494";
  g.fillText(c.label, ix + 2, y);
  y += 34;
  g.font = `700 27px ${sans}`;
  g.fillStyle = "#17131f";
  y = wrap(g, c.title, ix + 2, y, iw - 4, 29, 2);
  g.font = `400 15px ${sans}`;
  g.fillStyle = "#57525e";
  wrap(g, c.body, ix + 2, y + 6, iw - 4, 20, 3);

  // footer strip
  g.fillStyle = "#f7f6f9";
  g.fillRect(x0, y0 + h - 34, w, 34);
  g.strokeStyle = "rgba(0,0,0,0.06)";
  g.beginPath();
  g.moveTo(x0, y0 + h - 34);
  g.lineTo(x0 + w, y0 + h - 34);
  g.stroke();
  g.font = `600 12px ${sans}`;
  {
    g.fillStyle = c.accent;
    g.beginPath();
    g.arc(ix + 6, y0 + h - 17, 4, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#6f6a77";
    g.fillText(c.footer, ix + 16, y0 + h - 13);
    g.textAlign = "right";
    g.fillText("↗", ix + iw - 2, y0 + h - 13);
    g.textAlign = "left";
  }
  g.restore();
}

/**
 * "About me", read inside the phone: round photo top-left, the name in the headline serif beside it,
 * a short bio and three facts. All numbers are card px and match .aboutCard in story.module.css, which
 * takes over (as crisp HTML) once the card has landed.
 */
function paintAbout(g: CanvasRenderingContext2D, c: DeckCard, img: HTMLImageElement | null, x0: number, y0: number, w: number, h: number, sans: string) {
  const serif = fontVar("--font-gilda", "Georgia, serif");
  const L = x0 + 24;
  const R = x0 + w - 24;
  const wash = g.createLinearGradient(x0, y0, x0 + w * 0.6, y0 + 116);
  wash.addColorStop(0, "#fff1e9");
  wash.addColorStop(1, "#ffffff");
  g.fillStyle = wash;
  g.fillRect(x0, y0, w, 116);

  avatar(g, img, L + 32, y0 + 56, 32);
  const tx = x0 + 102;
  g.letterSpacing = "0.84px";
  g.font = `600 14px ${sans}`;
  g.fillStyle = "#9a8f87";
  textLine(g, c.label.toUpperCase(), tx, y0 + 26, 18);
  g.letterSpacing = "0px";
  g.font = `400 32px ${serif}`;
  g.fillStyle = "#17131f";
  textLine(g, c.title, tx, y0 + 44, 36);
  if (c.role) {
    g.font = `500 16px ${sans}`;
    g.fillStyle = "#6f6a77";
    textLine(g, c.role, tx, y0 + 82, 20);
  }
  g.fillStyle = "rgba(23, 19, 31, 0.08)";
  g.fillRect(L, y0 + 116, R - L, 1);

  g.font = `400 20.5px ${sans}`;
  g.fillStyle = "#2a2632";
  lines(g, c.body, R - L, 5).forEach((t, k) => textLine(g, t, L, y0 + 130 + k * 29, 29));

  // facts: "Label|Value" rows
  c.chips.slice(0, 3).forEach((chip, k) => {
    const [label, value = ""] = chip.split("|");
    const top = y0 + 300 + k * 30;
    g.fillStyle = "rgba(23, 19, 31, 0.08)";
    g.fillRect(L, top, R - L, 1);
    g.letterSpacing = "0.84px";
    g.font = `600 14px ${sans}`;
    g.fillStyle = "#9a8f87";
    g.textAlign = "left";
    textLine(g, label.toUpperCase(), L, top, 30);
    g.letterSpacing = "0px";
    g.font = `600 19px ${sans}`;
    g.fillStyle = "#17131f";
    g.textAlign = "right";
    textLine(g, value, R, top, 30);
    g.textAlign = "left";
  });
  g.fillStyle = "rgba(23, 19, 31, 0.08)";
  g.fillRect(L, y0 + 390, R - L, 1);

  g.fillStyle = "#17131f";
  g.fillRect(x0, y0 + h - 40, w, 40);
  g.font = `600 16px ${sans}`;
  g.fillStyle = "#fff8f0";
  g.textAlign = "center";
  textLine(g, c.footer, x0 + w / 2, y0 + h - 40, 40);
  g.textAlign = "left";
}

export function paintBack(canvas: HTMLCanvasElement, img: HTMLImageElement | null, accent: string, dpr: number, about = false) {
  const W = CARD_W;
  const H = CARD_H;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const g = canvas.getContext("2d")!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  g.save();
  g.beginPath();
  g.roundRect(PAD, PAD, W - PAD * 2, H - PAD * 2, 20);
  g.clip();
  g.fillStyle = accent;
  g.fillRect(0, 0, W, H);
  if (img && !about) cover(g, img, 0, 0, W, H, false);
  else {
    // "about" back: warm paper with a tiled monogram and the big mark
    const serif = fontVar("--font-gilda", "Georgia, serif");
    const gr = g.createLinearGradient(0, 0, W, H);
    gr.addColorStop(0, "#fff3ea");
    gr.addColorStop(1, "#ffcfb8");
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
    g.fillStyle = "rgba(120,40,10,0.07)";
    g.font = `400 26px ${serif}`;
    for (let y = 30; y < H; y += 46) for (let x = (y / 46) % 2 ? 10 : 34; x < W; x += 48) g.fillText("CT", x, y);
    mark(g, W / 2 - 56, H / 2 - 56, 112);
  }
  g.restore();
}
