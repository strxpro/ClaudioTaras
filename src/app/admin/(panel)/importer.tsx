"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { cancelImport, getImport, startImport, type JobView } from "../import-actions";

const FEATURE_PL: Record<string, string> = {
  booking: "Rezerwacje",
  ordering: "Zamówienia",
  ecommerce: "Sklep",
  menu: "Menu",
  gallery: "Galeria",
  reviews: "Opinie",
  events: "Wydarzenia",
  blog: "Blog",
  newsletter: "Newsletter",
  voting: "Głosowanie",
  login: "Logowanie",
  admin: "Panel admina",
  contactForm: "Formularz",
  whatsapp: "WhatsApp",
  map: "Mapa",
  multilingual: "Wiele języków",
  animations: "Animacje",
  threeD: "3D",
  video: "Wideo",
  pwa: "PWA",
  countdown: "Odliczanie",
  payments: "Płatności",
  seo: "SEO",
};

const isActive = (j: JobView | null) => !!j && (j.status === "running" || j.status === "queued" || (j.status === "done" && !j.saved));

/** One box: paste a link or a folder path → everything else happens automatically. */
export function Importer({ recent }: { recent: JobView[] }) {
  const [source, setSource] = useState("");
  const [publish, setPublish] = useState(true);
  const [deploy, setDeploy] = useState(false);
  const [jobId, setJobId] = useState<string | null>(recent.find((j) => isActive(j))?.id ?? null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const raw = source.trim().replace(/^["']|["']$/g, "");
  const isFolder = !!raw && !/^https?:\/\//i.test(raw);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    start(async () => {
      const r = await startImport({ source: raw, publish, deploy: isFolder && deploy });
      if (r.error) setErr(r.error);
      else if (r.id) {
        setJobId(r.id);
        setSource("");
      }
    });
  };

  return (
    <section className="rounded-2xl bg-ink p-5 text-bone md:p-7">
      <h2 className="display text-3xl leading-none md:text-4xl">Dodaj projekt automatycznie</h2>
      <p className="mt-2 max-w-2xl text-sm text-bone/60">
        Wklej link do strony albo ścieżkę folderu z projektem. Zrzuty, wideo, logo, wykryte funkcje i opisy w 6 językach przygotuję sam — potem tylko poprawisz, co chcesz.
      </p>
      <form onSubmit={submit} className="mt-5 flex flex-col gap-3 md:flex-row">
        <input
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="https://twojastrona.pl   albo   F:\Projekty\moja-strona"
          className="min-w-0 flex-1 rounded-xl bg-white/10 px-4 py-3.5 text-base text-bone outline-none ring-acid transition placeholder:text-bone/35 focus:bg-white/15 focus:ring-2"
          spellCheck={false}
        />
        <button disabled={!raw || pending} className="rounded-xl bg-acid px-7 py-3.5 font-semibold text-ink transition hover:brightness-95 disabled:opacity-40">
          {pending ? "Startuję…" : "Importuj →"}
        </button>
      </form>
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-bone/80">
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} className="size-4 accent-[#ffd23f]" />
          Od razu pokaż na stronie
        </label>
        {isFolder ? (
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={deploy} onChange={(e) => setDeploy(e.target.checked)} className="size-4 accent-[#ffd23f]" />
            Opublikuj folder na darmowej domenie (*.vercel.app)
          </label>
        ) : null}
      </div>
      {err ? <p className="mt-3 whitespace-pre-line rounded-lg bg-[#ff5a3c]/15 px-3 py-2 text-sm text-[#ffb4a8]">{err}</p> : null}

      {jobId ? <ImportProgress id={jobId} onClose={() => setJobId(null)} /> : null}

      {recent.filter((j) => j.id !== jobId).length ? (
        <ul className="mt-6 grid gap-1 border-t border-white/10 pt-4 text-sm">
          {recent
            .filter((j) => j.id !== jobId)
            .slice(0, 4)
            .map((j) => (
              <li key={j.id} className="flex items-center gap-3 text-bone/60">
                <span className={j.status === "done" ? "text-acid" : j.status === "error" ? "text-[#ff8a70]" : ""}>{j.status === "done" ? "✓" : j.status === "error" ? "✕" : "•"}</span>
                <span className="min-w-0 flex-1 truncate">{j.resultName ?? j.facts?.name ?? j.source}</span>
                {j.status === "done" ? (
                  <Link href={`/admin/projects/${j.projectId}`} className="text-bone underline-offset-2 hover:underline">
                    Edytuj
                  </Link>
                ) : isActive(j) ? (
                  <button type="button" onClick={() => setJobId(j.id)} className="text-bone underline-offset-2 hover:underline">
                    Pokaż postęp
                  </button>
                ) : (
                  <span className="truncate text-xs">{j.error}</span>
                )}
              </li>
            ))}
        </ul>
      ) : null}
    </section>
  );
}

