// The project's accent colour. The page's own buttons/links come first (analyze.mjs); when a site has
// none that read as a colour (dark-brown buttons, a cream theme-color, …) the colour comes from the
// first screenshot instead: the strongest saturated hue on screen (Favola → the honey in the jar).
import sharp from "sharp";

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** A colour that works as a portfolio accent: not grey, not near-white, not near-black. */
export function usableAccent(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex ?? "")) return false;
  const [r, g, b] = rgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const light = (max + min) / 2 / 255;
  return max - min >= 60 && max >= 70 && light <= 0.82;
}

const toHex = (c) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

/** Dominant saturated colour of a screenshot, or null when the picture is (almost) colourless. */
export async function accentFromShot(file) {
  const { data, info } = await sharp(file).resize(120, 75, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const bins = Array.from({ length: 24 }, () => ({ n: 0, w: 0, r: 0, g: 0, b: 0 }));
  let total = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const max = Math.max(r, g, b) / 255;
    const min = Math.min(r, g, b) / 255;
    const l = (max + min) / 2;
    const d = max - min;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    total++;
    if (s < 0.4 || l < 0.18 || l > 0.78 || d < 0.2) continue;
    let h;
    if (max === r / 255) h = ((g - b) / 255 / d) % 6;
    else if (max === g / 255) h = (b - r) / 255 / d + 2;
    else h = (r - g) / 255 / d + 4;
    const bin = bins[Math.floor((((h * 60) % 360) + 360) % 360 / 15)];
    const w = s * d; // vivid pixels count more
    bin.n++;
    bin.w += w;
    bin.r += r * w;
    bin.g += g * w;
    bin.b += b * w;
  }
  const best = bins.reduce((a, x) => (x.w > a.w ? x : a), bins[0]);
  // at least 1% of the screen in that hue (a product photo is enough; a stray icon is not)
  if (best.n < total * 0.01) return null;
  const hex = toHex([best.r / best.w, best.g / best.w, best.b / best.w]);
  return usableAccent(hex) ? hex : null;
}
