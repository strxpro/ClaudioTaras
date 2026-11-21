// Where to record from: a link, or a folder on this computer. Claudio often speaks to the bot, so the
// transcript says "F hotel" for F:\hotel or "santa teresa" for "F:\santa teresa gallura": folders are
// matched loosely, one level at a time, and the worker says which folder it really used.
import fs from "node:fs";
import path from "node:path";

const norm = (s) =>
  String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");

const isDir = (p) => {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
};

const dirs = (p) => {
  try {
    return fs
      .readdirSync(p, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !/^(\$|System Volume Information$|node_modules$|\.)/.test(d.name))
      .map((d) => d.name);
  } catch {
    return [];
  }
};

/** Same place? (folder paths and links compared loosely: case, slashes, https://www.) */
export function samePlace(a, b) {
  if (!a || !b) return false;
  const k = (s) =>
    String(s)
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\/(www\.)?/, "")
      .replace(/\//g, "\\")
      .replace(/[\\]+$/, "");
  return k(a) === k(b);
}

/**
 * → { source, isFolder, note? }. Throws an Error with a Polish message the bot can show as it is.
 */
export function resolveSource(input) {
  let s = String(input ?? "")
    .trim()
    .replace(/^["'„”“]+|["'„”“]+$/g, "")
    .trim();
  if (!s) throw new Error("Nie wiem, skąd nagrać — podaj link do strony albo folder, np. F:\\hotel.");
  if (/^https?:\/\//i.test(s)) return { source: s, isFolder: false };
  // "villadea.it" / "www.villadea.it/it" said without https://
  if (/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(s) && !/[\\]/.test(s)) return { source: `https://${s}`, isFolder: false };

  // "F:\hotel" · "F:hotel" · "f:/hotel" · "F hotel" · "dysk F hotel"
  // spoken filler before the path: "w pliku F hotel", "z folderu F:\Luma", "nella cartella …"
  s = s
    .replace(/^((w|we|z|ze|na|in|from|nel|nella|dal|dalla|dalla)\s+)?(pliku|plik|folderze|folderu|folder|katalogu|katalog|dysku|dysk|drive|disco|cartella|file|directory)\s+/i, "")
    .replace(/\//g, "\\");
  const m = s.match(/^([a-z])(?:\s*:\s*\\?|\s*\\|\s+)(.*)$/i);
  if (!m) {
    // just a name ("hotel"): look for it at the top of the data drives (F: first, never C:)
    const found = [];
    for (const d of ["F", "D", "E", "G", "H"]) {
      if (!isDir(`${d}:\\`)) continue;
      try {
        found.push(resolveSource(`${d}:\\${s}`));
      } catch {}
    }
    if (found.length === 1) return { ...found[0], note: `Folder: ${found[0].source}` };
    throw new Error(
      found.length > 1
        ? `„${s}” jest w kilku miejscach: ${found.map((f) => f.source).join(", ")} — który?`
        : `„${s}” to ani link, ani folder, który znam. Podaj np. F:\\hotel albo https://…`,
    );
  }
  const drive = `${m[1].toUpperCase()}:\\`;
  if (!isDir(drive)) throw new Error(`Na tym komputerze nie ma dysku ${drive}`);
  const parts = m[2].split("\\").map((x) => x.trim()).filter(Boolean);

  let cur = drive;
  for (const part of parts) {
    const exact = path.join(cur, part);
    if (isDir(exact)) {
      cur = exact;
      continue;
    }
    const all = dirs(cur);
    const want = norm(part);
    const same = all.filter((d) => norm(d) === want);
    const near = same.length
      ? same
      : all.filter((d) => want.length >= 3 && (norm(d).startsWith(want) || norm(d).includes(want) || (norm(d).length >= 4 && want.includes(norm(d)))));
    if (near.length === 1) {
      cur = path.join(cur, near[0]);
      continue;
    }
    const hint = (near.length ? near : all.filter((d) => norm(d)[0] === want[0])).slice(0, 6);
    throw new Error(
      near.length > 1
        ? `W ${cur} pasuje kilka folderów: ${near.slice(0, 6).join(", ")} — który?`
        : `Nie znalazłem folderu „${part}” w ${cur}.${hint.length ? ` Może: ${hint.join(", ")}?` : ""}`,
    );
  }
  if (cur === drive) throw new Error(`Podaj folder projektu na dysku ${drive}, nie cały dysk.`);
  try {
    cur = fs.realpathSync.native(cur); // the folder's real spelling ("F:\luma" → "F:\Luma")
  } catch {}
  const literal = path.join(drive, ...parts);
  return { source: cur, isFolder: true, note: cur.toLowerCase() !== literal.toLowerCase() ? `Folder: ${cur}` : undefined };
}
