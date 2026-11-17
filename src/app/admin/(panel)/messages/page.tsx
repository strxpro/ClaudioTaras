import Link from "next/link";
import { db } from "@/lib/db";
import type { MessageStatus } from "@/lib/types";
import { Live } from "../live";

const labels: Record<MessageStatus, string> = { new: "Nowa", read: "Przeczytana", replied: "Odpowiedziano", archived: "Archiwum" };
const colors: Record<MessageStatus, string> = { new: "bg-cobalt text-bone", read: "bg-ink/8 text-ink/70", replied: "bg-acid text-ink", archived: "bg-ink/5 text-ink/40" };

export default async function Messages({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { f } = await searchParams;
  const all = await db.messages();
  const list = f ? all.filter((m) => m.status === f) : all.filter((m) => m.status !== "archived");
  const tabs: [string, string][] = [["", "Skrzynka"], ["new", "Nowe"], ["replied", "Odpowiedziano"], ["archived", "Archiwum"]];

  return (
    <div className="mx-auto max-w-6xl">
      <Live />
      <h1 className="display mb-6 text-5xl md:text-6xl">Wiadomości</h1>
      <div className="mb-6 flex flex-wrap gap-2">
        {tabs.map(([k, label]) => (
          <Link
            key={k}
            href={k ? `/admin/messages?f=${k}` : "/admin/messages"}
            className={`rounded-full px-4 py-2 text-sm ${(f ?? "") === k ? "bg-ink text-bone" : "bg-white text-ink/70 hover:text-ink"}`}
          >
            {label}
            <span className="ml-2 opacity-60">{k ? all.filter((m) => m.status === k).length : all.filter((m) => m.status !== "archived").length}</span>
          </Link>
        ))}
      </div>
      {list.length === 0 ? (
        <p className="rounded-2xl bg-white p-10 text-center text-ink/60">Pusto. Nowe zapytania z formularza pojawią się tutaj.</p>
      ) : (
        <ul className="overflow-hidden rounded-2xl bg-white">
          {list.map((m) => (
            <li key={m.id} className="border-b border-ink/8 last:border-0">
              <Link href={`/admin/messages/${m.id}`} className="grid gap-1 p-4 hover:bg-ink/[0.02] md:grid-cols-[1fr_2fr_auto] md:items-center md:gap-6">
                <span className="min-w-0">
                  <span className={`block truncate ${m.status === "new" ? "font-semibold" : ""}`}>{m.name}</span>
                  <span className="block truncate text-sm text-ink/55">{m.company || m.email}</span>
                </span>
                <span className="min-w-0 truncate text-sm text-ink/70">
                  {m.attachments?.length ? "📎 " : ""}{m.replies?.length ? "↩︎ " : ""}<b className="font-medium text-ink">{m.services.join(", ")}</b> · {m.budget} · {m.timeline} — {m.message}
                </span>
                <span className="flex items-center gap-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs ${colors[m.status]}`}>{labels[m.status]}</span>
                  <time className="text-xs text-ink/50">{new Date(m.createdAt).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" })}</time>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
