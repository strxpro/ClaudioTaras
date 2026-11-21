// Starts the worker hidden every time Windows starts (a small .vbs in the user's Startup folder) and
// right now.   npm run worker:install  ·  npm run worker:remove (stops it and removes the autostart)
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { DATA, ROOT } from "./env.mjs";

const remove = process.argv.includes("--remove");
const startup = path.join(process.env.APPDATA ?? "", "Microsoft", "Windows", "Start Menu", "Programs", "Startup");
const vbs = path.join(startup, "portfolio-pomocnik.vbs");
const lock = path.join(DATA, "worker.pid");

function stop() {
  const pid = Number(fs.existsSync(lock) ? fs.readFileSync(lock, "utf8") : 0);
  if (!pid) return false;
  try {
    execFileSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
    fs.rmSync(lock, { force: true });
    return true;
  } catch {
    return false;
  }
}

if (process.platform !== "win32" || !process.env.APPDATA) {
  console.log("Autostart jest tylko dla Windows. Uruchamiaj: npm run worker");
  process.exit(1);
}

if (remove) {
  const stopped = stop();
  const had = fs.existsSync(vbs);
  fs.rmSync(vbs, { force: true });
  console.log(`${stopped ? "Pomocnik zatrzymany. " : ""}${had ? "Autostart usunięty." : "Autostartu nie było."}`);
  process.exit(0);
}

// VBScript: start node with no window; quotes doubled for VBS
const q = (s) => `""${s}""`;
const script = [
  "' Portfolio helper: takes the Telegram bot's jobs (new screenshots, new projects). Delete this file to stop autostart.",
  'Set sh = CreateObject("WScript.Shell")',
  `sh.CurrentDirectory = "${ROOT}"`,
  `sh.Run "${q(process.execPath)} ${q(path.join(ROOT, "scripts", "worker", "index.mjs"))}", 0, False`,
  "",
].join("\r\n");
if (/[^\x20-\x7e\r\n]/.test(script)) {
  console.log("Ścieżka projektu albo Node zawiera znaki spoza ASCII — autostart przez .vbs by jej nie odczytał. Uruchamiaj: npm run worker");
  process.exit(1);
}
fs.mkdirSync(startup, { recursive: true });
fs.writeFileSync(vbs, script, "latin1");
stop(); // a running copy (maybe started from a terminal) makes way for the hidden one
spawn("wscript.exe", [vbs], { detached: true, stdio: "ignore", windowsHide: true }).unref();
console.log(`Gotowe: pomocnik działa w tle i będzie startował z Windows.
Plik autostartu: ${vbs}
Log: ${path.join(DATA, "worker.log")}
Wyłączenie: npm run worker:remove`);
