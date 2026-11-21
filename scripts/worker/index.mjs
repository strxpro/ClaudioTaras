// Pomocnik portfolio: the part of the Telegram bot that lives on Claudio's computer.
// The bot runs on Vercel, which has no browser for recordings and can't see the F: drive. So when he
// says "strona Villa Dea się zmieniła" or "w F:\hotel jest nowa wersja", the bot puts a job in
// Supabase (kv "job:<id>") and this worker:
//   1. records the project again (scripts/import/run.mjs: video, section shots, logo, clips, copy)
//      from its live site or from its folder (it starts the folder's dev server itself),
//   2. commits only that project's media and pushes → Vercel publishes it,
//   3. waits until the live site serves the new pictures, then saves the project (new texts too, when
//      the site changed) → pages refresh live,
//   4. keeps one Telegram message up to date with the progress, and ends it with 🌐 / ↩️ buttons.
// It also writes kv "worker:alive" every minute, so the bot can say whether the computer is on.
//   npm run worker            in a terminal (Ctrl+C stops it)
//   npm run worker:install    start hidden with Windows from now on (npm run worker:remove undoes it)
import { DATA, ROOT, SITE, log, sleep } from "./env.mjs";
import { execFileSync, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { announce, journal, kv, projects, ready } from "./supa.mjs";
import { admins, edit, esc, send } from "./tg.mjs";
import { resolveSource, samePlace } from "./source.mjs";
import { probeFile, publishMedia, waitLive } from "./publish.mjs";
import { created, refreshed } from "./save.mjs";

const POLL = 10_000;
const BEAT = 60_000;
const IMPORT_TIMEOUT = 45 * 60_000;
const DRY = process.argv.includes("--dry"); // test run: record, but no push, no save, no Telegram

/* ── one worker per computer ─────────────────────────────────────────────── */

const LOCK = path.join(DATA, "worker.pid");
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
{
  const old = Number(fs.existsSync(LOCK) ? fs.readFileSync(LOCK, "utf8") : 0);
  if (old && old !== process.pid && alive(old)) {
    console.log(`Pomocnik już działa (pid ${old}). Log: .data/worker.log`);
    process.exit(0);
  }
  fs.writeFileSync(LOCK, String(process.pid));
  process.on("exit", () => {
    try {
      if (Number(fs.readFileSync(LOCK, "utf8")) === process.pid) fs.rmSync(LOCK);
    } catch {}
  });
  process.on("SIGINT", () => process.exit(0));
  process.on("SIGTERM", () => process.exit(0));
}

if (!ready()) {
  log("Brak SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY w .env.local — pomocnik nie ma skąd brać zleceń.");
  process.exit(1);
}

/* ── heartbeat ───────────────────────────────────────────────────────────── */

let busy = null;
const beat = () =>
  DRY ? Promise.resolve() : kv.set("worker:alive", { at: Date.now(), host: os.hostname(), busy, pid: process.pid }).catch((e) => log("heartbeat:", e.message));

/* ── the assistant's clock ───────────────────────────────────────────────── */
// Every minute while the computer is on: the site sends reminders that are due (and waits for those
// due within the next ~minute), the morning plan and the evening report. src/lib/assistant/tick.ts
const TICK = 60_000;
let tickFails = 0;
const knock = () =>
  fetch(`${SITE}/api/cron/tick?by=worker&ahead=65`, {
    method: "POST",
    headers: { "x-tick-secret": process.env.TELEGRAM_WEBHOOK_SECRET ?? "" },
    signal: AbortSignal.timeout(30_000),
  })
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      tickFails = 0;
    })
    .catch((e) => {
      if (++tickFails === 5 || tickFails % 60 === 0) log("zegar asystenta:", e.message);
    });

/* ── queue ───────────────────────────────────────────────────────────────── */

const strip = ({ key: _k, ...rest }) => rest;

async function jobs() {
  return (await kv.list("job:")).map((r) => ({ ...r.data, key: r.id }));
}

