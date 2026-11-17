/** Returns true when dark (ink) text has better contrast than light (bone) text on `hex`. */
export function isLight(hex: string): boolean {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.padEnd(6, "0");
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const vsInk = (L + 0.05) / (0.0045 + 0.05);
  const vsBone = (0.95 + 0.05) / (L + 0.05);
  return vsInk >= vsBone;
}
