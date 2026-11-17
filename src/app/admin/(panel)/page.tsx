import Link from "next/link";
import { analytics, db } from "@/lib/db";
import { Live } from "./live";
import { recentImports } from "../import-actions";
import { Importer } from "./importer";

export default async function Dashboard() {
  const [projects, messages, recent, views] = await Promise.all([db.projects({ all: true }), db.messages(), recentImports(), analytics.stats(7).catch(() => null)]);
  const unread = messages.filter((m) => m.status === "new");
  const stats = [
    { label: "Osoby dziś", value: views?.today.visitors ?? 0, href: "/admin/stats?d=7" },
    { label: "Osoby · 7 dni", value: views?.visitors ?? 0, href: "/admin/stats?d=7" },
    { label: "Projekty na stronie", value: projects.filter((p) => p.published).length, href: "/admin/projects" },
    { label: "Nowe wiadomości", value: unread.length, href: "/admin/messages" },
  ];
  return (
    <div className="mx-auto max-w-6xl">
      <Live every={30000} />
      <h1 className="display mb-8 text-5xl md:text-7xl">Cześć, Claudio.</h1>
      <div className="mb-8">
        <Importer recent={recent} />
      </div>
      <div className="mb-12 grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="rounded-2xl bg-white p-5 transition-shadow hover:shadow-lg">
            <p className="display text-5xl">{s.value}</p>
            <p className="mt-1 text-sm text-ink/60">{s.label}</p>
          </Link>
        ))}
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <section className="rounded-2xl bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Ostatnie zapytania</h2>
            <Link href="/admin/messages" className="text-sm underline">
              Wszystkie
            </Link>
          </div>
          {messages.length === 0 ? (
            <p className="text-sm text-ink/60">Brak wiadomości. Formularz kontaktowy zapisuje je tutaj.</p>
          ) : (
            <ul className="divide-y divide-ink/10">
              {messages.slice(0, 6).map((m) => (
                <li key={m.id}>
                  <Link href={`/admin/messages/${m.id}`} className="flex items-center gap-3 py-3">
                    {m.status === "new" ? <span className="size-2 shrink-0 rounded-full bg-cobalt" /> : <span className="size-2 shrink-0" />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{m.name}</span>
                      <span className="block truncate text-sm text-ink/60">{m.services.join(", ")} · {m.budget}</span>
                    </span>
                    <time className="shrink-0 text-xs text-ink/50">{new Date(m.createdAt).toLocaleDateString("pl-PL")}</time>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-2xl bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Projekty</h2>
            <Link href="/admin/projects" className="text-sm underline">
              Wszystkie
            </Link>
          </div>
          <ul className="divide-y divide-ink/10">
            {projects.slice(0, 7).map((p) => (
              <li key={p.id}>
                <Link href={`/admin/projects/${p.id}`} className="flex items-center gap-3 py-2.5">
                  <span className="size-4 shrink-0 rounded-full" style={{ background: p.accent }} />
                  <span className="flex-1 truncate">{p.name}</span>
                  <span className="text-xs text-ink/50">{p.published ? "Opublikowany" : "Szkic"}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
