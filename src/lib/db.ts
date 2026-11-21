/**
 * Data layer. Two interchangeable backends:
 *  - File store (default): `.data/db.json`, seeded on first run. Zero setup, ideal locally.
 *  - Supabase (when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set): tables from `supabase/schema.sql`.
 * Every read/write in the app goes through `db`, so switching backends needs no other change.
 */
import fs from "node:fs/promises";
import https from "node:https";
import { revalidatePath, revalidateTag } from "next/cache";
import path from "node:path";
import type { Database, Message, PageView, Project, Settings } from "./types";
import { seedDatabase } from "./seed";

// DB_FILE lets a read-only deployment (a Vercel preview without Supabase) ship its own snapshot
const DB_FILE = process.env.DB_FILE ? path.join(process.cwd(), process.env.DB_FILE) : path.join(process.cwd(), ".data", "db.json");
const DATA_DIR = path.dirname(DB_FILE);

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, "");
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const usingSupabase = Boolean(SUPABASE_URL && SUPABASE_KEY);
/** apikey for both key kinds; the legacy service_role JWT also goes as Bearer (new sb_secret_ keys must not) */
export const supabaseAuth = (key = SUPABASE_KEY ?? ""): Record<string, string> => ({ apikey: key, ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}) });

const byOrder = (a: Project, b: Project) => a.order - b.order;

/* ---------------------------------- file store ---------------------------------- */

let cache: Database | null = null;
let cacheMtime = 0;
let writing: Promise<void> = Promise.resolve();

/** Reads the JSON store, re-reading whenever the file changed (route handlers and pages can be separate module instances). */
async function readFileDb(): Promise<Database> {
  try {
    const { mtimeMs } = await fs.stat(DB_FILE);
    if (cache && mtimeMs === cacheMtime) return cache;
    cache = JSON.parse(await fs.readFile(DB_FILE, "utf8")) as Database;
    cacheMtime = mtimeMs;
  } catch {
    if (!cache) {
      cache = seedDatabase();
      await persist(cache);
    }
  }
  return cache!;
}