/** Live progress of one import (polls the job every 1.5 s). */
export function ImportProgress({ id, onClose, light }: { id: string; onClose?: () => void; light?: boolean }) {
  const [job, setJob] = useState<JobView | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const router = useRouter();

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const j = await getImport(id).catch(() => null);
      if (stop) return;
      setJob(j);
      setNow(Date.now());
      if (isActive(j)) timer = setTimeout(tick, 1500);
      else if (j?.status === "done") router.refresh();
    };
    tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [id, router]);

  if (!job) return <p className={`mt-6 text-sm ${light ? "text-ink/60" : "text-bone/60"}`}>Łączę z importem…</p>;
  const secs = Math.max(0, Math.round(((job.finishedAt ? Date.parse(job.finishedAt) : now) - Date.parse(job.createdAt)) / 1000));
  const done = job.steps.filter((s) => s.status === "done" || s.status === "skipped").length;
  const pct = job.status === "done" && job.saved ? 100 : Math.round((done / job.steps.length) * 100);
  const sub = light ? "text-ink/55" : "text-bone/55";

  return (
    <div className={`mt-6 rounded-xl p-4 md:p-5 ${light ? "bg-bone text-ink" : "bg-white/[0.06]"}`} aria-live="polite">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <p className="font-semibold">
          {job.facts?.name ?? job.source}
          <span className={`ml-2 text-sm font-normal ${sub}`}>
            {job.status === "error" ? "błąd" : job.status === "cancelled" ? "anulowano" : job.status === "done" && job.saved ? "gotowe" : "w toku"} · {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}
          </span>
        </p>
        <div className="flex items-center gap-3 text-sm">
          {isActive(job) && job.status !== "done" ? (
            <button type="button" onClick={() => cancelImport(id).then(() => getImport(id).then(setJob))} className={`${sub} hover:underline`}>
              Anuluj
            </button>
          ) : onClose ? (
            <button type="button" onClick={onClose} className={`${sub} hover:underline`}>
              Zamknij
            </button>
          ) : null}
        </div>
      </div>

      <div className={`h-1.5 overflow-hidden rounded-full ${light ? "bg-ink/10" : "bg-white/10"}`}>
        <div className="h-full rounded-full bg-acid transition-[width] duration-700" style={{ width: `${pct}%` }} />
      </div>

      <ol className="mt-4 grid gap-1.5 text-sm md:grid-cols-2">
        {job.steps.map((s) => (
          <li key={s.key} className="flex items-start gap-2.5">
            <span className="mt-0.5 grid size-4 shrink-0 place-items-center">
              {s.status === "running" ? (
                <span className="size-3.5 animate-spin rounded-full border-2 border-acid border-t-transparent" />
              ) : s.status === "done" ? (
                <span className="font-bold text-acid [text-shadow:0_0_1px_#0a0a0a]">✓</span>
              ) : s.status === "error" ? (
                <span className="font-bold text-[#ff6a4c]">✕</span>
              ) : s.status === "skipped" ? (
                <span className={sub}>–</span>
              ) : (
                <span className={`size-2 rounded-full ${light ? "bg-ink/20" : "bg-white/25"}`} />
              )}
            </span>
            <span className="min-w-0">
              <span className={s.status === "pending" || s.status === "skipped" ? sub : ""}>{s.label}</span>
              {s.note ? <span className={`block truncate text-xs ${sub}`}>{s.note}</span> : null}
            </span>
          </li>
        ))}
      </ol>

      {job.facts ? (
        <div className="mt-4 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="mr-1 inline-block size-4 rounded-full border border-white/30" style={{ background: job.facts.accent }} title="Kolor projektu" />
          {job.facts.features.map((f) => (
            <span key={f} className="rounded-full bg-acid px-2 py-0.5 font-medium text-ink">
              {FEATURE_PL[f] ?? f}
            </span>
          ))}
          {job.facts.stack.map((s) => (
            <span key={s} className={`rounded-full px-2 py-0.5 ${light ? "bg-ink/10" : "bg-white/10"}`}>
              {s}
            </span>
          ))}
        </div>
      ) : null}

      {job.status === "error" ? <p className="mt-3 text-sm text-[#ff8a70]">{job.error}</p> : null}

      {job.status === "done" && job.saved ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={`/admin/projects/${job.projectId}`} className="rounded-full bg-acid px-4 py-2 text-sm font-semibold text-ink">
            Sprawdź i popraw →
          </Link>
          {job.publish ? (
            <a href={`/pl/work/${job.slug}`} target="_blank" className={`rounded-full px-4 py-2 text-sm ${light ? "bg-ink/10" : "bg-white/10"}`}>
              Zobacz na stronie ↗
            </a>
          ) : null}
          {job.url ? (
            <a href={job.url} target="_blank" rel="noreferrer" className={`rounded-full px-4 py-2 text-sm ${light ? "bg-ink/10" : "bg-white/10"}`}>
              {job.url.replace(/^https?:\/\//, "")} ↗
            </a>
          ) : null}
          {job.copySource === "templates" ? <p className={`basis-full text-xs ${sub}`}>Opisy z szablonów — dodaj darmowy klucz AI w .env.local (np. GEMINI_API_KEY), żeby pisało je AI.</p> : null}
        </div>
      ) : null}

      {isActive(job) && job.log.length ? (
        <pre className={`mt-4 max-h-24 overflow-hidden whitespace-pre-wrap font-mono text-[0.7rem] leading-relaxed ${sub}`}>{job.log.slice(-4).join("\n")}</pre>
      ) : null}
    </div>
  );
}
