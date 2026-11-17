// Collects title / description / headings / visible text from each live project.
import { chromium } from "playwright";
import fs from "node:fs";

const urls = process.argv.slice(2);
const out = {};
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "en-US" });
for (const url of urls) {
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(4000);
    out[url] = await page.evaluate(() => ({
      finalUrl: location.href,
      title: document.title,
      description: document.querySelector('meta[name="description"]')?.content ?? "",
      lang: document.documentElement.lang,
      headings: [...document.querySelectorAll("h1,h2,h3")].map((h) => h.innerText.trim()).filter(Boolean).slice(0, 40),
      text: document.body.innerText.replace(/\s+/g, " ").slice(0, 2500),
      generator: document.querySelector('meta[name="generator"]')?.content ?? "",
      scripts: [...document.scripts].map((s) => s.src).filter(Boolean).slice(0, 25),
      inputs: [...document.querySelectorAll("input")].map((i) => i.type).slice(0, 10),
      height: document.documentElement.scrollHeight,
    }));
  } catch (e) {
    out[url] = { error: String(e) };
  }
  await page.close();
}
await browser.close();
fs.writeFileSync(process.env.OUT ?? "recon.json", JSON.stringify(out, null, 2));
console.log("done");
