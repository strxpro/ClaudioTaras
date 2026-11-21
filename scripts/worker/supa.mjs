// Supabase for the worker: the same tables as src/lib/db.ts (projects, kv) over REST with the secret key.
const base = () => (process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
const key = () => process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
// apikey for both key kinds; only the legacy service_role JWT also goes as Bearer (sb_secret_ keys must not)
const auth = () => ({ apikey: key(), ...(key().startsWith("eyJ") ? { Authorization: `Bearer ${key()}` } : {}) });

export const ready = () => Boolean(base() && key());

async function rest(pathname, { method = "GET", body, prefer } = {}) {
  const res = await fetch(`${base()}/rest/v1/${pathname}`, {
    method,
    headers: { ...auth(), "Content-Type": "application/json", Prefer: prefer ?? "return=representation,resolution=merge-duplicates" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

const UPSERT = "return=minimal,resolution=merge-duplicates";

export const kv = {
  async get(id) {
    return (await rest(`kv?select=data&id=eq.${encodeURIComponent(id)}`))[0]?.data ?? null;
  },
  set: (id, data) => rest("kv", { method: "POST", body: { id, data, updated_at: new Date().toISOString() }, prefer: UPSERT }),
  del: (id) => rest(`kv?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", prefer: "return=minimal" }),
  /** rows whose id starts with `prefix` (PostgREST like, * = wildcard) */
  list: (prefix) => rest(`kv?select=id,data&id=like.${encodeURIComponent(prefix)}*`),
};

export const projects = {
  async all() {
    return (await rest("projects?select=id,data")).map((r) => r.data).sort((a, b) => a.order - b.order);
  },
  async save(p) {
    p.updatedAt = new Date().toISOString();
    await rest("projects", { method: "POST", body: { id: p.id, data: p, sort: p.order }, prefer: UPSERT });
  },
};

/** Same signal as db.ts announce(): open pages (site/live-updates.tsx) refresh themselves. */
export async function announce() {
  await fetch(`${base()}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: { ...auth(), "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ topic: "site", event: "changed", payload: { at: Date.now() } }] }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => {});
}
