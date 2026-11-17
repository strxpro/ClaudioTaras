// Appends single-viewport screenshots (e.g. admin panels, kitchen screens) to a project's shots folder.
// usage: node scripts/extra-shots.mjs <slug> <url> [url ...]
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
const [slug, ...urls] = process.argv.slice(2);
const OUT = path.resolve("public/media/projects", slug, "shots");
fs.mkdirSync(OUT, { recursive: true });
let n = fs.readdirSync(OUT).filter((f) => f.startsWith("e")).length;
const tmp = path.resolve(".capture/extra.png");
const browser = await chromium.launch({ args: ["--enable-gpu", "--use-angle=d3d11"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "it-IT" });
for (const u of urls) {
  await page.goto(u, { waitUntil: "load", timeout: 120000 }).catch(() => {});
  await page.addStyleTag({ content: "nextjs-portal,[data-nextjs-toast],astro-dev-toolbar{display:none!important}" }).catch(() => {});
  await page.waitForTimeout(4500);
  await page.screenshot({ path: tmp });
  n++;
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", tmp, "-quality", "74", path.join(OUT, `e${String(n).padStart(2, "0")}.webp`)]);
  console.log(slug, u, "→", `e${String(n).padStart(2, "0")}`);
}
await browser.close();
