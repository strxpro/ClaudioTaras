// Localized cover shots for client sites that exist in several languages: the first desktop screen
// (d01) and the first phone screen (m01), per language, so the portfolio shows each site in the
// visitor's language. usage: node scripts/lang-shots.mjs [slug ...]
// Output: public/media/projects/<slug>/shots/<locale>/{d01,m01}.webp (getShots(p, locale) picks them up)
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

// how each site switches language: "auto" = follows the browser language, "path" = /<lang>
const SITES = {
  "carruleddhi-show": ["https://www.carruleddhishow.com", "auto"],
  "isola-del-gioiello": ["https://www.lisoladelgioiello.com/it", "path"],
  "villa-dea": ["https://www.villadeaaglientu.com", "auto"],
  spabinext: ["https://www.spabinext.com", "auto"],
};
const LOCALES = { en: "en-US", pl: "pl-PL", de: "de-DE", fr: "fr-FR", es: "es-ES" };
const DECLINE =
  /^(rifiuta|reject|decline|solo (necessari|essenziali|tecnici)|only (necessary|essential)|essenziali|odrzuć|ablehnen|alle ablehnen|refuser|tout refuser|rechazar)/i;
const SKIP = /^(skip|salta|überspringen|pomiń|passer|omitir|saltar)/i;
const toWebp = (src, dst, w) => sharp(src).resize({ width: w }).webp({ quality: 74 }).toFile(dst);

async function prep(page) {
  await page.waitForTimeout(5000);
  // intro films ("Skip" in any language) go first
  const skipped = await page
    .evaluate((re) => {
      const rx = new RegExp(re, "i");
      const b = [...document.querySelectorAll("button, [role=button]")].find((x) => rx.test((x.textContent || "").trim()));
      b?.click();
      return !!b;
    }, SKIP.source)
    .catch(() => false);
  if (skipped) await page.waitForTimeout(3000);
  for (const b of await page.$$("button, [role=button], a")) {
    const t = ((await b.innerText().catch(() => "")) || "").trim();
    if (t && DECLINE.test(t) && (await b.isVisible().catch(() => false))) {
      await b.click({ timeout: 1500 }).catch(() => {});
      break;
    }
  }
  await page
    .evaluate(() => {
      for (const el of document.querySelectorAll("body *")) {
        const cs = getComputedStyle(el);
        if ((cs.position === "fixed" || cs.position === "sticky") && /cookie|consent|gdpr/i.test(el.textContent || "") && (el.textContent || "").length < 900)
          el.style.setProperty("display", "none", "important");
      }
    })
    .catch(() => {});
  await page.waitForTimeout(800);
}

const only = process.argv.slice(2);
const browser = await chromium.launch({ args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] });
for (const [slug, [url, mode]] of Object.entries(SITES)) {
  if (only.length && !only.includes(slug)) continue;
  for (const [l, loc] of Object.entries(LOCALES)) {
    const out = path.resolve("public/media/projects", slug, "shots", l);
    const tmp = path.resolve(".capture/shots", slug, l);
    fs.mkdirSync(out, { recursive: true });
    fs.mkdirSync(tmp, { recursive: true });
    const target = mode === "path" ? `${url.replace(/\/it$/, "").replace(/\/$/, "")}/${l}` : url;
    for (const desktop of [true, false]) {
      const ctx = await browser.newContext({
        viewport: desktop ? { width: 1440, height: 900 } : { width: 390, height: 844 },
        deviceScaleFactor: desktop ? 1 : 2,
        isMobile: !desktop,
        hasTouch: !desktop,
        locale: loc,
        extraHTTPHeaders: { "Accept-Language": `${loc},${l};q=0.9` },
      });
      const page = await ctx.newPage();
      await page.goto(target, { waitUntil: "load", timeout: 90000 }).catch(() => {});
      await prep(page);
      const lang = await page.evaluate(() => document.documentElement.lang).catch(() => "?");
      const png = path.join(tmp, desktop ? "d01.png" : "m01.png");
      await page.screenshot({ path: png });
      await toWebp(png, path.join(out, desktop ? "d01.webp" : "m01.webp"), desktop ? 1440 : 780);
      console.log(slug, l, desktop ? "desktop" : "mobile", "html lang=" + lang);
      await ctx.close();
    }
  }
}
await browser.close();
