// Extra media for a project page:
//   1) the site's own logo — the logo element is isolated (everything else hidden, transparent
//      background) and saved as public/media/projects/<slug>/logo-raw.png (trimmed + toned by
//      scripts/logo_tone.py into logo-light.png / logo-dark.png)
//   2) sub-pages — internal links from the header/nav are visited and screenshotted
//      → shots/sNNa.webp (top) and sNNb.webp (one screen down, for long pages)
//
// usage: node scripts/case-extras.mjs <slug> <url> [--no-logo] [--no-pages] [--max 6]
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { unlock } from "./lib/gate.mjs";

const args = process.argv.slice(2);
const [slug, url] = args;
const has = (k) => args.includes(`--${k}`);
const opt = (k, d) => (args.indexOf(`--${k}`) > -1 ? args[args.indexOf(`--${k}`) + 1] : d);
const MAX = Number(opt("max", 6));
const OUT = path.resolve("public/media/projects", slug);
const SHOTS = path.join(OUT, "shots");
const TMP = path.resolve(".capture/extras", slug);
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });

const ff = (a) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...a], { stdio: "inherit" });
const DECLINE = /^(rifiuta|reject|decline|solo (necessari|essenziali|tecnici)|only (necessary|essential)|essenziali|odrzuć|refuser|rechazar|nega)/i;
const SKIP = /^(salta( intro)?|skip( intro)?|pomiń|continua|chiudi|close|×|✕)$/i;

async function tidy(page) {
  for (const b of await page.$$("button, [role=button], a")) {
    const t = ((await b.innerText().catch(() => "")) || "").trim();
    if (t && DECLINE.test(t) && (await b.isVisible().catch(() => false))) {
      await b.click({ timeout: 1500 }).catch(() => {});
      await page.waitForTimeout(600);
      break;
    }
  }
  for (let round = 0; round < 2; round++) {
    for (const b of await page.$$("button, [role=button], a")) {
      const t = ((await b.innerText().catch(() => "")) || "").trim();
      if (t && SKIP.test(t) && (await b.isVisible().catch(() => false))) {
        await b.click({ timeout: 1500 }).catch(() => {});
        await page.waitForTimeout(1200);
        break;
      }
    }
  }
  await page.addStyleTag({ content: "nextjs-portal,[data-nextjs-toast],astro-dev-toolbar{display:none!important}" }).catch(() => {});
  await page
    .evaluate(() => {
      for (const el of document.querySelectorAll("body *")) {
        const cs = getComputedStyle(el);
        if ((cs.position === "fixed" || cs.position === "sticky") && /cookie|consent|gdpr|privacy/i.test(el.textContent || "") && (el.textContent || "").length < 900) el.style.setProperty("display", "none", "important");
      }
    })
    .catch(() => {});
}

async function settle(page) {
  // trigger lazy content and scroll-reveals on the first screens, then come back up
  await page.evaluate(async () => {
    for (let y = 0; y < Math.min(document.documentElement.scrollHeight, innerHeight * 2.2); y += 240) {
      scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 70));
    }
    scrollTo(0, 0);
  }).catch(() => {});
  await page.waitForTimeout(1600);
}

const browser = await chromium.launch({ args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11", "--autoplay-policy=no-user-gesture-required"] });

// ---------- logo ----------
if (!has("no-logo")) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: "it-IT" });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "load", timeout: 120000 }).catch(() => {});
  await unlock(page);
  await page.waitForTimeout(6000);
  await tidy(page);
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(800);
  const box = await page.evaluate(() => {
    const vis = (el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05;
    };
    const hint = (el) => /logo|brand|wordmark/i.test(`${el.className?.baseVal ?? el.className} ${el.id} ${el.getAttribute("alt") || ""} ${el.getAttribute("src") || ""} ${el.getAttribute("aria-label") || ""}`);
    const HOME = "a[href='/'], a[href='./'], a[href='/it'], a[href='/it/'], a[href='/pl'], a[href='/en'], a[href='#top'], a[href='#hero']";
    const els = [...document.querySelectorAll(`header img, header svg, nav img, nav svg, [class*='logo' i], [id*='logo' i], [class*='brand' i], [class*='wordmark' i], a[href='/'] img, a[href='/'] svg, img[alt*='logo' i], img[src*='logo' i], ${HOME}`)];
    let best = null;
    for (const el of els) {
      if (!vis(el)) continue;
      // inner svgs of an icon set are not logos
      if (el.closest("button") && !hint(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.top > 320 || r.bottom < 0 || r.width < 36 || r.width > 520 || r.height < 16 || r.height > 220) continue;
      let score = 0;
      if (hint(el)) score += 5;
      // a home link in the header that holds an icon + wordmark is the whole lockup
      if (el.matches(HOME) && el.closest("header, nav") && (el.textContent || "").trim().length < 40) score += 6;
      if (el.closest("a[href='/'], a[href='./'], a[href$='/it'], a[href$='/it/'], a[href$='/en'], a[href$='/en/']")) score += 3;
      if (el.closest("header, nav")) score += 2;
      if (el.matches("img, svg")) score += 1;
      score -= r.top / 200;
      score += Math.min(r.width * r.height, 40000) / 40000;
      if (!best || score > best.score) best = { score, el };
    }
    if (!best) return null;
    // isolate: hide everything, show only the logo (visibility keeps the layout intact)
    const logo = best.el.matches("svg *") ? best.el.closest("svg") : best.el;
    logo.setAttribute("data-ct-logo", "");
    const st = document.createElement("style");
    st.textContent = `html,body{background:transparent!important}*{visibility:hidden!important;animation-play-state:paused!important}[data-ct-logo],[data-ct-logo] *{visibility:visible!important}`;
    document.head.appendChild(st);
    // ancestors with opacity / transforms still apply — make sure none fades it out
    for (let p = logo.parentElement; p; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (Number(cs.opacity) < 1) p.style.setProperty("opacity", "1", "important");
    }
    const r = logo.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height, tag: logo.tagName, cls: String(logo.className?.baseVal ?? logo.className).slice(0, 80) };
  });
  if (box) {
    const pad = 6;
    const clip = { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: box.w + pad * 2, height: box.h + pad * 2 };
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, "logo-raw.png"), clip, omitBackground: true });
    console.log(`[${slug}] logo ${box.tag}.${box.cls} ${Math.round(box.w)}x${Math.round(box.h)}`);
  } else console.log(`[${slug}] logo: not found`);
  await ctx.close();
}

