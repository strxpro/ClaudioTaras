// Records smooth scroll-through previews of each project (desktop + mobile)
// using a CDP screencast, then encodes lightweight WebM (VP9) + MP4 (H.264) + WebP posters.
//
// usage: node scripts/capture.mjs <slug> <url> [--seconds 12] [--only desktop|mobile] [--px 1100]
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const [slug, url] = args;
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i > -1 ? args[i + 1] : d;
};
const SECONDS = Number(opt("seconds", 12));
const ONLY = opt("only", "");
const PX_PER_S = Number(opt("px", 0));
const WAIT = Number(opt("wait", 6000));
const SCRIPT = opt("script", "");
const CRF = opt("crf", "");
const WHEEL = opt("wheel", "") === "1";
const OUT = path.resolve("public/media/projects", slug);
const TMP = path.resolve(".capture/frames", slug);
fs.mkdirSync(OUT, { recursive: true });

const ffmpeg = (a) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...a], { stdio: "inherit" });

const DECLINE = /^(rifiuta|rifiuto|reject|decline|deny|nur notwendige|solo (necessari|essenziali|tecnici)|only (necessary|essential)|(necessary|essential) only|essenziali|odrzuć|tylko niezbędne|refuser|rechazar)/i;
const CLOSE = /^(chiudi|close|✕|×|skip|salta|pomiń)$/i;

