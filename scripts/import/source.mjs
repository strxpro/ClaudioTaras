// Local project folders: figure out what kind of project it is, start it on a free port, and stop it
// again afterwards (cleaning up files that `next dev` generates on its own).
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";

const NPM_CLI = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
const AUTO_FILES = ["AGENTS.md", "CLAUDE.md"]; // written by `next dev` (agent rules) when missing

const DEP_STACK = {
  next: "Next.js", react: "React", astro: "Astro", vue: "Vue", nuxt: "Nuxt", svelte: "Svelte", "@sveltejs/kit": "SvelteKit", vite: "Vite",
  typescript: "TypeScript", tailwindcss: "Tailwind CSS", "@tailwindcss/postcss": "Tailwind CSS", gsap: "GSAP", three: "Three.js", "@react-three/fiber": "React Three Fiber",
  lenis: "Lenis", "@studio-freight/lenis": "Lenis", "framer-motion": "Motion", motion: "Motion", "@supabase/supabase-js": "Supabase", "@supabase/ssr": "Supabase",
  stripe: "Stripe", "@stripe/stripe-js": "Stripe", prisma: "Prisma", "@prisma/client": "Prisma", "drizzle-orm": "Drizzle", zod: "Zod", "next-intl": "next-intl",
  i18next: "i18next", resend: "Resend", nodemailer: "Nodemailer", leaflet: "Leaflet", "mapbox-gl": "Mapbox", openai: "OpenAI API", "@anthropic-ai/sdk": "Claude API",
  telegraf: "Telegram Bot", "node-telegram-bot-api": "Telegram Bot", "socket.io": "Socket.IO", express: "Express", "@vercel/analytics": "Vercel Analytics",
  "lottie-react": "Lottie", swiper: "Swiper", recharts: "Recharts", "chart.js": "Chart.js", "@radix-ui/react-dialog": "Radix UI", "react-hook-form": "React Hook Form",
};
const PY_STACK = { fastapi: "FastAPI", flask: "Flask", django: "Django", "opencv-python": "OpenCV", mediapipe: "MediaPipe", numpy: "NumPy", ultralytics: "YOLO", pyserial: "PySerial", uvicorn: "Uvicorn", torch: "PyTorch" };

const read = (f) => {
  try {
    return fs.readFileSync(f, "utf8");
  } catch {
    return "";
  }
};

/** What is in this folder, plus everything we can learn without running it. */
export function inspectFolder(dir) {
  const pkgRaw = read(path.join(dir, "package.json"));
  const pkg = pkgRaw ? JSON.parse(pkgRaw) : null;
  const readme = read(path.join(dir, "README.md")) || read(path.join(dir, "readme.md"));
  const reqs = read(path.join(dir, "requirements.txt"));
  const stack = new Set();
  let kind = "unknown";
  let framework = "";
  if (pkg) {
    kind = "node";
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const [d, label] of Object.entries(DEP_STACK)) if (deps[d]) stack.add(label);
    framework = deps.next ? "next" : deps.astro ? "astro" : deps.nuxt ? "nuxt" : deps["@sveltejs/kit"] ? "sveltekit" : deps.vite ? "vite" : "";
    if (!pkg.scripts?.dev && !pkg.scripts?.start) kind = fs.existsSync(path.join(dir, "index.html")) ? "static" : "unknown";
  } else if (fs.existsSync(path.join(dir, "index.html"))) {
    kind = "static";
    stack.add("HTML/CSS/JS");
  } else if (reqs || fs.existsSync(path.join(dir, "main.py"))) {
    kind = "python";
    stack.add("Python");
    for (const [d, label] of Object.entries(PY_STACK)) if (new RegExp(`^${d}\\b`, "im").test(reqs)) stack.add(label);
  }
  // an /admin route in the code = an admin panel feature
  const hasAdmin = ["app/admin", "src/app/admin", "src/pages/admin", "pages/admin", "src/routes/admin", "app/(admin)", "src/app/(admin)"].some((p) => fs.existsSync(path.join(dir, p)));
  const prettyName = (pkg?.name || path.basename(dir)).replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return { kind, framework, pkg, readme, stack: [...stack], hasAdmin, name: prettyName, description: pkg?.description || "" };
}

// starts above the site's own ports (3100 dev, 3300 preview); binds the default (dual-stack) address,
// so a server already listening on [::] (Next does) counts as taken — 127.0.0.1 alone missed it
export function freePort(from = 3400) {
  return new Promise((resolve) => {
    const tryPort = (p) => {
      const s = net.createServer();
      s.once("error", () => tryPort(p + 1));
      s.once("listening", () => s.close(() => resolve(p)));
      s.listen(p);
    };
    tryPort(from);
  });
}

function ping(url, timeout = 60000) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout }, (res) => {
      res.resume();
      resolve(res.statusCode || 0);
    });
    req.on("error", () => resolve(0));
    req.on("timeout", () => {
      req.destroy();
      resolve(0);
    });
  });
}

