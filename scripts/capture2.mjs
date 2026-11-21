// Smooth, section-by-section recordings + screenshots of each meaningful section.
// For every project: finds the page's real sections, then
//   1) records a CDP screencast that glides (eased) from section to section, pausing on each,
//   2) takes one clean screenshot per section (deduplicated, blank frames skipped).
// Output: public/media/projects/<slug>/{desktop,mobile}.{webm,mp4}, *-poster.webp, shots/{d,m}NN.webp
//
// usage: node scripts/capture2.mjs <slug> <url> [--only desktop|mobile] [--no-video] [--no-shots] [--max 8]
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { unlock } from "./lib/gate.mjs";

const args = process.argv.slice(2);
const [slug, url] = args;
const has = (k) => args.includes(`--${k}`);
const opt = (k, d) => (args.indexOf(`--${k}`) > -1 ? args[args.indexOf(`--${k}`) + 1] : d);
const ONLY = opt("only", "");
const MAX = Number(opt("max", 8));
const OUT = path.resolve("public/media/projects", slug);
const SHOTS = path.join(OUT, "shots");
const TMP = path.resolve(".capture/frames2", slug);
fs.mkdirSync(SHOTS, { recursive: true });

const ff = (a) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...a], { stdio: "inherit" });
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2); // easeInOutCubic
const DECLINE = /^(rifiuta|reject|decline|solo (necessari|essenziali|tecnici)|only (necessary|essential)|essenziali|odrzuć|refuser|rechazar)/i;
const SKIP = /^(salta( intro)?|skip( intro)?|pomiń|continua|chiudi|close|×|✕)$/i; // intro overlays / splash videos

async function open(kind) {
  const desktop = kind === "desktop";
  const viewport = desktop ? { width: 1440, height: 900 } : { width: 390, height: 844 };
  const browser = await chromium.launch({ args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11", "--autoplay-policy=no-user-gesture-required"] });
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: desktop ? 1 : 2, locale: "it-IT" });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "load", timeout: 120000 }).catch(() => {});
  if (await unlock(page)) await page.waitForTimeout(1500);
  await page.waitForTimeout(7000);
  for (const b of await page.$$("button, [role=button], a")) {
    const t = ((await b.innerText().catch(() => "")) || "").trim();
    if (t && DECLINE.test(t) && (await b.isVisible().catch(() => false))) {
      await b.click({ timeout: 1500 }).catch(() => {});
      break;
    }
  }
  for (let round = 0; round < 2; round++) {
    for (const b of await page.$$("button, [role=button], a")) {
      const t = ((await b.innerText().catch(() => "")) || "").trim();
      if (t && SKIP.test(t) && (await b.isVisible().catch(() => false))) {
        await b.click({ timeout: 1500 }).catch(() => {});
        await page.waitForTimeout(1500);
        break;
      }
    }
  }
  await page.addStyleTag({ content: "nextjs-portal,[data-nextjs-toast],astro-dev-toolbar{display:none!important}" }).catch(() => {});
  await page.evaluate(() => {
    for (const el of document.querySelectorAll("body *")) {
      const cs = getComputedStyle(el);
      if ((cs.position === "fixed" || cs.position === "sticky") && /cookie|consent|gdpr/i.test(el.textContent || "") && (el.textContent || "").length < 900) el.style.setProperty("display", "none", "important");
    }
  }).catch(() => {});
  await page.mouse.move(viewport.width / 2, viewport.height / 2);
  await page.waitForTimeout(800);
  return { browser, ctx, page, viewport, desktop };
}

/** Scroll positions of the page's real sections (deduplicated, capped). */
async function sectionStops(page, vh) {
  const { tops, max } = await page.evaluate(() => {
    const els = [...document.querySelectorAll("section, footer, main > div, [class*='section'], [id]")];
    const tops = els
      .map((e) => {
        const r = e.getBoundingClientRect();
        return { y: Math.round(r.top + scrollY), h: r.height, w: r.width };
      })
      .filter((r) => r.h > 280 && r.w > innerWidth * 0.6)
      .map((r) => r.y);
    return { tops, max: document.documentElement.scrollHeight - innerHeight };
  });
  const sorted = [...new Set(tops.map((t) => Math.max(0, Math.min(max, t))))].sort((a, b) => a - b);
  const stops = [0];
  for (const t of sorted) if (t - stops[stops.length - 1] > vh * 0.75) stops.push(t);
  if (max - stops[stops.length - 1] > vh * 0.5) stops.push(max);
  if (stops.length <= MAX) return stops;
  // keep first/last, sample the rest evenly
  const out = [stops[0]];
  for (let i = 1; i < MAX - 1; i++) out.push(stops[Math.round((i * (stops.length - 1)) / (MAX - 1))]);
  out.push(stops[stops.length - 1]);
  return [...new Set(out)];
}

/** Eased wheel glide from the current position to `to` (works with Lenis/Locomotive-style scrollers). */
async function glide(page, from, to, ms) {
  const before = await page.evaluate(() => scrollY).catch(() => 0);
  await glideWheel(page, from, to, ms);
  const after = await page.evaluate(() => scrollY).catch(() => 0);
  // some pages ignore wheel events (custom scrollers / locked body) — fall back to scrollTo
  if (Math.abs(to - from) > 50 && Math.abs(after - before) < 5) {
    await page.evaluate((y) => {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
      window.scrollTo({ top: y, behavior: "smooth" });
    }, to).catch(() => {});
    await page.waitForTimeout(ms);
  }
}

