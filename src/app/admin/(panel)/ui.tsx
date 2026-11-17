"use client";

import { useRef, useState, type ReactNode } from "react";
import { locales, type L10n, type Locale } from "@/lib/i18n";
import { uploadMedia } from "../actions";
import { aiTranslate } from "../ai-actions";

export const inputCls =
  "w-full rounded-lg border border-ink/15 bg-white px-3 py-2.5 text-[0.95rem] outline-none transition-colors focus:border-cobalt focus:ring-2 focus:ring-cobalt/15";

export function Card({ title, desc, children, aside }: { title: string; desc?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-5 md:p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          {desc ? <p className="mt-1 text-sm text-ink/55">{desc}</p> : null}
        </div>
        {aside}
      </div>
      <div className="grid gap-4">{children}</div>
    </section>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint ? <span className="text-xs text-ink/50">{hint}</span> : null}
    </label>
  );
}

const flags: Record<Locale, string> = { en: "EN", pl: "PL", it: "IT", es: "ES", de: "DE", fr: "FR" };

/** Text field edited in all six languages, with a tab per language and completeness dots. */
export function LocaleInput({ label, value, onChange, area, rows = 3 }: { label: string; value: L10n; onChange: (v: L10n) => void; area?: boolean; rows?: number }) {
  const [lang, setLang] = useState<Locale>("pl");
  const v = value[lang] ?? "";
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // AI: this language → all the others (keeps what's typed in the current tab)
  const translate = async () => {
    const src = value[lang];
    if (!src?.trim()) return;
    setBusy(true);
    setErr("");
    const res = await aiTranslate(src, lang);
    setBusy(false);
    if (res.value) onChange({ ...res.value, [lang]: src });
    else setErr(res.error ?? "Nie udało się przetłumaczyć.");
  };
  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <div className="flex items-center gap-1">
          {locales.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              className={`relative rounded-md px-2 py-1 font-mono text-[0.68rem] ${lang === l ? "bg-ink text-bone" : "bg-ink/5 text-ink/60 hover:bg-ink/10"}`}
            >
              {flags[l]}
              <span className={`absolute -right-0.5 -top-0.5 size-1.5 rounded-full ${value[l] ? "bg-emerald-500" : "bg-ember"}`} />
            </button>
          ))}
          <button type="button" onClick={translate} disabled={busy || !v.trim()} title="Przetłumacz ten tekst na pozostałe języki (AI)" className="ml-1 rounded-md px-2 py-1 text-[0.68rem] text-cobalt hover:bg-cobalt/10 disabled:opacity-40">
            {busy ? "tłumaczę…" : "🌐 przetłumacz"}
          </button>
        </div>
      </div>
      {area ? (
        <textarea rows={rows} value={v} onChange={(e) => onChange({ ...value, [lang]: e.target.value })} className={`${inputCls} resize-y`} />
      ) : (
        <input value={v} onChange={(e) => onChange({ ...value, [lang]: e.target.value })} className={inputCls} />
      )}
      {err ? <span className="text-xs text-ember">{err}</span> : null}
    </div>
  );
}

/** URL field with an upload button (images / videos) and an inline preview. */
export function MediaInput({ label, value, onChange, folder, kind = "image" }: { label: string; value?: string; onChange: (url: string) => void; folder: string; kind?: "image" | "video" }) {
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const upload = async (f: File) => {
    setBusy(true);
    setErr("");
    const fd = new FormData();
    fd.set("file", f);
    fd.set("folder", folder);
    const res = await uploadMedia(fd);
    setBusy(false);
    if ("error" in res && res.error) setErr(res.error);
    else if ("url" in res && res.url) onChange(res.url);
  };
  return (
    <div className="grid gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex gap-2">
        <input value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={inputCls} placeholder="/media/… lub https://…" />
        <button type="button" onClick={() => file.current?.click()} className="shrink-0 rounded-lg bg-ink px-3 text-sm text-bone disabled:opacity-50" disabled={busy}>
          {busy ? "…" : "Wgraj"}
        </button>
        <input
          ref={file}
          type="file"
          hidden
          accept={kind === "video" ? "video/webm,video/mp4" : "image/*"}
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
        />
      </div>
      {err ? <span className="text-xs text-ember">{err}</span> : null}
      {value ? (
        kind === "video" ? (
          <video src={value} muted loop autoPlay playsInline className="max-h-40 w-fit rounded-lg bg-black" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className="max-h-40 w-fit rounded-lg bg-ink/5 object-contain" />
        )
      ) : null}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex items-center gap-3 text-sm">
      <span className={`relative h-6 w-11 rounded-full transition-colors ${checked ? "bg-cobalt" : "bg-ink/20"}`}>
        <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`} />
      </span>
      {label}
    </button>
  );
}
