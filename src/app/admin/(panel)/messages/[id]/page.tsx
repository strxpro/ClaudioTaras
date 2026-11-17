import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { localeNames, isLocale } from "@/lib/i18n";
import { deleteMessage, setMessageStatus } from "../../../actions";
import { Notes } from "./notes";
import { Reply } from "./reply";
import { Live } from "../../live";

export default async function MessagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = (await db.messages()).find((x) => x.id === id);
  if (!m) notFound();
  if (m.status === "new") {
    m.status = "read";
    await db.saveMessage(m);
  }

  const subject = encodeURIComponent(`Re: ${m.services.join(", ")} — Claudio Taras`);
  const rows: [string, string | undefined][] = [
    ["E-mail", m.email],
    ["Telefon", m.phone],
    ["Firma", m.company],
    ["Strona", m.website],
    ["Usługi", m.services.join(", ")],
    ["Budżet", m.budget],
    ["Termin", m.timeline],
    ["Język strony", isLocale(m.locale) ? localeNames[m.locale] : m.locale],
    ["Wysłano", new Date(m.createdAt).toLocaleString("pl-PL")],
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <Live every={30000} />
      <Link href="/admin/messages" className="text-sm text-ink/60 hover:text-ink">
        ← Wiadomości
      </Link>
      <h1 className="display mb-8 mt-2 text-4xl md:text-6xl">{m.name}</h1>
      <div className="grid gap-5 md:grid-cols-[1fr_280px]">
        <section className="rounded-2xl bg-white p-6">
          <p className="whitespace-pre-line text-lg leading-relaxed">{m.message}</p>
          <dl className="mt-8 grid gap-3 border-t border-ink/10 pt-6 sm:grid-cols-2">
            {rows
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs uppercase tracking-wide text-ink/50">{k}</dt>
                  <dd className="break-words">{v}</dd>
                </div>
              ))}
          </dl>
          {m.attachments?.length ? (
            <div className="mt-6 flex flex-wrap gap-3">
              {m.attachments.map((a) => (
                <a key={a} href={a} target="_blank" className="group block overflow-hidden rounded-xl border border-ink/10 bg-bone">
                  {/\.pdf$/i.test(a) ? (
                    <span className="flex size-28 items-center justify-center text-sm font-medium">📄 PDF</span>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a} alt="Załącznik" className="size-28 object-cover transition group-hover:scale-105" />
                  )}
                </a>
              ))}
            </div>
          ) : null}
          {m.replies?.length ? (
            <div className="mt-8 border-t border-ink/10 pt-6">
              <p className="mb-3 text-xs uppercase tracking-wide text-ink/50">Twoje odpowiedzi</p>
              <ol className="flex flex-col gap-3">
                {m.replies.map((r) => (
                  <li key={r.at} className="ml-auto max-w-[90%] rounded-2xl rounded-br-md bg-[#fff0e9] px-4 py-3">
                    <p className="whitespace-pre-line leading-relaxed">{r.text}</p>
                    <p className="mt-1 text-right text-xs text-ink/50">
                      {r.via === "telegram" ? "Telegram" : "Panel"} · {new Date(r.at).toLocaleString("pl-PL")}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          <Reply id={m.id} locale={m.locale} name={m.name} />
          <Notes id={m.id} initial={m.notes ?? ""} />
        </section>
        <aside className="flex flex-col gap-2">
          <a href={`mailto:${m.email}?subject=${subject}`} className="rounded-full border border-ink/15 bg-white px-5 py-3 text-center text-sm">
            Otwórz w poczcie ↗
          </a>
          {m.phone ? (
            <a href={`https://wa.me/${m.phone.replace(/[^\d]/g, "")}`} target="_blank" className="rounded-full border border-ink/15 bg-white px-5 py-3 text-center text-sm">
              WhatsApp ↗
            </a>
          ) : null}
          <form action={setMessageStatus.bind(null, m.id, "replied")}>
            <button className="w-full rounded-full bg-acid px-5 py-3 text-sm font-medium">Oznacz: odpowiedziano</button>
          </form>
          <form action={setMessageStatus.bind(null, m.id, m.status === "archived" ? "read" : "archived")}>
            <button className="w-full rounded-full border border-ink/15 bg-white px-5 py-3 text-sm">{m.status === "archived" ? "Przywróć" : "Archiwizuj"}</button>
          </form>
          <form action={deleteMessage.bind(null, m.id)}>
            <button className="w-full rounded-full px-5 py-3 text-sm text-ember hover:bg-ember/10">Usuń na zawsze</button>
          </form>
        </aside>
      </div>
    </div>
  );
}
