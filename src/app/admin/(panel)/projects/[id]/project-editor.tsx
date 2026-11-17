"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { L10n } from "@/lib/i18n";
import { categories, statuses, type Project } from "@/lib/types";
import { deleteProject, saveProject } from "../../../actions";
import { startImport } from "../../../import-actions";
import { aiWriteProject } from "../../../ai-actions";
import { ImportProgress } from "../../importer";
import { Card, Field, LocaleInput, MediaInput, Toggle, inputCls } from "../../ui";

type Preview = { shots: string[]; clips: number; logo: string | null; logoTone: string | null } | null;

const catLabel: Record<string, string> = { website: "Strona", ecommerce: "E-commerce", webapp: "Aplikacja webowa", software: "Oprogramowanie", event: "Wydarzenie" };
const statusLabel: Record<string, string> = { live: "Online", local: "Lokalny", private: "Prywatny", wip: "W trakcie realizacji" };

export function ProjectEditor({ initial, isNew, preview }: { initial: Project; isNew: boolean; preview: Preview }) {
  const [p, setP] = useState<Project>(initial);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [job, setJob] = useState<string | null>(null);
  const router = useRouter();
  const up = <K extends keyof Project>(k: K, v: Project[K]) => setP((x) => ({ ...x, [k]: v }));
  const upMedia = (k: keyof Project["media"], v: string) => setP((x) => ({ ...x, media: { ...x.media, [k]: v } }));

  const save = () =>
    start(async () => {
      const res = await saveProject(p);
      if (res.error) setMsg({ type: "err", text: res.error });
      else {
        setMsg({ type: "ok", text: res.filled ? `Zapisano. Przetłumaczyłem brakujące języki (${res.filled}).` : "Zapisano. Strona została odświeżona." });
        if (isNew) router.replace(`/admin/projects/${p.id}`);
        else router.refresh();
      }
    });

  // fresh house-style copy in all six languages (applied to the form; saving is up to you)
  const write = () =>
    start(async () => {
      setMsg({ type: "ok", text: "AI pisze teksty w 6 językach…" });
      const res = await aiWriteProject(p);
      if (res.error || !res.copy) return setMsg({ type: "err", text: res.error ?? "AI nie odpowiedziało." });
      const { by, ...copy } = res.copy;
      setP((x) => ({ ...x, ...copy }));
      setMsg({ type: "ok", text: `Nowe teksty gotowe (${by}). Sprawdź i zapisz.` });
    });

  // re-run the automatic import for this project: fresh video, screenshots, logo, clips (texts you wrote stay)
  const refresh = () => {
    const source = p.source || p.url || window.prompt("Skąd odświeżyć? Wklej link do strony albo ścieżkę folderu projektu:") || "";
    if (!source.trim()) return;
    start(async () => {
      const res = await startImport({ source, publish: p.published, deploy: false, projectId: p.id });
      if (res.error) setMsg({ type: "err", text: res.error });
      else if (res.id) setJob(res.id);
    });
  };

  return (
    <div className="mx-auto max-w-5xl pb-32">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/admin/projects" className="text-sm text-ink/60 hover:text-ink">
            ← Projekty
          </Link>
          <h1 className="display mt-2 text-4xl md:text-5xl">{p.name || "Nowy projekt"}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {!isNew ? (
            <button type="button" onClick={refresh} disabled={pending || !!job} className="rounded-full bg-ink px-4 py-2 text-sm text-bone disabled:opacity-50">
              ↻ Odśwież automatycznie
            </button>
          ) : null}
          {!isNew && p.published ? (
            <a href={`/pl/work/${p.slug}`} target="_blank" className="rounded-full border border-ink/15 px-4 py-2 text-sm">
              Podgląd na stronie ↗
            </a>
          ) : null}
        </div>
      </div>
      {job ? (
        <div className="mb-5">
          <ImportProgress id={job} light onClose={() => setJob(null)} />
        </div>
      ) : null}
      {preview && preview.shots.length ? (
        <div className="mb-5 rounded-2xl bg-white p-5 md:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">
              Media <span className="text-sm font-normal text-ink/50">· {preview.shots.length} zrzutów · {preview.clips} klipów — tworzone automatycznie</span>
            </h2>
            {preview.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview.logo} alt="Logo" className={`h-10 w-auto rounded px-3 py-1.5 ${preview.logoTone === "dark" ? "bg-bone" : "bg-ink"}`} />
            ) : null}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {preview.shots.map((s) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={s} src={s} alt="" loading="lazy" className="h-24 w-auto shrink-0 rounded-md border border-ink/10 object-cover object-top" />
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid gap-5">
        <Card title="Podstawowe informacje">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Nazwa projektu *">
              <input value={p.name} onChange={(e) => up("name", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Adres (slug)" hint={`/work/${p.slug || "…"} — zostaw puste, utworzy się z nazwy`}>
              <input value={p.slug} onChange={(e) => up("slug", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Klient">
              <input value={p.client} onChange={(e) => up("client", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Lokalizacja">
              <input value={p.location} onChange={(e) => up("location", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Rok">
              <input type="number" value={p.year} onChange={(e) => up("year", Number(e.target.value))} className={inputCls} />
            </Field>
            <Field label="Adres strony (URL)" hint="Pusty = projekt lokalny / demo na życzenie">
              <input value={p.url ?? ""} onChange={(e) => up("url", e.target.value)} className={inputCls} placeholder="https://…" />
            </Field>
            <Field label="Kategoria">
              <select value={p.category} onChange={(e) => up("category", e.target.value as Project["category"])} className={inputCls}>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {catLabel[c]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select value={p.status} onChange={(e) => up("status", e.target.value as Project["status"])} className={inputCls}>
                {statuses.map((c) => (
                  <option key={c} value={c}>
                    {statusLabel[c]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Kolor projektu" hint="Tło rozdziału w showcase i nagłówka case study">
              <div className="flex gap-2">
                <input type="color" value={p.accent} onChange={(e) => up("accent", e.target.value)} className="h-11 w-14 cursor-pointer rounded-lg border border-ink/15" />
                <input value={p.accent} onChange={(e) => up("accent", e.target.value)} className={inputCls} />
              </div>
            </Field>
            <Field label="Technologie" hint="Oddzielone przecinkami, np. Next.js, GSAP, Supabase">
              <input
                value={p.stack.join(", ")}
                onChange={(e) => up("stack", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
                className={inputCls}
              />
            </Field>
          </div>
          <div className="flex flex-wrap gap-6 pt-2">
            <Toggle checked={p.published} onChange={(v) => up("published", v)} label="Opublikowany" />
            <Toggle checked={p.featured} onChange={(v) => up("featured", v)} label="Wyróżniony (showcase)" />
            <Toggle checked={!!p.locked} onChange={(v) => up("locked", v)} label="Strona na hasło (pokaż informację)" />
          </div>
          {p.locked ? (
            <Field label="Hasło do podglądu strony" hint="Tylko do automatycznych zrzutów: import wpisze je na stronie i zrobi zdjęcia tego, co za nim. Nigdy nie pokazuje się publicznie.">
              <input type="password" autoComplete="off" value={p.gatePassword ?? ""} onChange={(e) => up("gatePassword", e.target.value)} className={inputCls} placeholder="hasło strony" />
            </Field>
          ) : null}
        </Card>

        <Card
          title="Treści"
          desc="Każde pole w 6 językach. Puste języki tłumaczą się same przy zapisie; „🌐 przetłumacz” robi to od razu z otwartej zakładki."
          aside={
            !isNew ? (
              <button type="button" onClick={write} disabled={pending} className="shrink-0 rounded-full bg-acid px-4 py-2 text-xs font-semibold text-ink disabled:opacity-50">
                ✨ Napisz teksty AI
              </button>
            ) : null
          }
        >
          <LocaleInput label="Hasło (tagline)" value={p.tagline} onChange={(v) => up("tagline", v)} />
          <LocaleInput label="Opis" value={p.summary} onChange={(v) => up("summary", v)} area rows={4} />
          <LocaleInput label="Wyzwanie" value={p.challenge} onChange={(v) => up("challenge", v)} area />
          <LocaleInput label="Rozwiązanie" value={p.solution} onChange={(v) => up("solution", v)} area />
          <LocaleInput label="Moja rola" value={p.role} onChange={(v) => up("role", v)} />
        </Card>

        <Card
          title="Funkcje"
          aside={
            <button type="button" onClick={() => up("features", [...p.features, {}])} className="rounded-full bg-ink px-3 py-1.5 text-xs text-bone">
              + Dodaj
            </button>
          }
        >
          {p.features.length === 0 ? <p className="text-sm text-ink/50">Brak funkcji.</p> : null}
          {p.features.map((f, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="flex-1">
                <LocaleInput label={`Funkcja ${i + 1}`} value={f} onChange={(v: L10n) => up("features", p.features.map((x, j) => (j === i ? v : x)))} />
              </div>
              <button type="button" onClick={() => up("features", p.features.filter((_, j) => j !== i))} className="mb-1 rounded-lg px-3 py-2 text-sm text-ember hover:bg-ember/10">
                Usuń
              </button>
            </div>
          ))}
        </Card>

        <Card
          title="Liczby"
          desc="Np. „9.8” — ocena na Booking.com. Wpisuj tylko prawdziwe dane."
          aside={
            <button type="button" onClick={() => up("results", [...p.results, { value: "", label: {} }])} className="rounded-full bg-ink px-3 py-1.5 text-xs text-bone">
              + Dodaj
            </button>
          }
        >
          {p.results.map((r, i) => (
            <div key={i} className="grid items-end gap-2 md:grid-cols-[140px_1fr_auto]">
              <Field label="Wartość">
                <input value={r.value} onChange={(e) => up("results", p.results.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} className={inputCls} />
              </Field>
              <LocaleInput label="Opis" value={r.label} onChange={(v) => up("results", p.results.map((x, j) => (j === i ? { ...x, label: v } : x)))} />
              <button type="button" onClick={() => up("results", p.results.filter((_, j) => j !== i))} className="mb-1 rounded-lg px-3 py-2 text-sm text-ember hover:bg-ember/10">
                Usuń
              </button>
            </div>
          ))}
        </Card>

        <details className="group rounded-2xl bg-white">
          <summary className="cursor-pointer list-none p-5 text-lg font-semibold md:px-6">
            Pliki ręcznie (zaawansowane) <span className="text-sm font-normal text-ink/50">— zwykle niepotrzebne, import robi to sam</span>
          </summary>
          <div className="grid gap-5 px-2 pb-2">
        <Card
          title="Media — podglądy wideo"
          desc="WebM (VP9) + MP4 jako zapas dla Safari. Plakat (WebP) wyświetla się zanim wideo się załaduje."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <MediaInput label="Desktop — WebM" kind="video" folder={p.slug || "projects"} value={p.media.desktopWebm} onChange={(v) => upMedia("desktopWebm", v)} />
            <MediaInput label="Telefon — WebM" kind="video" folder={p.slug || "projects"} value={p.media.mobileWebm} onChange={(v) => upMedia("mobileWebm", v)} />
            <MediaInput label="Desktop — MP4" kind="video" folder={p.slug || "projects"} value={p.media.desktopMp4} onChange={(v) => upMedia("desktopMp4", v)} />
            <MediaInput label="Telefon — MP4" kind="video" folder={p.slug || "projects"} value={p.media.mobileMp4} onChange={(v) => upMedia("mobileMp4", v)} />
            <MediaInput label="Desktop — plakat" folder={p.slug || "projects"} value={p.media.desktopPoster} onChange={(v) => upMedia("desktopPoster", v)} />
            <MediaInput label="Telefon — plakat" folder={p.slug || "projects"} value={p.media.mobilePoster} onChange={(v) => upMedia("mobilePoster", v)} />
          </div>
        </Card>

        <Card
          title="Galeria — dodatkowe ekrany"
          desc="Dodatkowe ekrany, np. panel admina — pokażą się w grupie „Panel i dodatki”. Zrzuty sekcji, podstron i telefonu robi import automatycznie."
          aside={
            <button type="button" onClick={() => setP((x) => ({ ...x, media: { ...x.media, gallery: [...(x.media.gallery ?? []), ""] } }))} className="rounded-full bg-ink px-3 py-1.5 text-xs text-bone">
              + Dodaj
            </button>
          }
        >
          {(p.media.gallery ?? []).length === 0 ? <p className="text-sm text-ink/50">Brak dodatkowych zrzutów.</p> : null}
          {(p.media.gallery ?? []).map((g, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="flex-1">
                <MediaInput
                  label={`Ekran ${i + 1}`}
                  folder={p.slug || "projects"}
                  value={g}
                  onChange={(v) => setP((x) => ({ ...x, media: { ...x.media, gallery: (x.media.gallery ?? []).map((y, j) => (j === i ? v : y)) } }))}
                />
              </div>
              <button
                type="button"
                onClick={() => setP((x) => ({ ...x, media: { ...x.media, gallery: (x.media.gallery ?? []).filter((_, j) => j !== i) } }))}
                className="mt-7 rounded-lg px-3 py-2 text-sm text-ember hover:bg-ember/10"
              >
                Usuń
              </button>
            </div>
          ))}
        </Card>

          </div>
        </details>

        {!isNew ? (
          <Card title="Strefa niebezpieczna">
            <form
              action={deleteProject.bind(null, p.id)}
              onSubmit={(e) => {
                if (!confirm(`Usunąć „${p.name}”? Tej operacji nie można cofnąć.`)) e.preventDefault();
              }}
            >
              <button className="rounded-full border border-ember px-4 py-2 text-sm text-ember hover:bg-ember hover:text-bone">Usuń projekt</button>
            </form>
          </Card>
        ) : null}
      </div>

      {/* sticky save bar */}
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-ink/10 bg-white/90 backdrop-blur md:left-60">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-3">
          <p className={`text-sm ${msg?.type === "err" ? "text-ember" : "text-emerald-700"}`} role="status">
            {msg?.text}
          </p>
          <button onClick={save} disabled={pending} className="rounded-full bg-ink px-6 py-3 text-sm font-medium text-bone disabled:opacity-50">
            {pending ? "Zapisywanie…" : "Zapisz projekt"}
          </button>
        </div>
      </div>
    </div>
  );
}
