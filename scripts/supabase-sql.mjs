// One SQL file that sets up the whole Supabase database: tables + security + media bucket + every
// project, message and setting from the local store (.data/db.json). Paste it into Supabase → SQL
// Editor → Run. Safe to run again (rows are upserted by id, nothing is deleted).
//   npm run db:sql   →   supabase/pelna-instalacja.sql
import fs from "node:fs";

const db = JSON.parse(fs.readFileSync(new URL("../.data/db.json", import.meta.url), "utf8"));
const schema = fs.readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const out = new URL("../supabase/pelna-instalacja.sql", import.meta.url);

// dollar-quoted JSON: no escaping needed as long as the tag never occurs in the data
const TAG = "$ct_json$";
const json = (v) => {
  const s = JSON.stringify(v);
  if (s.includes(TAG)) throw new Error("the data contains the quoting tag");
  return `${TAG}${s}${TAG}::jsonb`;
};
const text = (s) => `'${String(s).replace(/'/g, "''")}'`;

const lines = [];
lines.push(`-- ================================================================================================
-- Portfolio Claudio Taras — PEŁNA INSTALACJA BAZY (Supabase)
-- Wygenerowano: ${new Date().toISOString().slice(0, 16).replace("T", " ")} z .data/db.json
--   projekty: ${db.projects.length} · wiadomości: ${db.messages.length} · ustawienia: 1
--
-- JAK UŻYĆ:
--   1. supabase.com → Twój projekt → SQL Editor → New query
--   2. wklej CAŁY ten plik → Run
--   3. Project Settings → API Keys: skopiuj Project URL i klucz "secret" (sb_secret_…)
--      albo w zakładce "Legacy API keys" klucz service_role (eyJ…)
--   4. w .env.local (i na Vercelu w Environment Variables) wpisz:
--        SUPABASE_URL=https://TWOJ-PROJEKT.supabase.co
--        SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
--   5. uruchom stronę ponownie — panel /admin/connect pokaże "Baza: Supabase ✓"
-- Można uruchomić ponownie: wiersze nadpisują się po id, nic nie jest kasowane.
-- ================================================================================================
`);
lines.push(schema.trim(), "");
lines.push("-- ------------------------------------------------------------------------------- dane: projekty");
db.projects.forEach((p, i) => {
  lines.push(
    `insert into public.projects (id, data, sort) values (${text(p.id)}, ${json(p)}, ${Number(p.order ?? i) || 0})\n  on conflict (id) do update set data = excluded.data, sort = excluded.sort, updated_at = now();`,
  );
});
lines.push("", "-- ------------------------------------------------------------------------------- dane: wiadomości z formularza");
for (const m of db.messages) {
  lines.push(`insert into public.messages (id, data, created_at) values (${text(m.id)}, ${json(m)}, ${text(m.createdAt)})\n  on conflict (id) do update set data = excluded.data;`);
}
lines.push("", "-- ------------------------------------------------------------------------------- dane: ustawienia strony");
lines.push(`insert into public.settings (id, data) values ('main', ${json(db.settings)})\n  on conflict (id) do update set data = excluded.data;`);
lines.push("", "-- gotowe ✓", "");
fs.writeFileSync(out, lines.join("\n"));
console.log(`supabase/pelna-instalacja.sql — ${db.projects.length} projektów, ${db.messages.length} wiadomości, ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
