// Imported first by the worker: project root as cwd + the keys from .env.local, before any other module
// reads process.env (ES modules run their imports in order).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
process.chdir(ROOT);
const envFile = path.join(ROOT, ".env.local");
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

// every script the worker starts needs these: Playwright's browsers live on F: (C: is nearly full) and
// .capture/bin holds ffmpeg
const browsers = path.join(ROOT, ".capture", "ms-playwright");
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync(browsers)) process.env.PLAYWRIGHT_BROWSERS_PATH = browsers;
const bin = path.join(ROOT, ".capture", "bin");
const PATH_KEY = Object.keys(process.env).find((k) => k.toUpperCase() === "PATH") ?? "PATH";
if (fs.existsSync(bin) && !(process.env[PATH_KEY] ?? "").includes(bin)) process.env[PATH_KEY] = `${bin}${path.delimiter}${process.env[PATH_KEY] ?? ""}`;

export const DATA = path.join(ROOT, ".data");
fs.mkdirSync(DATA, { recursive: true });

/** The public site: where the bot's links point and where the worker checks that Vercel published. */
export const SITE = (
  process.env.WORKER_SITE_URL ||
  (/^https:\/\//.test(process.env.NEXT_PUBLIC_SITE_URL ?? "") ? process.env.NEXT_PUBLIC_SITE_URL : "") ||
  "https://www.claudiotaras.com"
).replace(/\/$/, "");

const LOG = path.join(DATA, "worker.log");
export function log(...parts) {
  const line = `${new Date().toLocaleString("sv-SE").slice(0, 19)}  ${parts.join(" ")}`;
  console.log(line);
  try {
    if (fs.existsSync(LOG) && fs.statSync(LOG).size > 2_000_000) fs.renameSync(LOG, `${LOG}.old`);
    fs.appendFileSync(LOG, `${line}\n`);
  } catch {}
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