async function nextJob() {
  const all = await jobs();
  for (const j of all)
    if ((j.status === "done" || j.status === "error") && Date.now() - Date.parse(j.finishedAt ?? j.createdAt) > 7 * 86400_000) await kv.del(j.key).catch(() => {});
  return all.filter((j) => j.status === "queued").sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))[0] ?? null;
}

/** Jobs left "running" when the computer went off: try again (twice at most). */
async function recover() {
  for (const j of await jobs()) {
    if (j.status !== "running") continue;
    const attempts = (j.attempts ?? 0) + 1;
    await kv.set(j.key, { ...strip(j), status: attempts < 3 ? "queued" : "error", attempts, ...(attempts < 3 ? {} : { error: "Przerwane — komputer się wyłączył?", finishedAt: new Date().toISOString() }) });
    log(`zlecenie ${j.key} przerwane wcześniej → ${attempts < 3 ? "ponawiam" : "błąd"}`);
  }
}

/** An import started from the admin panel on this computer is still running? */
function panelBusy() {
  const dir = path.join(DATA, "jobs");
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .some((f) => {
        const j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
        return (j.status === "running" || j.status === "queued") && j.pid && alive(j.pid) && Date.now() - Date.parse(j.createdAt) < IMPORT_TIMEOUT;
      });
  } catch {
    return false;
  }
}

/* ── the import itself ───────────────────────────────────────────────────── */

const STEP_ICON = { pending: "▫️", running: "⏳", done: "✅", error: "⚠️", skipped: "➖" };

function importSteps(isFolder, keepTexts) {
  return [
    { key: "source", label: isFolder ? "Uruchamiam projekt z folderu" : "Otwieram stronę" },
    { key: "analyze", label: "Analiza — funkcje, technologie, kolor" },
    { key: "video", label: "Wideo + zrzuty (komputer i telefon)" },
    { key: "extras", label: "Logo, podstrony, menu mobilne" },
    { key: "media", label: "Klipy „Jak to działa”" },
    { key: "copy", label: keepTexts ? "Opisy (zostają obecne)" : "Opisy w 6 językach" },
    { key: "save", label: "Zapis projektu" },
  ].map((s) => ({ ...s, status: "pending" }));
}

const readJson = (f) => {
  try {
    return JSON.parse(fs.readFileSync(f, "utf8"));
  } catch {
    return null;
  }
};

function killTree(pid) {
  try {
    if (process.platform === "win32") execFileSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
    else process.kill(pid, "SIGTERM");
  } catch {}
}

/** node <script> …, output into the worker log; resolves with the exit code. */
function runNode(args, env = {}, onTick, timeout = IMPORT_TIMEOUT) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: ROOT, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    const out = (b) => b.toString().split(/\r?\n/).forEach((l) => l.trim() && log(`  ${path.basename(args[0])}: ${l.trim().slice(0, 200)}`));
    child.stdout.on("data", out);
    child.stderr.on("data", out);
    const tick = onTick ? setInterval(onTick, 3000) : null;
    const kill = setTimeout(() => {
      log(`  ${args[0]}: przekroczony czas — przerywam`);
      killTree(child.pid);
    }, timeout);
    child.on("exit", (code) => {
      if (tick) clearInterval(tick);
      clearTimeout(kill);
      resolve(code ?? 1);
    });
  });
}

