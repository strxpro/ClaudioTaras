// One import job, started by the admin panel (src/app/admin/import-actions.ts):
//   node scripts/import/run.mjs .data/jobs/<id>.json
// Source = a website URL or a local project folder. Steps: start the project (folders) → analyse →
// record video + section shots (capture2) → logo, sub-pages, mobile menu (case-extras) → clips +
// logo tone → copy in 6 languages (AI or templates) → optional free-domain deploy. Progress goes to
// the job file after every step; the panel turns the finished job into a project.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { accentFromShot } from "./accent.mjs";
import { analyze } from "./analyze.mjs";
import { deployFolder } from "./deploy.mjs";
import { inspectFolder, startFolder } from "./source.mjs";
import { categorize, writeCopy } from "./write.mjs";

const ROOT = process.cwd();
const jobFile = path.resolve(process.argv[2]);
const job = JSON.parse(fs.readFileSync(jobFile, "utf8"));
const TMP = path.join(ROOT, ".capture", "tmp");
fs.mkdirSync(TMP, { recursive: true });
// project-local tools first: .capture/bin holds ffmpeg (video/shots/clips need it) and cloudflared;
// browsers live in .capture/ms-playwright (the C: drive is nearly full)
const BIN = path.join(ROOT, ".capture", "bin");
const BROWSERS = path.join(ROOT, ".capture", "ms-playwright");
const ENV = {
  ...process.env,
  TMP,
  TEMP: TMP,
  PYTHONIOENCODING: "utf-8",
  ...(process.env.PLAYWRIGHT_BROWSERS_PATH || !fs.existsSync(BROWSERS) ? {} : { PLAYWRIGHT_BROWSERS_PATH: BROWSERS }),
};
// (Windows spells it "Path": extend whichever key exists, never add a second one)
const PATH_KEY = Object.keys(ENV).find((k) => k.toUpperCase() === "PATH") ?? "PATH";
if (fs.existsSync(BIN)) ENV[PATH_KEY] = `${BIN}${path.delimiter}${ENV[PATH_KEY] ?? ""}`;
const PY = fs.existsSync(path.join(ROOT, ".capture", "pyenv", "Scripts", "python.exe")) ? path.join(ROOT, ".capture", "pyenv", "Scripts", "python.exe") : "python";

