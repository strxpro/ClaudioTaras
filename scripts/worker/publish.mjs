// Getting new media onto the live site: the pictures live in git (public/media/projects/<slug>) and
// Vercel builds every push to main. Only that project's media folder is committed, and nothing is
// pushed when that would also publish other, unrelated local work.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ROOT, sleep } from "./env.mjs";

const git = (args, timeout = 120_000, cwd = ROOT) =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    timeout,
    // never wait for a password prompt nobody can see
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  }).trim();

const REASON = {
  same: "Zdjęcia wyszły takie same jak były — nic nie wysyłam.",
  branch: "Repozytorium nie jest na gałęzi main — zdjęcia zostały tylko na komputerze.",
  offline: "Brak połączenia z GitHubem — zdjęcia są zapisane na komputerze, wyślę je przy następnym zleceniu albo zrób git push.",
  behind: "Na GitHubie są nowsze zmiany niż na komputerze — nie wysyłam sam. Zdjęcia są zapisane w commicie na komputerze (zrób git pull, potem git push).",
  others: "Na komputerze są też inne, jeszcze niewysłane zmiany kodu — nie publikuję ich sam. Zdjęcia są w commicie; wyślij wszystko przez git push, gdy kod będzie gotowy.",
  failed: "git push się nie udał — zdjęcia są w commicie na komputerze, wyślij je przez git push.",
};

const MEDIA = "public/media/projects/";

/** → { changed: string[], committed, pushed, note? }   (cwd only for tests) */
export function publishMedia(slug, message, cwd = ROOT) {
  const g = (args, timeout) => git(args, timeout, cwd);
  const rel = `${MEDIA}${slug}`;
  const branch = g(["rev-parse", "--abbrev-ref", "HEAD"]);
  if (branch !== "main") return { changed: [], committed: false, pushed: false, note: REASON.branch };
  g(["add", "-A", "--", rel]);
  const changed = g(["diff", "--cached", "--name-only", "--", rel]).split(/\r?\n/).filter(Boolean);
  if (!changed.length) return { changed, committed: false, pushed: false, note: REASON.same };
  // "-- <path>" commits only this folder, whatever else is staged
  g(["commit", "--quiet", "-m", message, "--", rel]);
  try {
    g(["fetch", "--quiet", "origin", "main"]);
  } catch {
    return { changed, committed: true, pushed: false, note: REASON.offline };
  }
  if (Number(g(["rev-list", "--count", "HEAD..origin/main"])) > 0) return { changed, committed: true, pushed: false, note: REASON.behind };
  // unpushed commits that only hold project media (an earlier job without internet) may go along;
  // anything touching code waits for Claudio
  const unpushed = g(["rev-list", "origin/main..HEAD"]).split(/\r?\n/).filter(Boolean);
  const codeToo = unpushed.some((h) =>
    g(["diff-tree", "--no-commit-id", "--name-only", "-r", h])
      .split(/\r?\n/)
      .filter(Boolean)
      .some((f) => !f.startsWith(MEDIA)),
  );
  if (codeToo) return { changed, committed: true, pushed: false, note: REASON.others };
  try {
    g(["push", "--quiet", "origin", "HEAD:main"], 15 * 60_000);
  } catch (e) {
    return { changed, committed: true, pushed: false, note: `${REASON.failed} (${String(e.stderr || e.message).trim().split("\n").pop()?.slice(0, 160)})` };
  }
  return { changed, committed: true, pushed: true };
}

/** A changed picture that still exists, to recognise the new deployment by its exact size. */
export function probeFile(changed) {
  const files = changed.filter((f) => fs.existsSync(path.join(ROOT, f)));
  const pick = files.find((f) => /\/shots\/d01\.webp$/.test(f)) ?? files.find((f) => /\.(webp|png)$/.test(f)) ?? files[0];
  return pick ? { rel: pick, size: fs.statSync(path.join(ROOT, pick)).size } : null;
}

/** Waits until the live site serves the new file (Vercel builds a push in a few minutes). */
export async function waitLive(site, probe, ms = 15 * 60_000) {
  const url = `${site}/${probe.rel.replace(/^public\//, "").split("/").map(encodeURIComponent).join("/")}`;
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const res = await fetch(`${url}?live=${Date.now()}`, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
      if (res.ok && (await res.arrayBuffer()).byteLength === probe.size) return true;
    } catch {}
    await sleep(15_000);
  }
  return false;
}
