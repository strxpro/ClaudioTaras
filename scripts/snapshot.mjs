// Read-only data snapshot for a deployment without Supabase (Vercel: DB_FILE=deploy/db.json).
// Takes .data/db.json, keeps what the public site shows, drops visitors' messages and local-only fields.
// usage: npm run db:snapshot
import fs from "node:fs";
import path from "node:path";

const src = path.join(process.cwd(), ".data", "db.json");
const out = path.join(process.cwd(), "deploy", "db.json");
const db = JSON.parse(fs.readFileSync(src, "utf8"));
const projects = (db.projects ?? []).map((p) => {
  const { source, gatePassword, ...rest } = p; // source = folder on this computer; gate password = admin only
  void source;
  void gatePassword;
  return rest;
});
const snap = { projects, messages: [], settings: db.settings ?? {} };
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(snap, null, 2) + "\n");
console.log(`deploy/db.json: ${projects.length} projects, settings ${Object.keys(snap.settings).length} keys, no messages`);