async function persist(data: Database) {
  cache = data;
  // Serialize writes; write to a temp file first so a crash never leaves a half-written DB.
  writing = writing.then(async () => {
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });
      const tmp = `${DB_FILE}.${process.pid}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
      await fs.rename(tmp, DB_FILE);
      cacheMtime = (await fs.stat(DB_FILE)).mtimeMs;
    } catch (e) {
      // read-only hosting without Supabase: keep the change in memory, never take the page down
      console.warn("[db] could not write", DB_FILE, (e as Error).message);
    }
  });
  return writing;
}

async function mutate(fn: (d: Database) => void) {
  const data = structuredClone(await readFileDb());
  fn(data);
  await persist(data);
}

/* ---------------------------------- supabase ---------------------------------- */

// The public pages are static (built once, served ready-made from the CDN, refreshed hourly). Supabase is
// called over plain https rather than fetch(): Next treats any uncached fetch as "render on every visit",
// which made each page wait ~1 s for the database. Every write to projects/settings re-renders the pages,
// so a change made in the admin or by the bot is live at once; the admin itself always reads fresh rows.
const PUBLIC_TABLES = /^(projects|settings)/;
function contentChanged() {
  try {
    revalidateTag("db", { expire: 0 });
  } catch {}
  try {
    revalidatePath("/", "layout");
  } catch {}
}

/** Topic of the live channel: open pages (site/live-updates.tsx) refresh themselves when it fires. */
export const LIVE_TOPIC = "site";

/**
 * Tells every open page that the content changed (Supabase Realtime broadcast, sent with the secret
 * key; visitors only listen with the publishable one). Never throws: a missed signal only means the
 * page shows the change on its next visit.
 */
async function announce() {
  try {
    const body = JSON.stringify({ messages: [{ topic: LIVE_TOPIC, event: "changed", payload: { at: Date.now() } }] });
    await request(`${SUPABASE_URL}/realtime/v1/api/broadcast`, "POST", { ...supabaseAuth(), "Content-Type": "application/json" }, body);
  } catch {}
}

async function sb<T>(pathname: string, init: RequestInit = {}): Promise<T> {
  const read = !init.method || init.method === "GET";
  const content = PUBLIC_TABLES.test(pathname);
  const out = await sbFetch<T>(pathname, init);
  if (!read && content) {
    contentChanged();
    await announce();
  }
  return out;
}

function request(url: string, method: string, headers: Record<string, string>, body?: BodyInit | null) {
  return new Promise<{ status: number; text: string }>((resolve, reject) => {
    if (typeof body === "string") headers["Content-Length"] = String(Buffer.byteLength(body));
    const req = https.request(url, { method, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString("utf8") }));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.setTimeout(15000, () => req.destroy(new Error("Supabase: timeout")));
    if (typeof body === "string") req.write(body);
    req.end();
  });
}

async function sbFetch<T>(pathname: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...supabaseAuth(),
    "Content-Type": "application/json",
    Prefer: "return=representation,resolution=merge-duplicates",
    ...(init.headers as Record<string, string> | undefined),
  };
  const res = await request(`${SUPABASE_URL}/rest/v1/${pathname}`, init.method ?? "GET", headers, init.body);
  if (res.status < 200 || res.status >= 300) throw new Error(`Supabase ${res.status}: ${res.text}`);
  return (res.text ? JSON.parse(res.text) : null) as T;
}

type Row<T> = { id: string; data: T };

/* ---------------------------------- public API ---------------------------------- */

export const db = {
  async projects(opts: { all?: boolean } = {}): Promise<Project[]> {
    let list: Project[];
    if (usingSupabase) {
      list = (await sb<Row<Project>[]>("projects?select=id,data")).map((r) => r.data);
    } else {
      list = structuredClone((await readFileDb()).projects);
    }
    return list.filter((p) => opts.all || p.published).sort(byOrder);
  },

  async project(slugOrId: string): Promise<Project | undefined> {
    return (await this.projects({ all: true })).find((p) => p.slug === slugOrId || p.id === slugOrId);
  },

  async saveProject(project: Project) {
    project.updatedAt = new Date().toISOString();
    if (usingSupabase) {
      await sb("projects", { method: "POST", body: JSON.stringify({ id: project.id, data: project, sort: project.order }) });
      return;
    }
    await mutate((d) => {
      const i = d.projects.findIndex((p) => p.id === project.id);
      if (i === -1) d.projects.push(project);
      else d.projects[i] = project;
    });
  },

  async deleteProject(id: string) {
    if (usingSupabase) {
      await sb(`projects?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
      return;
    }
    await mutate((d) => {
      d.projects = d.projects.filter((p) => p.id !== id);
    });
  },

  async reorder(ids: string[]) {
    const all = await this.projects({ all: true });
    for (const p of all) {
      const i = ids.indexOf(p.id);
      if (i > -1 && p.order !== i + 1) {
        p.order = i + 1;
        await this.saveProject(p);
      }
    }
  },

  async messages(): Promise<Message[]> {
    const list = usingSupabase
      ? (await sb<Row<Message>[]>("messages?select=id,data")).map((r) => r.data)
      : structuredClone((await readFileDb()).messages);
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async saveMessage(message: Message) {
    if (usingSupabase) {
      await sb("messages", { method: "POST", body: JSON.stringify({ id: message.id, data: message, created_at: message.createdAt }) });
      return;
    }
    await mutate((d) => {
      const i = d.messages.findIndex((m) => m.id === message.id);
      if (i === -1) d.messages.push(message);
      else d.messages[i] = message;
    });
  },

  async deleteMessage(id: string) {
    if (usingSupabase) {
      await sb(`messages?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
      return;
    }
    await mutate((d) => {
      d.messages = d.messages.filter((m) => m.id !== id);
    });
  },

  async settings(): Promise<Settings> {
    if (usingSupabase) {
      const rows = await sb<Row<Settings>[]>("settings?select=id,data&id=eq.main");
      return rows[0]?.data ?? seedDatabase().settings;
    }
    return structuredClone((await readFileDb()).settings);
  },

  async saveSettings(settings: Settings) {
    if (usingSupabase) {
      await sb("settings", { method: "POST", body: JSON.stringify({ id: "main", data: settings }) });
      return;
    }
    await mutate((d) => {
      d.settings = settings;
    });
  },
};

/* ---------------------------------- uploads ---------------------------------- */

export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");

const safeName = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(-80);

/** Stores an uploaded file and returns its public URL. */
export async function storeUpload(file: File, folder = "misc"): Promise<string> {
  const name = `${Date.now().toString(36)}-${safeName(file.name || "file")}`;
  const key = `${safeName(folder)}/${name}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  if (usingSupabase) {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/media/${key}`, {
      method: "POST",
      headers: {
        ...supabaseAuth(),
        "Content-Type": file.type || "application/octet-stream",
        "x-upsert": "true",
      },
      body: bytes,
    });
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
    return `${SUPABASE_URL}/storage/v1/object/public/media/${key}`;
  }
  await fs.mkdir(path.join(UPLOAD_DIR, safeName(folder)), { recursive: true });
  await fs.writeFile(path.join(UPLOAD_DIR, key), bytes);
  return `/uploads/${key}`;
}

/* ---------------------------------- key/value ---------------------------------- */
// Small state that isn't content: pending bot confirmations, the last change for "undo", …
// File store: .data/kv.json · Supabase: table `kv` (see supabase/schema.sql).

const KV_FILE = path.join(DATA_DIR, "kv.json");

async function kvFile(): Promise<Record<string, { data: unknown; at: number }>> {
  try {
    return JSON.parse(await fs.readFile(KV_FILE, "utf8"));
  } catch {
    return {};
  }
}

export const kv = {
  async get<T>(key: string): Promise<T | null> {
    if (usingSupabase) {
      const rows = await sb<Row<T>[]>(`kv?select=id,data&id=eq.${encodeURIComponent(key)}`);
      return rows[0]?.data ?? null;
    }
    return ((await kvFile())[key]?.data as T) ?? null;
  },
  async set(key: string, data: unknown) {
    if (usingSupabase) {
      await sb("kv", { method: "POST", body: JSON.stringify({ id: key, data }) });
      return;
    }
    const all = await kvFile();
    all[key] = { data, at: Date.now() };
    // keep it small: drop entries older than 7 days
    for (const [k, v] of Object.entries(all)) if (Date.now() - v.at > 7 * 86400_000) delete all[k];
    await fs.mkdir(DATA_DIR, { recursive: true });
    const tmp = `${KV_FILE}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(all), "utf8");
    await fs.rename(tmp, KV_FILE);
  },
  /** Every entry whose key starts with `prefix` (e.g. the computer's jobs, "job:"). */
  async list<T>(prefix: string): Promise<{ id: string; data: T }[]> {
    if (usingSupabase) return sb<Row<T>[]>(`kv?select=id,data&id=like.${encodeURIComponent(prefix)}*`);
    return Object.entries(await kvFile())
      .filter(([k]) => k.startsWith(prefix))
      .map(([id, v]) => ({ id, data: v.data as T }));
  },
  async del(key: string) {
    if (usingSupabase) {
      await sb(`kv?id=eq.${encodeURIComponent(key)}`, { method: "DELETE" });
      return;
    }
    const all = await kvFile();
    delete all[key];
    await fs.writeFile(KV_FILE, JSON.stringify(all), "utf8");
  },
};

/* ---------------------------------- analytics ---------------------------------- */
// Anonymous page views. File store: .data/views.json (last 50 000) · Supabase: table `page_views`.

const VIEWS_FILE = path.join(DATA_DIR, "views.json");
let viewsWrite: Promise<void> = Promise.resolve();

export type ViewStats = {
  days: number;
  views: number;
  visitors: number;
  today: { views: number; visitors: number };
  byDay: { date: string; views: number; visitors: number }[];
  topPaths: { path: string; views: number }[];
  countries: { country: string; views: number }[];
  devices: { device: string; views: number }[];
  referrers: { host: string; views: number }[];
};

export const analytics = {
  async track(v: PageView) {
    if (usingSupabase) {
      await sb("page_views", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(v) });
      return;
    }
    viewsWrite = viewsWrite.then(async () => {
      let list: PageView[] = [];
      try {
        list = JSON.parse(await fs.readFile(VIEWS_FILE, "utf8"));
      } catch {}
      list.push(v);
      if (list.length > 50_000) list = list.slice(-50_000);
      await fs.mkdir(DATA_DIR, { recursive: true });
      const tmp = `${VIEWS_FILE}.${process.pid}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(list), "utf8");
      await fs.rename(tmp, VIEWS_FILE);
    });
    return viewsWrite;
  },

  async stats(days = 30): Promise<ViewStats> {
    const since = new Date(Date.now() - days * 86400_000);
    since.setHours(0, 0, 0, 0);
    let list: PageView[] = [];
    if (usingSupabase) {
      list = await sb<PageView[]>(`page_views?select=at,path,locale,country,device,referrer,visitor&at=gte.${since.toISOString()}&order=at.asc&limit=50000`);
    } else {
      try {
        list = (JSON.parse(await fs.readFile(VIEWS_FILE, "utf8")) as PageView[]).filter((v) => v.at >= since.toISOString());
      } catch {}
    }
    const day = (iso: string) => iso.slice(0, 10);
    const todayKey = day(new Date().toISOString());
    const byDay = new Map<string, { views: number; visitors: Set<string> }>();
    for (let i = days; i >= 0; i--) byDay.set(day(new Date(Date.now() - i * 86400_000).toISOString()), { views: 0, visitors: new Set() });
    const count = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
    const paths = new Map<string, number>();
    const countries = new Map<string, number>();
    const devices = new Map<string, number>();
    const refs = new Map<string, number>();
    const all = new Set<string>();
    for (const v of list) {
      const d = byDay.get(day(v.at));
      if (d) {
        d.views++;
        d.visitors.add(v.visitor);
      }
      all.add(`${day(v.at)}:${v.visitor}`);
      count(paths, v.path.replace(/^\/[a-z]{2}(?=\/|$)/, "") || "/");
      if (v.country) count(countries, v.country);
      count(devices, v.device);
      if (v.referrer) count(refs, v.referrer);
    }
    const top = <K extends string>(m: Map<string, number>, key: K, n = 8) =>
      [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, views]) => ({ [key]: k, views }) as Record<K, string> & { views: number });
    const t = byDay.get(todayKey);
    return {
      days,
      views: list.length,
      visitors: all.size,
      today: { views: t?.views ?? 0, visitors: t?.visitors.size ?? 0 },
      byDay: [...byDay.entries()].map(([date, d]) => ({ date, views: d.views, visitors: d.visitors.size })),
      topPaths: top(paths, "path"),
      countries: top(countries, "country"),
      devices: top(devices, "device", 3),
      referrers: top(refs, "host"),
    };
  },
};
