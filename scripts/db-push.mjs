// Copy the local store (.data/db.json) into Supabase: projects, messages and settings.
// Run once after creating the tables:  npm run db:push   (reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local)
// Safe to run again: rows are upserted by id, nothing is deleted.
import fs from "node:fs/promises";

const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Brak SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY w .env.local");
  process.exit(1);
}

const db = JSON.parse(await fs.readFile(new URL("../.data/db.json", import.meta.url), "utf8"));

async function upsert(table, rows) {
  if (!rows.length) return;
  const res = await fetch(`${url}/rest/v1/${table}`, {
    method: "POST",
    headers: { apikey: key, ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}), "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`);
  console.log(`✓ ${table}: ${rows.length}`);
}

await upsert("projects", db.projects.map((p) => ({ id: p.id, data: p, sort: p.order ?? 0 })));
await upsert("messages", db.messages.map((m) => ({ id: m.id, data: m, created_at: m.createdAt })));
await upsert("settings", [{ id: "main", data: db.settings }]);
console.log("Gotowe. Media (zdjęcia/wideo w public/media) zostają w projekcie i jadą razem z nim na Vercel.");