const save = () => {
  const tmp = `${jobFile}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(job, null, 2));
  fs.renameSync(tmp, jobFile);
};
const log = (line) => {
  const s = String(line).trim();
  if (!s) return;
  job.log = [...(job.log ?? []), `${new Date().toLocaleTimeString("pl-PL")}  ${s}`].slice(-60);
  save();
};
const step = (key, status, note) => {
  const st = job.steps.find((x) => x.key === key);
  if (st) Object.assign(st, { status, ...(note !== undefined ? { note } : {}) });
  save();
};
const run = (cmd, args, key) =>
  new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: ROOT, env: ENV, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    const on = (b) => b.toString().split(/\r?\n/).forEach((l) => l.trim() && log(`${key}: ${l.trim().slice(0, 180)}`));
    child.stdout.on("data", on);
    child.stderr.on("data", on);
    child.on("exit", (code) => resolve(code ?? 1));
  });

const slugify = (s) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50) || `projekt-${Date.now().toString(36)}`;

let server = null;
const finish = async (status, error) => {
  if (server) await server.stop().catch(() => {});
  server = null;
  job.status = status;
  if (error) job.error = error;
  job.finishedAt = new Date().toISOString();
  save();
  // tell the site we're done: it saves the project and pings Telegram, even with the panel closed
  if (process.env.IMPORT_CALLBACK_URL) {
    await fetch(process.env.IMPORT_CALLBACK_URL, { method: "POST", headers: { "x-import-secret": process.env.IMPORT_SECRET ?? "" }, signal: AbortSignal.timeout(60000) }).catch(() => {});
  }
};
process.on("SIGTERM", () => finish("cancelled").then(() => process.exit(0)));

try {
  job.status = "running";
  job.pid = process.pid;
  save();

  // ---- 1. source
  const src = job.source.trim();
  const isUrl = /^https?:\/\//i.test(src);
  const isLocalUrl = isUrl && /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|[a-z0-9-]+\.(localhost|test))(:\d+)?/i.test(src);
  let url = src;
  let folder = null;
  step("source", "running");
  if (!isUrl) {
    if (!fs.existsSync(src) || !fs.statSync(src).isDirectory()) throw new Error(`Nie ma takiego folderu: ${src}`);
    folder = inspectFolder(src);
    log(`Folder: ${folder.kind}${folder.framework ? ` (${folder.framework})` : ""} · ${folder.stack.join(", ") || "brak rozpoznanych technologii"}`);
    server = await startFolder(src, folder, log);
    url = server.url;
  }
  step("source", "done", isUrl ? url : `${folder.kind} → ${url}`);

  // ---- 2. analysis
  step("analyze", "running");
  const facts = await analyze(url, { local: !isUrl || isLocalUrl });
  if (folder) {
    facts.stack = [...new Set([...folder.stack, ...facts.stack.filter((s) => !["Vercel", "Netlify", "Cloudflare", "React"].includes(s) || folder.stack.includes(s))])];
    facts.readme = folder.readme;
    if (folder.hasAdmin && !facts.features.includes("admin")) facts.features.push("admin");
    if (folder.kind === "python") facts.software = true;
    if (!facts.name || /^(localhost|vite|react app|next\.js|astro)/i.test(facts.name)) facts.name = folder.name;
  }
  if (job.mode === "update" && job.name) facts.name = job.name;
  facts.category = job.category || "";
  facts.category = categorize(facts);
  job.facts = { name: facts.name, features: facts.features, stack: facts.stack, languages: facts.languages, accent: facts.accent, location: facts.location, year: facts.year, category: facts.category };
  step("analyze", "done", `${facts.features.length} funkcji · ${facts.stack.length} technologii`);

  // slug: fixed when updating, otherwise from the name and unique
  let slug = job.slug;
  if (!slug) {
    const base = slugify(facts.name);
    slug = base;
    for (let i = 2; (job.takenSlugs ?? []).includes(slug); i++) slug = `${base}-${i}`;
    job.slug = slug;
    save();
  }

  // ---- 3. video + section screenshots
  step("video", "running");
  const c1 = await run(process.execPath, [path.join("scripts", "capture2.mjs"), slug, url], "nagranie");
  step("video", c1 === 0 ? "done" : "error", c1 === 0 ? undefined : "część nagrań się nie udała — szczegóły w logu");

  // no real colour among the page's buttons/links → the strongest colour of the first screen
  if (!facts.accent) {
    const first = path.join(ROOT, "public", "media", "projects", slug, "shots", "d01.webp");
    facts.accent = (fs.existsSync(first) && (await accentFromShot(first).catch(() => null))) || "#2B2DF5";
    job.facts = { ...job.facts, accent: facts.accent };
    log(`Kolor projektu z pierwszego zrzutu: ${facts.accent}`);
  }

  // ---- 4. logo, sub-pages, mobile menu
  step("extras", "running");
  const c2 = await run(process.execPath, [path.join("scripts", "case-extras.mjs"), slug, url], "ekstra");
  step("extras", c2 === 0 ? "done" : "error");

  // the dev server is no longer needed
  if (server) {
    await server.stop();
    server = null;
    log("Serwer projektu zatrzymany.");
  }

  // ---- 5. logo tone + clips
  step("media", "running");
  const projDir = path.join(ROOT, "public", "media", "projects", slug);
  if (fs.existsSync(path.join(projDir, "logo-raw.png"))) {
    await run(PY, [path.join("scripts", "logo_tone.py"), slug], "logo");
    fs.mkdirSync(path.join(ROOT, ".capture", "logos"), { recursive: true });
    fs.renameSync(path.join(projDir, "logo-raw.png"), path.join(ROOT, ".capture", "logos", `${slug}.png`));
  }
  if (fs.existsSync(path.join(projDir, "desktop.mp4"))) await run(PY, [path.join("scripts", "clips.py"), slug], "klipy");
  const shots = fs.existsSync(path.join(projDir, "shots")) ? fs.readdirSync(path.join(projDir, "shots")).length : 0;
  const clips = fs.existsSync(path.join(projDir, "clips")) ? fs.readdirSync(path.join(projDir, "clips")).filter((f) => f.endsWith(".mp4")).length : 0;
  step("media", "done", `${shots} zrzutów · ${clips} klipów`);

  // ---- 6. copy
  step("copy", "running");
  const copy = await writeCopy(facts, log);
  step("copy", "done", copy.source === "templates" ? "szablony (dodaj klucz AI, aby pisało AI)" : `AI: ${copy.source}`);

  // ---- 7. free domain
  let liveUrl = isUrl && !isLocalUrl ? src : "";
  if (job.deploy && !isUrl) {
    step("deploy", "running");
    try {
      liveUrl = await deployFolder(src, slug, log);
      step("deploy", "done", liveUrl);
    } catch (e) {
      step("deploy", "error", String(e.message).slice(0, 300));
    }
  } else step("deploy", "skipped");

  job.result = {
    slug,
    name: copy.name,
    client: copy.client,
    location: copy.location,
    category: copy.category,
    url: liveUrl,
    status: liveUrl ? "live" : "local",
    accent: facts.accent,
    year: facts.year,
    stack: facts.stack,
    tagline: copy.tagline,
    summary: copy.summary,
    challenge: copy.challenge,
    solution: copy.solution,
    role: copy.role,
    features: copy.features,
    copySource: copy.source,
  };
  step("save", "running");
  await finish("done");
} catch (e) {
  log(`Błąd: ${e.message}`);
  for (const s of job.steps) if (s.status === "running") s.status = "error";
  await finish("error", String(e.message).split("\n")[0]);
}
process.exit(0);
