/**
 * Site copy edited from the admin panel ("Teksty strony"). The built-in dictionaries stay the
 * source of truth; edits are stored as a flat map of paths → text, e.g.
 *   { "story.problem.body": "…", "story.contact.opts1.2": "…" }
 * and laid over the dictionary at request time. Only existing string leaves can be overridden, so
 * a stale path (after a copy refactor) is simply ignored.
 */
export type CopyOverrides = Record<string, string>;

/** Every string leaf of a dictionary as [path, text], arrays included ("a.b.0"). */
export function flatten(obj: unknown, prefix = ""): [string, string][] {
  if (typeof obj === "string") return [[prefix, obj]];
  if (Array.isArray(obj)) return obj.flatMap((v, i) => flatten(v, prefix ? `${prefix}.${i}` : String(i)));
  if (obj && typeof obj === "object") return Object.entries(obj).flatMap(([k, v]) => flatten(v, prefix ? `${prefix}.${k}` : k));
  return [];
}

export function applyCopy<T>(dict: T, over: CopyOverrides): T {
  const out = structuredClone(dict) as Record<string, unknown>;
  for (const [path, text] of Object.entries(over)) {
    if (typeof text !== "string" || !text.trim()) continue;
    const keys = path.split(".");
    let node: unknown = out;
    for (const k of keys.slice(0, -1)) node = node && typeof node === "object" ? (node as Record<string, unknown>)[k] : undefined;
    const last = keys[keys.length - 1];
    if (node && typeof node === "object" && typeof (node as Record<string, unknown>)[last] === "string") (node as Record<string, unknown>)[last] = text;
  }
  return out as T;
}
