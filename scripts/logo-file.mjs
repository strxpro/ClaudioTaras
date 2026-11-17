// Render a site's logo file (svg/png) on a transparent page -> public/media/projects/<slug>/logo-raw.png
// (then run scripts/logo_tone.py <slug>). SVGs are rendered at 200 px tall, rasters at native size.
// usage: node scripts/logo-file.mjs <slug> <logo-url>
import { chromium } from "playwright";
import path from "node:path";

const [slug, src] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1600, height: 600 }, deviceScaleFactor: 2 })).newPage();
const svg = /\.svg(\?|$)/i.test(src);
await page.setContent(`<html><body style="margin:0;background:transparent"><img id="l" src="${src}" style="display:block;${svg ? "height:200px;width:auto" : ""}"></body></html>`);
await page.waitForFunction(() => document.getElementById("l").complete, null, { timeout: 30000 });
if (!svg) await page.evaluate(() => { const i = document.getElementById("l"); i.style.width = `${i.naturalWidth / 2}px`; });
await page.locator("#l").screenshot({ path: path.resolve("public/media/projects", slug, "logo-raw.png"), omitBackground: true });
console.log(`[${slug}] rendered ${src}`);
await browser.close();
