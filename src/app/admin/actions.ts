"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { checkPassword, createToken, requireAdmin, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { db, storeUpload } from "@/lib/db";
import { fillTranslations } from "@/lib/copywriter";
import { findMessage, polishReply, replyToClient } from "@/lib/replies";
import { translateAll } from "@/lib/ai";
import { getDictionary } from "@/lib/dict";
import { flatten } from "@/lib/dict/overrides";
import { isLocale, locales } from "@/lib/i18n";
import type { MessageStatus, Project, Settings } from "@/lib/types";

const refresh = () => revalidatePath("/", "layout");

/* ------------------------------ auth ------------------------------ */

const attempts = new Map<string, number[]>();

export async function login(_: unknown, formData: FormData) {
  const key = "admin";
  const now = Date.now();
  const recent = (attempts.get(key) ?? []).filter((t) => now - t < 15 * 60_000);
  if (recent.length >= 8) return { error: "Za dużo prób. Spróbuj za 15 minut." };
  const password = String(formData.get("password") ?? "");
  if (!checkPassword(password)) {
    attempts.set(key, [...recent, now]);
    await new Promise((r) => setTimeout(r, 600));
    return { error: "Nieprawidłowe hasło." };
  }
  attempts.delete(key);
  (await cookies()).set(SESSION_COOKIE, createToken(), sessionCookieOptions);
  redirect("/admin");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/admin/login");
}

/* ------------------------------ projects ------------------------------ */

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

export async function saveProject(project: Project) {
  await requireAdmin();
  if (!project.name.trim()) return { error: "Nazwa jest wymagana." };
  project.slug = slugify(project.slug || project.name) || `projekt-${Date.now()}`;
  const all = await db.projects({ all: true });
  const clash = all.find((p) => p.slug === project.slug && p.id !== project.id);
  if (clash) return { error: `Adres „${project.slug}” jest już zajęty przez „${clash.name}”.` };
  if (!all.some((p) => p.id === project.id)) project.order = all.length + 1;
  // empty languages are translated automatically (AI) — saving never fails because of it
  let filled = 0;
  try {
    const r = await fillTranslations(project);
    project = r.project;
    filled = r.filled;
  } catch {}
  await db.saveProject(project);
  refresh();
  return { ok: true, slug: project.slug, filled };
}

export async function deleteProject(id: string) {
  await requireAdmin();
  await db.deleteProject(id);
  refresh();
  redirect("/admin/projects");
}

export async function moveProject(id: string, dir: -1 | 1) {
  await requireAdmin();
  const all = await db.projects({ all: true });
  const i = all.findIndex((p) => p.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= all.length) return;
  [all[i], all[j]] = [all[j], all[i]];
  await db.reorder(all.map((p) => p.id));
  refresh();
}

/** Quick switch from the projects list: give a demo its live address (→ status "live"), or take it away. */
export async function setProjectUrl(id: string, raw: string) {
  await requireAdmin();
  const p = await db.project(id);
  if (!p) return { error: "Nie ma takiego projektu." };
  const url = raw.trim();
  if (url && !/^https?:\/\/[^\s.]+\.[^\s]+$/.test(url)) return { error: "Adres musi zaczynać się od https://" };
  p.url = url || undefined;
  if (url) p.status = "live";
  else if (p.status === "live") p.status = "local";
  await db.saveProject(p);
  refresh();
  return { ok: true };
}

export async function toggleProject(id: string, field: "published" | "featured") {
  await requireAdmin();
  const p = await db.project(id);
  if (!p) return;
  p[field] = !p[field];
  await db.saveProject(p);
  refresh();
}

