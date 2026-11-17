// Screenshots of each main view of the Lumo desktop app (no scrolling page → click through tabs).
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
const OUT = path.resolve("public/media/projects/lumo/shots");
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const tmp = path.resolve(".capture/lumo.png");
const browser = await chromium.launch({ args: ["--enable-gpu", "--use-angle=d3d11"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://127.0.0.1:8000", { waitUntil: "load" });
await page.waitForTimeout(4000);
await page.getByText(/^Zamknij$/).first().click({ timeout: 2000 }).catch(() => {});
const tabs = await page.$$eval("button, [role=tab]", (els) => els.map((e) => e.textContent?.trim()).filter((t) => t && t.length < 20));
console.log("tabs:", tabs.join(" | "));
let n = 0;
const snap = async () => {
  await page.waitForTimeout(1500);
  await page.screenshot({ path: tmp });
  n++;
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", tmp, "-quality", "74", path.join(OUT, `d${String(n).padStart(2, "0")}.webp`)]);
};
await snap();
for (const name of ["Scena", "Mikser", "Muzyka", "Ustawienia", "Zaawansowane", "Sceny świateł"]) {
  const el = page.getByText(new RegExp(name)).first();
  if (await el.isVisible().catch(() => false)) {
    await el.click({ timeout: 2000 }).catch(() => {});
    await snap();
  }
}
await page.setViewportSize({ width: 390, height: 844 });
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(3000);
await page.getByText(/^Zamknij$/).first().click({ timeout: 2000 }).catch(() => {});
await page.waitForTimeout(1200);
await page.screenshot({ path: tmp });
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", tmp, "-quality", "74", path.join(OUT, "m01.webp")]);
await browser.close();
console.log("lumo shots:", n);
