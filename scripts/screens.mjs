// Takes a set of viewport screenshots of a project (desktop sections, mobile, extra pages like admin).
// usage: node scripts/screens.mjs <slug> <url> [extraUrl ...]
// Output: public/media/projects/<slug>/shots/{d01..,m01..,x01..}.webp
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const [slug, url, ...extra] = process.argv.slice(2);
const OUT = path.resolve("public/media/projects", slug, "shots");
const TMP = path.resolve(".capture/shots", slug);
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });

const DECLINE = /^(rifiuta|reject|decline|solo (necessari|essenziali|tecnici)|only (necessary|essential)|essenziali|odrzuć|refuser|rechazar)/i;

const toWebp = (src, dst, w) =>
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", src, "-vf", `scale=${w}:-2:flags=lanczos`, "-quality", "74", dst]);

async function prep(page) {
  await page.waitForTimeout(5000);
  for (const b of await page.$$("button, [role=button], a")) {
    const t = ((await b.innerText().catch(() => "")) || "").trim();
    if (t && DECLINE.test(t) && (await b.isVisible().catch(() => false))) {
      await b.click({ timeout: 1500 }).catch(() => {});
      break;
    }
  }
  await page.addStyleTag({ content: "nextjs-portal,[data-nextjs-toast],#__next-build-watcher{display:none!important}" }).catch(() => {});
  await page.evaluate(() => {
    for (const el of document.querySelectorAll("body *")) {
      const cs = getComputedStyle(el);
      if ((cs.position === "fixed" || cs.position === "sticky") && /cookie|consent|gdpr/i.test(el.textContent || "") && (el.textContent || "").length < 900)
        el.style.setProperty("display", "none", "important");
    }
  }).catch(() => {});
  await page.waitForTimeout(800);
}

async function shots(kind, target, count, prefix) {
  const desktop = kind === "desktop";
  const browser = await chromium.launch({ args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] });
  const ctx = await browser.newContext({
    viewport: desktop ? { width: 1440, height: 900 } : { width: 390, height: 844 },
    deviceScaleFactor: desktop ? 1 : 2,
    locale: "it-IT",
  });
  const page = await ctx.newPage();
  await page.goto(target, { waitUntil: "load", timeout: 90000 }).catch(() => {});
  await prep(page);
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  const vh = desktop ? 900 : 844;
  const max = Math.max(0, h - vh);
  const stops = count === 1 ? [0] : Array.from({ length: count }, (_, i) => Math.round((max * i) / (count - 1) * 0.92));
  let current = 0;
  let n = 0;
  for (const y of stops) {
    // wheel so smooth-scroll libraries and scroll-triggered animations behave naturally
    let delta = y - current;
    while (Math.abs(delta) > 0) {
      const d = Math.sign(delta) * Math.min(Math.abs(delta), 400);
      await page.mouse.move(desktop ? 720 : 195, desktop ? 450 : 420);
      await page.mouse.wheel(0, d);
      delta -= d;
      await page.waitForTimeout(60);
    }
    current = y;
    await page.waitForTimeout(1600);
    const tmp = path.join(TMP, `${prefix}${n}.png`);
    await page.screenshot({ path: tmp });
    n++;
    toWebp(tmp, path.join(OUT, `${prefix}${String(n).padStart(2, "0")}.webp`), desktop ? 1440 : 780);
  }
  await browser.close();
  return n;
}

const d = await shots("desktop", url, 6, "d").catch((e) => (console.error("desktop", e.message), 0));
const m = await shots("mobile", url, 3, "m").catch((e) => (console.error("mobile", e.message), 0));
let x = 0;
for (const u of extra) x += await shots("desktop", u, 1, `x${x}`).then(() => 1).catch(() => 0);
// normalise extra names x01.. (shots() numbers per call)
const files = fs.readdirSync(OUT).filter((f) => f.startsWith("x")).sort();
files.forEach((f, i) => fs.renameSync(path.join(OUT, f), path.join(OUT, `e${String(i + 1).padStart(2, "0")}.webp`)));
fs.rmSync(TMP, { recursive: true, force: true });
console.log(`${slug}: ${d} desktop, ${m} mobile, ${files.length} extra`);