async function glideWheel(page, from, to, ms) {
  const steps = Math.max(10, Math.round(ms / 16));
  let sent = 0;
  for (let i = 1; i <= steps; i++) {
    const target = (to - from) * ease(i / steps);
    const d = target - sent;
    sent = target;
    if (Math.abs(d) > 0.5) await page.mouse.wheel(0, d);
    await page.waitForTimeout(16);
  }
}

async function video(kind) {
  const s = await open(kind);
  const { page, ctx, browser, viewport, desktop } = s;
  const stops = await sectionStops(page, viewport.height);
  const fdir = path.join(TMP, kind);
  fs.rmSync(fdir, { recursive: true, force: true });
  fs.mkdirSync(fdir, { recursive: true });
  const cdp = await ctx.newCDPSession(page);
  const frames = [];
  cdp.on("Page.screencastFrame", (f) => {
    const file = path.join(fdir, `${String(frames.length).padStart(5, "0")}.jpg`);
    frames.push({ file, t: f.metadata.timestamp });
    fs.writeFileSync(file, Buffer.from(f.data, "base64"));
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 88, maxWidth: viewport.width * (desktop ? 1 : 2), maxHeight: viewport.height * (desktop ? 1 : 2), everyNthFrame: 1 });
  await page.waitForTimeout(1400);
  let cur = 0;
  for (const y of stops.slice(1)) {
    const dist = Math.abs(y - cur);
    await glide(page, cur, y, Math.min(1700, 650 + dist * 0.55));
    cur = y;
    await page.waitForTimeout(1150);
  }
  await cdp.send("Page.stopScreencast").catch(() => {});
  await page.waitForTimeout(300);
  await browser.close();
  if (frames.length < 20) throw new Error(`${kind}: too few frames`);
  const list = frames.map((f, i) => `file '${f.file.replace(/\\/g, "/")}'\nduration ${Math.min(0.25, Math.max(0.005, (frames[i + 1]?.t ?? f.t + 0.04) - f.t)).toFixed(4)}`).join("\n");
  const listFile = path.join(fdir, "list.txt");
  fs.writeFileSync(listFile, `${list}\nfile '${frames.at(-1).file.replace(/\\/g, "/")}'\n`);
  const w = desktop ? 1280 : 480;
  const vf = `scale=${w}:-2:flags=lanczos,fps=30,format=yuv420p`;
  const base = path.join(OUT, kind);
  ff(["-f", "concat", "-safe", "0", "-i", listFile, "-vf", vf, "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", desktop ? "41" : "43", "-row-mt", "1", "-deadline", "good", "-cpu-used", "2", "-an", `${base}.webm`]);
  ff(["-f", "concat", "-safe", "0", "-i", listFile, "-vf", vf, "-c:v", "libx264", "-preset", "slow", "-crf", desktop ? "29" : "30", "-movflags", "+faststart", "-an", `${base}.mp4`]);
  // poster: a frame from the first pause (after the intro settles), not a loading frame
  const posterFrame = frames[Math.min(frames.length - 1, Math.round(frames.length * 0.04))].file;
  ff(["-i", posterFrame, "-vf", `scale=${w}:-2:flags=lanczos`, "-quality", "78", `${base}-poster.webp`]);
  console.log(`${slug}/${kind}: ${stops.length} sections, ${frames.length} frames, ${(fs.statSync(`${base}.webm`).size / 1024).toFixed(0)}KB webm`);
}

async function shots(kind) {
  const s = await open(kind);
  const { page, browser, viewport, desktop } = s;
  const stops = await sectionStops(page, viewport.height);
  const prefix = desktop ? "d" : "m";
  // files only: the shots/<locale>/ folders of lang-shots.mjs start with letters too ("de" is not a desktop shot)
  const own = new RegExp(`^${prefix}\\d+\\.webp$`);
  for (const f of fs.readdirSync(SHOTS)) if (own.test(f)) fs.rmSync(path.join(SHOTS, f));
  const tmp = path.join(TMP, `shot-${kind}.png`);
  fs.mkdirSync(TMP, { recursive: true });
  let cur = 0;
  let n = 0;
  let lastSize = -1;
  for (const y of stops) {
    if (y !== cur) await glide(page, cur, y, 700);
    cur = y;
    await page.waitForTimeout(1600);
    await page.screenshot({ path: tmp });
    const size = fs.statSync(tmp).size;
    // skip near-duplicates and almost-empty frames (tiny PNGs are flat colour)
    if (size < (desktop ? 60000 : 90000) || (lastSize > 0 && Math.abs(size - lastSize) / lastSize < 0.012)) continue;
    lastSize = size;
    n++;
    ff(["-i", tmp, "-vf", `scale=${desktop ? 1440 : 780}:-2:flags=lanczos`, "-quality", "76", path.join(SHOTS, `${prefix}${String(n).padStart(2, "0")}.webp`)]);
  }
  await browser.close();
  console.log(`${slug}/${kind}: ${n} section shots`);
}

for (const kind of ["desktop", "mobile"]) {
  if (ONLY && ONLY !== kind) continue;
  if (!has("no-video")) await video(kind).catch((e) => console.error(`${slug}/${kind} video FAILED`, e.message));
  if (!has("no-shots")) await shots(kind).catch((e) => console.error(`${slug}/${kind} shots FAILED`, e.message));
}
fs.rmSync(TMP, { recursive: true, force: true });