const kill = (pid) => {
  try {
    if (process.platform === "win32") execFileSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
    else process.kill(-pid, "SIGTERM");
  } catch {}
};

/** Serve a plain folder (index.html) over http. */
function staticServer(root, port) {
  const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".mp4": "video/mp4", ".webm": "video/webm", ".woff2": "font/woff2", ".ico": "image/x-icon" };
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent((req.url || "/").split("?")[0]);
    let file = path.normalize(path.join(root, p));
    if (!file.startsWith(path.normalize(root))) return res.writeHead(403).end();
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
    if (!fs.existsSync(file)) return res.writeHead(404).end("not found");
    res.writeHead(200, { "content-type": types[path.extname(file).toLowerCase()] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => srv.listen(port, "127.0.0.1", () => resolve(srv)));
}

/**
 * Start a local project and return its URL and a stop() that shuts it down and removes files the
 * dev server created by itself. Throws with a readable message when it can't be started.
 */
export async function startFolder(dir, info, log) {
  const port = await freePort();
  if (info.kind === "static") {
    const root = fs.existsSync(path.join(dir, "index.html")) ? dir : path.join(dir, "dist");
    const srv = await staticServer(root, port);
    log(`Statyczna strona → http://localhost:${port}`);
    return { url: `http://localhost:${port}/`, stop: async () => srv.close() };
  }
  if (info.kind !== "node") {
    throw new Error(
      info.kind === "python"
        ? "To projekt w Pythonie — nie uruchamiam go sam (może sterować sprzętem/kamerą). Uruchom go i wklej adres, np. http://localhost:8000 — resztę zrobię."
        : "Nie rozpoznaję tego projektu (brak package.json / index.html). Uruchom go sam i wklej jego adres.",
    );
  }
  const before = new Set(AUTO_FILES.filter((f) => fs.existsSync(path.join(dir, f))));
  if (!fs.existsSync(path.join(dir, "node_modules"))) {
    log("Instaluję zależności projektu (npm install)…");
    execFileSync(process.execPath, [NPM_CLI, "install", "--no-audit", "--no-fund"], { cwd: dir, stdio: "ignore", timeout: 15 * 60_000 });
  }
  const script = info.pkg.scripts?.dev ? "dev" : "start";
  log(`Uruchamiam „npm run ${script}” na porcie ${port}…`);
  const child = spawn(process.execPath, [NPM_CLI, "run", script, "--", "--port", String(port)], {
    cwd: dir,
    env: { ...process.env, PORT: String(port), BROWSER: "none", NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    detached: process.platform !== "win32",
  });
  let alive = true;
  let url = `http://localhost:${port}/`;
  // Next 16 refuses a second dev server in the same folder and names the one already running:
  // use that one (it is the owner's, so it is never stopped)
  let reused = false;
  const out = [];
  const onData = (b) => {
    const s = b.toString();
    out.push(s);
    const all = out.join("").replace(/\x1b\[[0-9;]*m/g, "");
    const other = all.match(/Another next dev server is already running[\s\S]*?Local:\s*(https?:\/\/(?:localhost|127\.0\.0\.1):\d+)/);
    if (other) {
      reused = true;
      url = `${other[1].replace("127.0.0.1", "localhost")}/`;
      return;
    }
    if (reused) return;
    // trust the URL the dev server prints (some pick another port when ours is taken)
    const m = s.replace(/\x1b\[[0-9;]*m/g, "").match(/https?:\/\/(?:localhost|127\.0\.0\.1):(\d+)/);
    if (m) url = `http://localhost:${m[1]}/`;
  };
  child.stdout.on("data", onData);
  child.stderr.on("data", onData);
  child.on("exit", () => (alive = false));
  const stop = async () => {
    kill(child.pid);
    await new Promise((r) => setTimeout(r, 1200));
    for (const f of AUTO_FILES) {
      const p = path.join(dir, f);
      if (!before.has(f) && fs.existsSync(p) && /nextjs-agent-rules|BEGIN:nextjs/i.test(read(p))) fs.rmSync(p);
    }
  };
  try {
    // poll the (possibly updated) URL; the first request compiles the page, so allow it time
    const end = Date.now() + 300_000;
    for (;;) {
      if (!alive && !reused) throw new Error("serwer projektu zakończył się przed startem");
      const code = await ping(url);
      if (code && code < 500) break;
      if (Date.now() > end) throw new Error("serwer projektu nie wystartował w 5 minut");
      await new Promise((r) => setTimeout(r, 1500));
    }
  } catch (e) {
    await stop();
    throw new Error(`${e.message}\n${out.join("").slice(-800)}`);
  }
  log(reused ? `Projekt już był uruchomiony — używam go → ${url}` : `Projekt działa → ${url}`);
  return { url, stop };
}