// ---------- sub-pages ----------
if (!has("no-pages")) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: "it-IT" });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "load", timeout: 120000 }).catch(() => {});
  await unlock(page);
  await page.waitForTimeout(5000);
  await tidy(page);
  const links = await page.evaluate((MAX) => {
    const home = new URL(location.href);
    const host = (h) => h.replace(/^www\./, "");
    const LANGS = /^\/(en|it|de|fr|es|pl|nl|ru|zh|ja)(\/|$)/i;
    const homeLang = home.pathname.match(LANGS)?.[1]?.toLowerCase();
    const seen = new Set([home.pathname.replace(/\/$/, "") || "/"]);
    const out = [];
    for (const a of document.querySelectorAll("header a[href], nav a[href], [class*='menu' i] a[href]")) {
      let u;
      try {
        u = new URL(a.getAttribute("href"), location.href);
      } catch {
        continue;
      }
      if (!/^https?:$/.test(u.protocol) || host(u.hostname) !== host(home.hostname)) continue;
      if (/\.(pdf|jpe?g|png|webp|zip|docx?)$/i.test(u.pathname)) continue;
      const p = u.pathname.replace(/\/$/, "") || "/";
      const lang = p.match(LANGS)?.[1]?.toLowerCase();
      if (homeLang ? lang !== homeLang : lang) continue;
      if (seen.has(p)) continue;
      seen.add(p);
      out.push(u.origin + u.pathname + u.search);
      if (out.length >= MAX) break;
    }
    return out;
  }, MAX);
  console.log(`[${slug}] sub-pages: ${links.length}`, links);
  // drop previous sub-page shots
  for (const f of fs.readdirSync(SHOTS)) if (f.startsWith("s")) fs.rmSync(path.join(SHOTS, f));
  let n = 0;
  for (const link of links) {
    n++;
    await page.goto(link, { waitUntil: "load", timeout: 90000 }).catch(() => {});
    await unlock(page);
    await page.waitForTimeout(3500);
    await tidy(page);
    await settle(page);
    const id = `s${String(n).padStart(2, "0")}`;
    const tmp = path.join(TMP, `${id}.png`);
    await page.screenshot({ path: tmp });
    ff(["-i", tmp, "-vf", "scale=1440:-2:flags=lanczos", "-quality", "76", path.join(SHOTS, `${id}a.webp`)]);
    const tall = await page.evaluate(() => document.documentElement.scrollHeight > innerHeight * 2.2);
    if (tall) {
      await page.evaluate(async () => {
        const to = innerHeight * 1.05;
        for (let y = 0; y <= to; y += 120) {
          scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 40));
        }
      });
      await page.waitForTimeout(1800);
      await page.screenshot({ path: tmp });
      ff(["-i", tmp, "-vf", "scale=1440:-2:flags=lanczos", "-quality", "76", path.join(SHOTS, `${id}b.webp`)]);
    }
  }
  await ctx.close();
}

// ---------- states: the mobile menu opened (→ shots/m90.webp, last in the phone group) ----------
if (!has("no-states")) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "it-IT", isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "load", timeout: 120000 }).catch(() => {});
  await unlock(page);
  await page.waitForTimeout(5000);
  await tidy(page);
  const opened = await page.evaluate(() => {
    const cands = [...document.querySelectorAll("button, [role=button], a[href='#'], [class*='burger' i], [class*='hamburger' i], [class*='menu-toggle' i]")].filter((el) => {
      const r = el.getBoundingClientRect();
      const label = `${el.getAttribute("aria-label") || ""} ${el.className?.baseVal ?? el.className} ${el.textContent || ""}`;
      return r.top < 140 && r.width > 16 && r.width < 200 && /menu|menù|nav|burger|hamburger|apri|open/i.test(label) && !/close|chiudi|zamknij/i.test(label);
    });
    if (!cands.length) return false;
    cands[0].click();
    return true;
  });
  if (opened) {
    await page.waitForTimeout(1400);
    const tmp = path.join(TMP, "m-menu.png");
    await page.screenshot({ path: tmp });
    ff(["-i", tmp, "-vf", "scale=780:-2:flags=lanczos", "-quality", "76", path.join(SHOTS, "m90.webp")]);
    console.log(`[${slug}] mobile menu captured`);
  } else console.log(`[${slug}] mobile menu: no toggle found`);
  await ctx.close();
}

await browser.close();
