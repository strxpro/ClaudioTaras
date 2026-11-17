import Link from "next/link";
import { analytics, usingSupabase } from "@/lib/db";
import { Live } from "../live";

const flag = (cc: string) => (/^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map((c) => 127397 + c.charCodeAt(0))) : "🌐");
const nf = new Intl.NumberFormat("pl-PL");
const DEVICE: Record<string, string> = { mobile: "📱 Telefon", tablet: "📲 Tablet", desktop: "💻 Komputer" };

export default async function Stats({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const { d } = await searchParams;
  const days = [7, 30, 90].includes(Number(d)) ? Number(d) : 30;
  const s = await analytics.stats(days);
  const series = s.byDay.slice(-days);
  const max = Math.max(1, ...series.map((x) => x.visitors));
  const kpis = [
    { label: "Dziś · osoby", value: s.today.visitors, sub: `${nf.format(s.today.views)} wyświetleń` },
    { label: `${days} dni · osoby`, value: s.visitors, sub: `${nf.format(s.views)} wyświetleń` },
    { label: "Średnio dziennie", value: Math.round(s.visitors / days), sub: "unikalnych osób" },
    { label: "Stron na wizytę", value: s.visitors ? (s.views / s.visitors).toFixed(1) : "0", sub: "im więcej, tym lepiej" },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <Live every={30000} />
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-5xl md:text-6xl">Statystyki</h1>
          <p className="mt-2 text-sm text-ink/55">Anonimowo: bez cookies i bez zapisywania IP · {usingSupabase ? "Supabase · page_views" : "plik .data/views.json"}</p>
        </div>
        <div className="flex gap-1 rounded-full bg-white p-1">
          {[7, 30, 90].map((n) => (
            <Link key={n} href={`/admin/stats?d=${n}`} className={`rounded-full px-4 py-1.5 text-sm ${n === days ? "bg-ink text-bone" : "text-ink/60 hover:text-ink"}`}>
              {n} dni
            </Link>
          ))}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-2xl bg-white p-5">
            <p className="text-xs uppercase tracking-wide text-ink/50">{k.label}</p>
            <p className="display mt-2 text-5xl">{typeof k.value === "number" ? nf.format(k.value) : k.value}</p>
            <p className="mt-1 text-sm text-ink/55">{k.sub}</p>
          </div>
        ))}
      </div>

      <section className="mb-6 rounded-2xl bg-white p-6">
        <h2 className="mb-1 text-lg font-semibold">Osoby dziennie</h2>
        <p className="mb-5 text-sm text-ink/55">Najedź na słupek, żeby zobaczyć dzień</p>
        <div className="relative flex h-48 items-end gap-[2px] border-b border-ink/10" role="img" aria-label={`Unikalne osoby dziennie, ostatnie ${days} dni`}>
          {series.map((x) => (
            <div key={x.date} className="group relative flex h-full min-w-0 flex-1 items-end">
              <div
                className="w-full rounded-t-[4px] bg-[#ff5a36] transition-colors group-hover:bg-[#d63c1a]"
                style={{ height: `${x.visitors ? Math.max(2, (x.visitors / max) * 100) : 0}%` }}
              />
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink px-3 py-2 text-xs text-bone shadow-lg group-hover:block">
                <b className="block">{new Date(x.date).toLocaleDateString("pl-PL", { weekday: "short", day: "numeric", month: "short" })}</b>
                {x.visitors} os. · {x.views} wyśw.
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-xs text-ink/45">
          <span>{new Date(series[0]?.date ?? Date.now()).toLocaleDateString("pl-PL", { day: "numeric", month: "short" })}</span>
          <span>max {max} os.</span>
          <span>dziś</span>
        </div>
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-ink/55">Tabela</summary>
          <table className="mt-3 w-full text-left">
            <thead className="text-xs uppercase text-ink/50">
              <tr>
                <th className="py-1">Dzień</th>
                <th>Osoby</th>
                <th>Wyświetlenia</th>
              </tr>
            </thead>
            <tbody>
              {[...series].reverse().map((x) => (
                <tr key={x.date} className="border-t border-ink/5">
                  <td className="py-1">{x.date}</td>
                  <td>{x.visitors}</td>
                  <td>{x.views}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <Top title="Najczęściej oglądane" rows={s.topPaths.map((r) => ({ label: r.path === "/" ? "Strona główna" : r.path, views: r.views }))} />
        <Top title="Kraje" rows={s.countries.map((r) => ({ label: `${flag(r.country)} ${r.country}`, views: r.views }))} />
        <Top title="Skąd przyszli" rows={s.referrers.map((r) => ({ label: r.host, views: r.views }))} empty="Wszyscy weszli bezpośrednio" />
        <Top title="Urządzenia" rows={s.devices.map((r) => ({ label: DEVICE[r.device] ?? r.device, views: r.views }))} />
      </div>
    </div>
  );
}

function Top({ title, rows, empty = "Jeszcze brak danych" }: { title: string; rows: { label: string; views: number }[]; empty?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.views));
  return (
    <section className="rounded-2xl bg-white p-6">
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-ink/55">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li key={r.label} className="relative flex items-center justify-between gap-3 overflow-hidden rounded-lg px-3 py-2 text-sm">
              <span className="absolute inset-y-0 left-0 rounded-r-[4px] bg-[#fff0e9]" style={{ width: `${(r.views / max) * 100}%` }} aria-hidden />
              <span className="relative min-w-0 truncate">{r.label}</span>
              <span className="relative shrink-0 tabular-nums text-ink/70">{nf.format(r.views)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