async function work(q) {
  const key = q.key;
  let rec = strip(q);
  const save = (patch) => {
    rec = { ...rec, ...patch };
    return DRY ? Promise.resolve() : kv.set(key, rec);
  };
  const chat = Number(rec.chatId) || admins()[0];
  let head = rec.kind === "import" ? "➕ <b>Nowy projekt</b>" : `📸 <b>${esc(rec.name ?? rec.slug ?? "")}</b>`;
  let steps = [];
  const extra = []; // the worker's own steps after the import
  const notes = [];
  let msgId = null;
  let shown = "";
  let lastEdit = 0;
  const render = (tail) =>
    [
      head,
      "",
      ...[...steps.filter((s) => s.key !== "save"), ...extra, ...steps.filter((s) => s.key === "save")].map(
        (s) => `${STEP_ICON[s.status] ?? "▫️"} ${esc(s.label)}${s.note && s.status !== "pending" ? ` — <i>${esc(String(s.note).slice(0, 140))}</i>` : ""}`,
      ),
      ...(tail ? ["", tail] : []),
    ].join("\n");
  const show = async (tail, buttons, force = false) => {
    const text = render(tail);
    if (text === shown && !buttons) return;
    if (!force && Date.now() - lastEdit < 2500) return;
    shown = text;
    lastEdit = Date.now();
    if (DRY) return void log(`[telegram]\n${text.replace(/<[^>]+>/g, "")}`);
    if (!chat) return;
    try {
      if (!msgId) msgId = await send(chat, text, buttons);
      else await edit(chat, msgId, text, buttons);
    } catch (e) {
      log("telegram:", e.message);
    }
  };
  const mine = (k, label) => {
    let s = extra.find((x) => x.key === k);
    if (!s) extra.push((s = { key: k, label, status: "pending" }));
    return s;
  };

  busy = rec.name || rec.source || rec.slug || "zlecenie";
  void beat();
  log(`▶ ${key}: ${rec.kind} ${rec.slug ?? ""} ${rec.source ?? ""}${rec.texts ? " (+ teksty)" : ""}`);
  await save({ status: "running", startedAt: new Date().toISOString(), host: os.hostname() });

  try {
    const all = await projects.all();
    let existing = rec.kind === "refresh" ? all.find((p) => p.id === rec.projectId || p.slug === rec.slug) : undefined;
    if (rec.kind === "refresh" && !existing) throw new Error(`Nie znam projektu „${rec.slug}”.`);
    // where from: what he named, else the live site (what visitors see), else the project's folder
    const raw = rec.source || (existing ? (existing.status === "live" && existing.url ? existing.url : existing.source || existing.url) : "");
    if (!raw) throw new Error(`Nie wiem, skąd nagrać „${existing?.name ?? rec.slug}”. Powiedz, w którym folderze jest (np. F:\\Projekty\\nazwa) albo podaj link.`);
    const src = resolveSource(raw);
    if (src.note) notes.push(src.note);
    // a "new" project whose folder / link already is one → refresh that one instead of making a twin
    if (!existing) {
      const twin = all.find((p) => samePlace(p.source, src.source) || samePlace(p.url, src.source));
      if (twin) {
        existing = twin;
        notes.push(`To już projekt „${twin.name}” — odświeżam go.`);
      }
    }
    // a new project gets its texts anyway; "add F:\x" for a folder that already is one = its new version
    const texts = rec.kind === "import" || Boolean(rec.texts);
    head = `${existing ? `📸 <b>${esc(existing.name)}</b> — ${texts ? "nowe zrzuty i opisy" : "nowe zrzuty"}` : "➕ <b>Nowy projekt</b>"}\n<i>z: ${esc(src.source)}</i>`;

    while (panelBusy()) {
      await show("🕓 Czekam, aż skończy się import z panelu…", undefined, true);
      await sleep(15_000);
    }

    // the same job file as an import from the panel (scripts/import/run.mjs reads and updates it)
    const jobId = `w-${String(rec.id).replace(/[^a-z0-9-]/gi, "")}`;
    const jobPath = path.join(DATA, "jobs", `${jobId}.json`);
    fs.mkdirSync(path.dirname(jobPath), { recursive: true });
    const job = {
      id: jobId,
      createdAt: new Date().toISOString(),
      source: src.source,
      mode: existing ? "update" : "create",
      projectId: existing?.id ?? `p-${crypto.randomUUID().slice(0, 8)}`,
      slug: existing?.slug ?? "",
      name: existing?.name,
      category: existing?.category,
      publish: existing ? existing.published : rec.publish !== false,
      deploy: false,
      takenSlugs: all.map((p) => p.slug),
      status: "queued",
      steps: importSteps(src.isFolder, Boolean(existing) && !texts),
      log: [],
      // the panel must not turn this job into a project as well: the worker saves it
      saved: true,
    };
    fs.writeFileSync(jobPath, JSON.stringify(job, null, 2));
    steps = job.steps;
    await show(undefined, undefined, true);

    const code = await runNode(
      [path.join("scripts", "import", "run.mjs"), jobPath],
      { GATE_PASSWORD: existing?.gatePassword ?? "", IMPORT_CALLBACK_URL: "" },
      () => {
        const j = readJson(jobPath);
        if (j?.steps) steps = j.steps;
        void show();
      },
    );
    const done = readJson(jobPath);
    if (done?.steps) steps = done.steps;
    if (!done || done.status !== "done" || !done.result) throw new Error(done?.error || `Nagrywanie przerwane (kod ${code}).`);
    const r = done.result;
    const slug = r.slug;
    // run.mjs leaves "save" running for the panel; here the project is saved only after publishing
    for (const s of steps) if (s.key === "save") s.status = "pending";

    // sites that exist in several languages: their first screens per language (scripts/lang-shots.mjs)
    const shotsDir = path.join(ROOT, "public", "media", "projects", slug, "shots");
    const langs = fs.existsSync(shotsDir) ? fs.readdirSync(shotsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) : [];
    if (langs.length) {
      const s = mine("lang", "Zrzuty w innych językach");
      s.status = "running";
      await show(undefined, undefined, true);
      const t0 = Date.now();
      const lc = await runNode([path.join("scripts", "lang-shots.mjs"), slug], {}, null, 15 * 60_000);
      // a language the script couldn't redo would show the old site: drop it (the new main shot is used)
      let fresh = 0;
      for (const l of langs) {
        const f = path.join(shotsDir, l, "d01.webp");
        if (fs.existsSync(f) && fs.statSync(f).mtimeMs >= t0) fresh++;
        else fs.rmSync(path.join(shotsDir, l), { recursive: true, force: true });
      }
      Object.assign(s, {
        status: fresh ? "done" : lc ? "error" : "skipped",
        note: fresh ? `${fresh} języków` : lc ? "nie wyszło — w innych językach pokażę nowe główne zrzuty" : "ta strona nie ma wersji językowych",
      });
    }

    // publish the pictures (git push → Vercel)
    const name = existing?.name ?? r.name;
    const push = mine("push", "Wysyłam zdjęcia na stronę (GitHub → Vercel)");
    const live = mine("live", "Vercel publikuje nową wersję");
    push.status = "running";
    await show(undefined, undefined, true);
    let pub = { changed: [], committed: false, pushed: false, note: "test — bez wysyłania" };
    if (!DRY) {
      try {
        pub = publishMedia(slug, `Media: ${name} (${existing ? "odświeżone" : "nowy projekt"} przez bota)`);
      } catch (e) {
        pub = { changed: [], committed: false, pushed: false, note: `git: ${String(e.stderr || e.message).trim().split("\n").pop()?.slice(0, 160)}` };
      }
    }
    push.status = pub.pushed ? "done" : pub.changed.length ? "error" : "skipped";
    push.note = pub.pushed ? `${pub.changed.length} plików` : undefined;
    if (pub.note) notes.push(pub.note);
    let isLive = !pub.changed.length; // nothing new to wait for
    if (pub.pushed) {
      live.status = "running";
      await show(undefined, undefined, true);
      const probe = probeFile(pub.changed);
      isLive = probe ? await waitLive(SITE, probe) : true;
      live.status = isLive ? "done" : "error";
      if (!isLive) notes.push("Vercel nie opublikował w 15 min — sprawdź vercel.com (build).");
    } else live.status = "skipped";

    // save the project (re-read: something may have changed while recording)
    const saveStep = steps.find((s) => s.key === "save");
    if (saveStep) saveStep.status = "running";
    await show(undefined, undefined, true);
    const fresh = await projects.all();
    const before = fresh.find((p) => p.id === job.projectId);
    let project;
    if (before) project = refreshed(before, r, { texts, source: rec.source || !before.source ? src.source : undefined });
    else {
      project = created(job, r, fresh);
      // its pictures aren't on the live site yet → a draft, so visitors never see an empty card
      if (!isLive && project.published) {
        project.published = false;
        notes.push("Zapisany jako szkic, bo zdjęć jeszcze nie ma na stronie — napisz „pokaż go na stronie”, gdy będą.");
      }
    }
    if (DRY) log(`[zapis] ${project.slug}: ${JSON.stringify({ tagline: project.tagline?.pl, accent: project.accent, media: project.media, published: project.published })}`);
    else {
      await projects.save(project);
      if (before && texts) await kv.set("bot:undo", { projects: [before], messages: [], at: new Date().toISOString() });
      const rv = await fetch(`${SITE}/api/revalidate`, { method: "POST", headers: { "x-revalidate-secret": process.env.TELEGRAM_WEBHOOK_SECRET ?? "" }, signal: AbortSignal.timeout(30_000) }).catch(() => null);
      if (!rv?.ok) notes.push("Strona odświeży się sama w ciągu godziny (nie udało się wymusić odświeżenia).");
      await announce();
    }
    if (saveStep) saveStep.status = "done";

    const stat = steps.find((s) => s.key === "media")?.note;
    const tail = [
      DRY ? "🧪 Test zakończony (nic nie wysłane, nic nie zapisane)." : isLive && pub.pushed ? "✅ <b>Gotowe — strona jest zaktualizowana.</b>" : "✅ <b>Gotowe.</b>",
      stat ? `• ${esc(stat)}` : "",
      before ? `• Opisy: ${texts ? `nowe (${esc(r.copySource)})` : "bez zmian"}` : `• ${project.published ? "Na stronie" : "Szkic"} · /${esc(project.slug)}`,
      ...notes.map((n) => `• ${esc(n)}`),
    ]
      .filter(Boolean)
      .join("\n");
    const buttons = [[{ text: "🌐 Zobacz", url: `${SITE}/pl/work/${project.slug}` }, ...(before && texts && !DRY ? [{ text: "↩️ Cofnij opisy", data: "undo:" }] : [])]];
    await show(tail, buttons, true);
    if (!DRY) await journal("worker", before ? `📸 ${project.name}: nowe zrzuty i wideo${texts ? " + nowe opisy" : ""}` : `➕ Nowy projekt: ${project.name}`);
    await save({ status: "done", finishedAt: new Date().toISOString(), slug: project.slug, projectId: project.id });
    log(`✔ ${key}: ${project.slug}${pub.pushed ? " (wysłane)" : ""}`);
  } catch (e) {
    const msg = String(e.message ?? e).split("\n")[0].slice(0, 400);
    for (const s of [...steps, ...extra]) if (s.status === "running") s.status = "error";
    await show(`😕 Nie wyszło: ${esc(msg)}`, undefined, true);
    await save({ status: "error", error: msg, finishedAt: new Date().toISOString() });
    log(`✖ ${key}: ${msg}`);
  } finally {
    busy = null;
    void beat();
  }
}

/* ── main loop ───────────────────────────────────────────────────────────── */

log(`Pomocnik działa (${os.hostname()}, pid ${process.pid}${DRY ? ", TEST" : ""}) — czekam na zlecenia z bota. Strona: ${SITE}`);
if (DRY) {
  // test: one job given on the command line, e.g. --dry refresh villa-dea [source] | --dry import F:\folder
  const [kind, a, b] = process.argv.slice(process.argv.indexOf("--dry") + 1);
  const all = await projects.all();
  const p = kind === "refresh" ? all.find((x) => x.slug === a) : undefined;
  await work({ key: "job:test", id: `test-${Date.now().toString(36)}`, kind, slug: p?.slug, projectId: p?.id, name: p?.name, source: kind === "import" ? a : b, texts: true, createdAt: new Date().toISOString(), status: "queued" });
  process.exit(0);
}
await recover().catch((e) => log("start:", e.message));
await beat();
setInterval(beat, BEAT);
void knock();
setInterval(knock, TICK);
for (;;) {
  let next = null;
  try {
    next = await nextJob();
  } catch (e) {
    log("kolejka:", e.message);
  }
  if (next) await work(next).catch((e) => log("zlecenie:", e.stack ?? e.message));
  else await sleep(POLL);
}
