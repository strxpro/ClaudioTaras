// Copies the local JSON store (.data/db.json) into Supabase tables created by supabase/schema.sql.
// usage: node --env-file=.env.local scripts/migrate-to-supabase.mjs
import fs from "node:fs";

const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.");
const db = JSON.parse(fs.readFileSync(".data/db.json", "utf8"));

async function upsert(table, rows) {
  if (!rows.length) return;
  const res = await fetch(`${url}/rest/v1/${table}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`);
  console.log(`${table}: ${rows.length} rows`);
}

await upsert("projects", db.projects.map((p) => ({ id: p.id, data: p, sort: p.order })));
await upsert("messages", db.messages.map((m) => ({ id: m.id, data: m, created_at: m.createdAt })));
await upsert("settings", [{ id: "main", data: db.settings }]);