async function record(kind) {
  const desktop = kind === "desktop";
  const viewport = desktop ? { width: 1440, height: 900 } : { width: 390, height: 844 };
  const browser = await chromium.launch({ headless: process.env.HEADFUL ? false : true, args: ["--autoplay-policy=no-user-gesture-required", "--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11", "--enable-unsafe-swiftshader"] });
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: desktop ? 1 : 2,
    isMobile: !desktop && !WHEEL,
    hasTouch: !desktop && !WHEEL,
    locale: "it-IT",
    reducedMotion: "no-preference",
    userAgent: desktop
      ? undefined
      : "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "load", timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(WAIT);

  // Dismiss cookie banners (privacy-preserving choice first) and splash overlays.
  for (const re of [DECLINE, CLOSE]) {
    const buttons = await page.$$("button, [role=button], a");
    for (const b of buttons) {
      const t = ((await b.innerText().catch(() => "")) || "").trim();
      if (t && re.test(t) && (await b.isVisible().catch(() => false))) {
        await b.click({ timeout: 1500 }).catch(() => {});
        await page.waitForTimeout(600);
        break;
      }
    }
  }
  await page.addStyleTag({ content: "nextjs-portal,[data-nextjs-toast]{display:none!important}" }).catch(() => {});
  // Fallback: hide any leftover cookie layer (recording only) and unlock scrolling.
  await page.evaluate(() => {
    for (const el of document.querySelectorAll("body *")) {
      const cs = getComputedStyle(el);
      if ((cs.position === "fixed" || cs.position === "sticky") && /cookie|consent|gdpr/i.test(el.textContent || "") && (el.textContent || "").length < 900) {
        el.style.setProperty("display", "none", "important");
      }
    }
    document.documentElement.style.overflow = "";
    document.body.style.overflow = "";
  }).catch(() => {});
  await page.mouse.move(viewport.width / 2, viewport.height / 2);
  await page.waitForTimeout(1200);

  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const travel = Math.max(0, height - viewport.height);
  // Speed: cover a good chunk of the page but stay readable.
  const speed = PX_PER_S || Math.min(desktop ? 1150 : 900, Math.max(350, travel / SECONDS));

  const fdir = path.join(TMP, kind);
  fs.rmSync(fdir, { recursive: true, force: true });
  fs.mkdirSync(fdir, { recursive: true });
  const cdp = await ctx.newCDPSession(page);
  const frames = [];
  cdp.on("Page.screencastFrame", async (f) => {
    const file = path.join(fdir, `${String(frames.length).padStart(5, "0")}.jpg`);
    frames.push({ file, t: f.metadata.timestamp });
    fs.writeFileSync(file, Buffer.from(f.data, "base64"));
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality: 88,
    maxWidth: viewport.width * (desktop ? 1 : 2),
    maxHeight: viewport.height * (desktop ? 1 : 2),
    everyNthFrame: 1,
  });

  // 0.8s hold on the hero, then steady wheel scrolling.
  await page.waitForTimeout(800);
  const step = 16;
  const t0 = Date.now();
  if (SCRIPT) {
    const mod = await import(pathToFileURL(path.resolve(SCRIPT)).href);
    await mod.run(page, { desktop, seconds: SECONDS });
  } else if (!desktop && opt("touch", "") === "1") {
    // Real touch-scroll gesture for sites whose scroller ignores programmatic/wheel scrolling.
    await cdp.send("Input.synthesizeScrollGesture", {
      x: 195, y: 620, yDistance: -Math.round(speed * (SECONDS - 1)), speed: Math.round(speed),
      gestureSourceType: "touch", preventFling: true, repeatCount: 1,
    }).catch((e) => console.error("gesture", e.message));
  } else while (Date.now() - t0 < (SECONDS - 1) * 1000) {
    if (desktop || WHEEL) await page.mouse.wheel(0, (speed * step) / 1000);
    else {
      const moved = await page.evaluate((d) => {
        const y = window.scrollY;
        window.scrollBy(0, d);
        return window.scrollY !== y;
      }, (speed * step) / 1000);
      if (!moved) await page.mouse.wheel(0, (speed * step) / 1000);
    }
    await page.waitForTimeout(step);
  }
  await page.waitForTimeout(200);
  await cdp.send("Page.stopScreencast").catch(() => {});
  await page.waitForTimeout(300);
  await browser.close();

  if (frames.length < 10) throw new Error(`${kind}: too few frames (${frames.length})`);
  // concat list with real frame durations (variable frame rate → constant 30fps on encode)
  const list = frames
    .map((f, i) => {
      const next = frames[i + 1];
      const d = next ? Math.min(0.25, Math.max(0.005, next.t - f.t)) : 0.04;
      return `file '${f.file.replace(/\\/g, "/")}'\nduration ${d.toFixed(4)}`;
    })
    .join("\n");
  const listFile = path.join(fdir, "list.txt");
  fs.writeFileSync(listFile, list + `\nfile '${frames.at(-1).file.replace(/\\/g, "/")}'\n`);

  const w = desktop ? 1280 : 480;
  const vf = `scale=${w}:-2:flags=lanczos,fps=30,format=yuv420p`;
  const base = path.join(OUT, kind);
  ffmpeg(["-f", "concat", "-safe", "0", "-i", listFile, "-vf", vf, "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", CRF || (desktop ? "40" : "42"),
    "-row-mt", "1", "-deadline", "good", "-cpu-used", "2", "-an", `${base}.webm`]);
  ffmpeg(["-f", "concat", "-safe", "0", "-i", listFile, "-vf", vf, "-c:v", "libx264", "-preset", "slow", "-crf", desktop ? "29" : "30",
    "-profile:v", "high", "-movflags", "+faststart", "-an", `${base}.mp4`]);
  ffmpeg(["-i", frames[0].file, "-vf", `scale=${w}:-2:flags=lanczos`, "-quality", "78", `${base}-poster.webp`]);
  const sizes = ["webm", "mp4"].map((e) => `${e} ${(fs.statSync(`${base}.${e}`).size / 1024).toFixed(0)}KB`).join(", ");
  console.log(`${slug}/${kind}: ${frames.length} frames, page ${height}px → ${sizes}`);
}

for (const kind of ["desktop", "mobile"]) {
  if (ONLY && ONLY !== kind) continue;
  try {
    await record(kind);
  } catch (e) {
    console.error(`${slug}/${kind} FAILED:`, e.message);
  }
}
fs.rmSync(TMP, { recursive: true, force: true });
