import type { WarpCard } from "@/components/ui/warp-carousel";

type RGB = [number, number, number];
const hex = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = (c: RGB) => "#" + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");

/**
 * A 6×7 mesh for a card: a base colour lit by two soft glows (grid coordinates, column 0–5, row 0–6),
 * so every card gets the deep, painted gradient of the reference without hand-picking 42 colours.
 */
function mesh(base: string, a: string, ax: number, ay: number, b: string, bx: number, by: number, ra = 2.2, rb = 1.8): string[] {
  const B = hex(base);
  const A = hex(a);
  const C = hex(b);
  const out: string[] = [];
  for (let j = 0; j < 7; j++)
    for (let i = 0; i < 6; i++) {
      const wa = Math.exp(-((i - ax) ** 2 + (j - ay) ** 2) / (2 * ra * ra));
      const wb = Math.exp(-((i - bx) ** 2 + (j - by) ** 2) / (2 * rb * rb));
      const c = B.map((v, k) => v + (A[k] - v) * wa) as RGB;
      out.push(toHex(c.map((v, k) => v + (C[k] - v) * wb) as RGB));
    }
  return out;
}

export type StatCopy = { title: string; footer: string };

/** The four numbers on the ring: years, live projects, languages, reply time. Each has its 3D render (Blender). */
export function statCards(copy: StatCopy[], values: string[], since: number): WarpCard[] {
  const f = (k: number) => copy[k]?.footer.replace("{since}", String(since)) ?? "";
  const t = (k: number) => copy[k]?.title ?? "";
  return [
    {
      title: t(0),
      footer: f(0),
      value: values[0],
      image: "/stats/years.webp",
      mesh: mesh("#17131f", "#ff5a36", 5, 6.5, "#2b3550", 0, 0, 2.6, 2.2),
      numeral: ["#ffffff", "#ffc3b0"],
      glow: "#ff7a52",
    },
    {
      title: t(1),
      footer: f(1),
      value: values[1],
      image: "/stats/projects.webp",
      mesh: mesh("#13203a", "#6f9ad6", 0, 6, "#ff5a36", 6, -0.5, 2.6, 1.6),
      numeral: ["#ffffff", "#c9d8ec"],
      glow: "#7fa6d9",
    },
    {
      title: t(2),
      footer: f(2),
      value: values[2],
      image: "/stats/languages.webp",
      ink: "#17131f",
      mesh: mesh("#f4f1ec", "#d3dde9", 0, 0, "#ffd3c2", 5.5, 6.5, 2.8, 2.2),
      numeral: ["#17131f", "#ff5a36"],
      glow: "#b9c9dc",
    },
    {
      title: t(3),
      footer: f(3),
      value: values[3],
      unit: "h",
      image: "/stats/reply.webp",
      mesh: mesh("#ff5a36", "#ff9a6e", 0.5, 0.5, "#c9331a", 5.5, 6.5, 2.4, 2.4),
      numeral: ["#ffffff", "#fff1ea"],
      glow: "#ff6a44",
    },
  ];
}
