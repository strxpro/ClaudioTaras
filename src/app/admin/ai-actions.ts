"use server";

import { requireAdmin } from "@/lib/auth";
import { aiProviders, translateAll } from "@/lib/ai";
import { writeProjectCopy } from "@/lib/copywriter";
import type { L10n, Locale } from "@/lib/i18n";
import type { Project } from "@/lib/types";

/** "🌐 Przetłumacz": one text → all six languages. */
export async function aiTranslate(text: string, from: Locale): Promise<{ value?: L10n; error?: string }> {
  await requireAdmin();
  try {
    const out = await translateAll({ t: text.slice(0, 4000) }, from);
    return { value: out.t };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** "✨ Napisz teksty AI": fresh, house-style copy for the project in all languages (not saved yet). */
export async function aiWriteProject(project: Project, note?: string) {
  await requireAdmin();
  try {
    return { copy: await writeProjectCopy(project, note) };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function aiStatus() {
  await requireAdmin();
  return aiProviders();
}
