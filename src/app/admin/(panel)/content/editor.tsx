"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveCopy } from "../../actions";

export type Field = { path: string; base: string; value: string; group: string; label: string };

export function ContentEditor({ locale, fields }: { locale: string; fields: Field[] }) {
  const router = useRouter();
  const initial = useMemo(() => Object.fromEntries(fields.map((f) => [f.path, f.value])), [fields]);
  const [vals, setVals] = useState<Record<string, string>>(initial);
  const [q, setQ] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  const [translate, setTranslate] = useState(true);
  const [note, setNote] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [saving, start] = useTransition();

  const dirty = fields.filter((f) => vals[f.path] !== initial[f.path]).length;
  const needle = q.trim().toLowerCase();
  const visible = fields.filter(
    (f) =>
      (!onlyMine || vals[f.path] !== f.base) &&
      (!needle || f.label.toLowerCase().includes(needle) || f.group.toLowerCase().includes(needle) || vals[f.path].toLowerCase().includes(needle) || f.base.toLowerCase().includes(needle)),
  );
  const groups = visible.reduce<Map<string, Field[]>>((m, f) => m.set(f.group, [...(m.get(f.group) ?? []), f]), new Map());

  const save = () =>
    start(async () => {
      setNote(null);
      const edits = Object.fromEntries(fields.filter((f) => vals[f.path] !== f.base).map((f) => [f.path, vals[f.path]]));
      const r = await saveCopy(locale, edits, translate);
      if ("error" in r && r.error) return setNote({ kind: "err", text: r.error });
      if ("warning" in r && r.warning) setNote({ kind: "err", text: r.warning });
      else setNote({ kind: "ok", text: `Zapisane ✓${"translated" in r && r.translated ? ` · przetłumaczone na 5 języków (${r.translated})` : ""}` });
      router.refresh();
    });

  return (
    <>
      <div className="sticky top-0 z-10 -mx-2 mb-4 flex flex-wrap items-center gap-2 bg-[#f4f2ee]/90 px-2 py-3 backdrop-blur">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Szukaj tekstu, np. „24 godzin”…"
          className="min-w-0 flex-1 rounded-full border border-ink/15 bg-white px-4 py-2 outline-none focus:border-cobalt"
        />
        <label className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm">
          <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
          Tylko zmienione
        </label>
      </div>

      {groups.size === 0 ? <p className="rounded-2xl bg-white p-8 text-center text-ink/60">Nic nie pasuje do wyszukiwania.</p> : null}

      <div className="flex flex-col gap-4">
        {[...groups.entries()].map(([group, list]) => (
          <details key={group} open={!!needle || onlyMine || groups.size <= 3} className="group rounded-2xl bg-white">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-6 py-4">
              <span className="font-semibold">{group}</span>
              <span className="flex items-center gap-2 text-xs text-ink/50">
                {list.filter((f) => vals[f.path] !== f.base).length ? (
                  <span className="rounded-full bg-[#ffd9c9] px-2 py-0.5 text-ink">{list.filter((f) => vals[f.path] !== f.base).length} zmienione</span>
                ) : null}
                {list.length} pól
                <span className="transition group-open:rotate-180">⌄</span>
              </span>
            </summary>
            <div className="flex flex-col gap-4 border-t border-ink/8 px-6 py-5">
              {list.map((f) => {
                const mine = vals[f.path] !== f.base;
                return (
                  <div key={f.path} className={`border-l-2 pl-4 ${mine ? "border-[#ff5a36]" : "border-transparent"}`}>
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <label htmlFor={f.path} className="text-xs uppercase tracking-wide text-ink/50">
                        {f.label}
                      </label>
                      {mine ? (
                        <button type="button" onClick={() => setVals((v) => ({ ...v, [f.path]: f.base }))} className="text-xs text-ink/50 hover:text-ink">
                          ↺ Przywróć domyślny
                        </button>
                      ) : null}
                    </div>
                    <textarea
                      id={f.path}
                      value={vals[f.path]}
                      onChange={(e) => setVals((v) => ({ ...v, [f.path]: e.target.value }))}
                      rows={Math.min(8, Math.max(1, Math.ceil(vals[f.path].length / 70)))}
                      className="w-full resize-y rounded-lg border border-ink/12 px-3 py-2 leading-relaxed outline-none focus:border-cobalt"
                    />
                    {mine ? <p className="mt-1 text-xs text-ink/45">Domyślnie: {f.base}</p> : null}
                  </div>
                );
              })}
            </div>
          </details>
        ))}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-4 md:pl-64">
        <div className="flex w-full max-w-4xl flex-wrap items-center gap-3 rounded-2xl bg-ink px-5 py-3 text-bone shadow-2xl">
          <span className="text-sm">{dirty ? `${dirty} niezapisanych zmian` : note ? note.text : "Brak zmian"}</span>
          <label className="ml-auto flex items-center gap-2 text-sm text-bone/80">
            <input type="checkbox" checked={translate} onChange={(e) => setTranslate(e.target.checked)} />
            Przetłumacz na pozostałe języki (AI)
          </label>
          <button
            type="button"
            onClick={save}
            disabled={saving || !dirty}
            className="rounded-full bg-[#ffd9c9] px-5 py-2 text-sm font-semibold text-ink transition disabled:opacity-40"
          >
            {saving ? (translate ? "Zapisuję i tłumaczę…" : "Zapisuję…") : "Zapisz"}
          </button>
        </div>
        {note?.kind === "err" ? <p className="absolute bottom-20 rounded-lg bg-ember px-3 py-2 text-sm text-bone">{note.text}</p> : null}
      </div>
    </>
  );
}
