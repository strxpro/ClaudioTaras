import Link from "next/link";
import { db } from "@/lib/db";
import { moveProject, toggleProject } from "../../actions";
import { recentImports } from "../../import-actions";
import { Importer } from "../importer";
import { QuickUrl } from "./quick-url";

export default async function ProjectsAdmin() {
  const [projects, recent] = await Promise.all([db.projects({ all: true }), recentImports()]);
  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-5xl md:text-6xl">Projekty</h1>
          <p className="mt-2 text-sm text-ink/60">Kolejność tutaj = kolejność na stronie (strzałki).</p>
        </div>
        <Link href="/admin/projects/new" className="rounded-full border border-ink/15 px-4 py-2 text-sm">
          + Dodaj ręcznie
        </Link>
      </div>
      <div className="mb-8">
        <Importer recent={recent} />
      </div>
      <ul className="overflow-hidden rounded-2xl bg-white">
        {projects.map((p, i) => (
          <li key={p.id} className="flex flex-wrap items-center gap-3 border-b border-ink/8 p-3 last:border-0 md:flex-nowrap md:p-4">
            <div className="flex flex-col">
              <form action={moveProject.bind(null, p.id, -1)}>
                <button disabled={i === 0} aria-label="W górę" className="px-2 text-ink/50 hover:text-ink disabled:opacity-20">▲</button>
              </form>
              <form action={moveProject.bind(null, p.id, 1)}>
                <button disabled={i === projects.length - 1} aria-label="W dół" className="px-2 text-ink/50 hover:text-ink disabled:opacity-20">▼</button>
              </form>
            </div>
            <div className="relative h-14 w-24 shrink-0 overflow-hidden rounded-md" style={{ background: p.accent }}>
              {p.media.desktopPoster ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.media.desktopPoster} alt="" className="size-full object-cover object-top" loading="lazy" />
              ) : null}
            </div>
            <Link href={`/admin/projects/${p.id}`} className="min-w-0 flex-1">
              <span className="block truncate font-medium">{p.name}</span>
              <span className="block truncate text-sm text-ink/55">
                {p.category} · {p.year} · {p.status === "wip" ? "🛠 w trakcie" : p.status}
                {p.url ? ` · ${p.url.replace(/^https?:\/\//, "")}` : ""}
              </span>
            </Link>
            <QuickUrl id={p.id} url={p.url} />
            <form action={toggleProject.bind(null, p.id, "featured")}>
              <button className={`rounded-full px-3 py-1.5 text-xs font-medium ${p.featured ? "bg-[#ff5a36] text-white" : "bg-ink/5 text-ink/60"}`}>
                {p.featured ? "★ Wyróżniony" : "☆ Wyróżnij"}
              </button>
            </form>
            <form action={toggleProject.bind(null, p.id, "published")}>
              <button className={`rounded-full px-3 py-1.5 text-xs font-medium ${p.published ? "bg-ink text-bone" : "bg-ink/5 text-ink/60"}`}>
                {p.published ? "Opublikowany" : "Szkic"}
              </button>
            </form>
            <Link href={`/admin/projects/${p.id}`} className="rounded-full border border-ink/15 px-3 py-1.5 text-xs">
              Edytuj
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