export async function uploadMedia(formData: FormData) {
  await requireAdmin();
  const file = formData.get("file");
  const folder = String(formData.get("folder") ?? "misc");
  if (!(file instanceof File) || file.size === 0) return { error: "Brak pliku." };
  if (file.size > 60 * 1024 * 1024) return { error: "Plik jest za duży (maks. 60 MB)." };
  if (!/^(image|video)\//.test(file.type)) return { error: "Dozwolone są tylko obrazy i wideo." };
  return { url: await storeUpload(file, folder) };
}

/* ------------------------------ messages ------------------------------ */

export async function setMessageStatus(id: string, status: MessageStatus) {
  await requireAdmin();
  const m = (await db.messages()).find((x) => x.id === id);
  if (!m) return;
  m.status = status;
  await db.saveMessage(m);
  revalidatePath("/admin", "layout");
}

export async function saveMessageNotes(id: string, notes: string) {
  await requireAdmin();
  const m = (await db.messages()).find((x) => x.id === id);
  if (!m) return;
  m.notes = notes.slice(0, 5000);
  await db.saveMessage(m);
  revalidatePath("/admin", "layout");
}

export async function replyMessage(id: string, text: string) {
  await requireAdmin();
  try {
    const { emailed } = await replyToClient(id, text, "admin");
    revalidatePath("/admin", "layout");
    return { ok: true, emailed };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function polishMessageReply(id: string, draft: string) {
  await requireAdmin();
  const m = await findMessage(id);
  if (!m || !draft.trim()) return { error: "Napisz najpierw kilka słów." };
  try {
    return { text: await polishReply(m, draft) };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function deleteMessage(id: string) {
  await requireAdmin();
  await db.deleteMessage(id);
  revalidatePath("/admin", "layout");
  redirect("/admin/messages");
}

/* ------------------------------ settings ------------------------------ */

export async function saveSettings(settings: Settings) {
  await requireAdmin();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.email)) return { error: "Nieprawidłowy e-mail." };
  settings.socials = settings.socials.filter((s) => s.label.trim() && s.url.trim());
  settings.phones = (settings.phones ?? []).map((p) => ({ label: p.label.trim().slice(0, 12), number: p.number.trim().slice(0, 32) })).filter((p) => /\d{6,}/.test(p.number.replace(/\D/g, "")));
  if (settings.phones[0]) settings.phone = settings.phones[0].number;
  // site texts have their own editor: never overwrite them with a stale copy from this form
  settings.copy = (await db.settings()).copy;
  await db.saveSettings(settings);
  refresh();
  return { ok: true };
}

/* ------------------------------ site copy ------------------------------ */

export async function saveCopy(locale: string, edits: Record<string, string>, translate: boolean) {
  await requireAdmin();
  if (!isLocale(locale)) return { error: "Nieznany język." };
  const base = new Map(flatten(getDictionary(locale)));
  // keep only real fields whose text differs from the built-in one
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(edits)) {
    const t = String(v ?? "").slice(0, 3000);
    if (base.has(k) && t.trim() && t !== base.get(k)) clean[k] = t;
  }
  const settings = await db.settings();
  const copy = { ...(settings.copy ?? {}) };
  const prev = copy[locale] ?? {};
  const changed = Object.keys(clean).filter((k) => clean[k] !== prev[k]);
  const removed = Object.keys(prev).filter((k) => !(k in clean));
  copy[locale] = clean;

  let translated = 0;
  if (translate && (changed.length || removed.length)) {
    for (const l of locales) {
      if (l === locale) continue;
      const other = { ...(copy[l] ?? {}) };
      for (const k of removed) delete other[k];
      copy[l] = other;
    }
    try {
      for (let i = 0; i < changed.length; i += 20) {
        const chunk = changed.slice(i, i + 20);
        const tr = await translateAll(Object.fromEntries(chunk.map((k) => [k, clean[k]])), locale);
        for (const k of chunk)
          for (const l of locales) {
            if (l === locale || !tr[k]?.[l]) continue;
            copy[l] = { ...(copy[l] ?? {}), [k]: tr[k][l] };
          }
        translated += chunk.length;
      }
    } catch (e) {
      settings.copy = copy;
      await db.saveSettings(settings);
      refresh();
      return { ok: true, translated, warning: `Zapisane, ale tłumaczenie przerwane: ${(e as Error).message}` };
    }
  }
  settings.copy = copy;
  await db.saveSettings(settings);
  refresh();
  return { ok: true, translated, count: Object.keys(clean).length };
}
