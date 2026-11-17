// Publishes a local project folder on a free *.vercel.app domain with the Vercel CLI
// (uses the CLI's login on this computer, or VERCEL_TOKEN from the environment).
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const NPM_CLI = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");

function vercelCli() {
  try {
    const root = execFileSync(process.execPath, [NPM_CLI, "root", "-g"], { encoding: "utf8" }).trim();
    const cli = path.join(root, "vercel", "dist", "index.js");
    if (fs.existsSync(cli)) return [cli];
  } catch {}
  return [NPM_CLI, "exec", "--yes", "vercel@latest", "--"]; // not installed globally → fetch it from npm
}

/** Deploy `dir` to production. Resolves with the public URL (the clean alias when Vercel gives one). */
export async function deployFolder(dir, slug, log) {
  const cli = vercelCli();
  const token = process.env.VERCEL_TOKEN ? ["--token", process.env.VERCEL_TOKEN] : [];
  // link the folder to a Vercel project named after the portfolio slug (→ <slug>.vercel.app when free)
  if (!fs.existsSync(path.join(dir, ".vercel", "project.json"))) {
    log(`Tworzę projekt Vercel „${slug}”…`);
    execFileSync(process.execPath, [...cli, "link", "--yes", "--project", slug, ...token], { cwd: dir, env: { ...process.env, CI: "1" }, stdio: "ignore", timeout: 120_000 });
  }
  const args = [...cli, "deploy", "--prod", "--yes", ...token];
  log("Publikuję na Vercel (darmowa domena *.vercel.app)…");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: dir, env: { ...process.env, CI: "1" }, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let out = "";
    const on = (b) => {
      out += b.toString();
      const line = b.toString().trim().split("\n").pop();
      if (line) log(`vercel: ${line.replace(/\x1b\[[0-9;]*m/g, "").slice(0, 160)}`);
    };
    child.stdout.on("data", on);
    child.stderr.on("data", on);
    const timer = setTimeout(() => child.kill(), 20 * 60_000);
    child.on("exit", (code) => {
      clearTimeout(timer);
      const clean = out.replace(/\x1b\[[0-9;]*m/g, "");
      const alias = clean.match(/Aliased:\s*(https:\/\/[^\s[]+)/i)?.[1];
      const prod = clean.match(/Production:\s*(https:\/\/[^\s[]+)/i)?.[1];
      const any = [...clean.matchAll(/https:\/\/[a-z0-9.-]+\.vercel\.app/gi)].map((m) => m[0]).pop();
      const url = alias || prod || any;
      if (code === 0 && url) resolve(url.replace(/\/$/, ""));
      else reject(new Error(`Vercel nie opublikował projektu (kod ${code}). ${clean.slice(-600)}`));
    });
  });
}
