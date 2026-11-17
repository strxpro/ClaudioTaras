"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import type { Check, Level } from "@/lib/health";
import { checkConnections, connectWebhook, testEmail, testTelegram } from "../../connect-actions";

type Guide = { steps: React.ReactNode[]; links: { href: string; label: string }[] };

const A = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a href={href} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">
    {children}
  </a>
);
const C = ({ children }: { children: React.ReactNode }) => <code className="rounded bg-ink/6 px-1.5 py-0.5 text-[0.82em]">{children}</code>;

/** Where to click, in order. Kept next to the live status so the page doubles as the setup guide. */
const GUIDES: Record<Check["id"], Guide> = {
  db: {
    steps: [
      <>
        <A href="https://supabase.com/dashboard">supabase.com</A> → <b>New project</b>: nazwa „portfolio”, region <b>Frankfurt (eu-central-1)</b>, hasło bazy zapisz w menedżerze haseł.
      </>,
      <>
        <b>SQL Editor</b> → New query → wklej całą zawartość pliku <C>supabase/schema.sql</C> → <b>Run</b>. Potem tak samo plik <C>supabase/migrations/20261106_analytics_realtime.sql</C>.
      </>,
      <>
        <b>Project Settings → API Keys</b>: skopiuj <b>Project URL</b> do <C>SUPABASE_URL</C>, a sekretny klucz <b>service_role</b> (zakładka „Legacy API keys”, zaczyna się od <C>eyJ</C>) do <C>SUPABASE_SERVICE_ROLE_KEY</C>.
      </>,
      <>
        Zrestartuj <C>npm run dev</C>, potem jednym poleceniem przenieś projekty, wiadomości i ustawienia: <C>npm run db:push</C>.
      </>,
    ],
    links: [{ href: "https://supabase.com/dashboard", label: "Supabase" }],
  },
  telegram: {
    steps: [
      <>
        W Telegramie otwórz <A href="https://t.me/BotFather">@BotFather</A> → <C>/newbot</C> → nazwa „Claudio Portfolio”, login kończący się na <C>_bot</C>. Token wklej do <C>TELEGRAM_BOT_TOKEN</C>.
      </>,
      <>
        <C>TELEGRAM_WEBHOOK_SECRET</C>: długi losowy ciąg (przycisk „Wylosuj sekret” na górze strony).
      </>,
      <>
        Najprościej w terminalu: <C>npm run setup:telegram</C>. Wklejasz token, piszesz do bota <C>/start</C>, a kreator sam zapisze Twój numer (<C>ADMIN_TELEGRAM_ID</C>) i wyśle potwierdzenie. Potem <C>npm run dev:all</C> uruchamia stronę razem z botem.
      </>,
      <>Po publikacji: te same zmienne w Vercel, potem tutaj „Podłącz webhook”. Od tej chwili bot działa bez Twojego komputera.</>,
    ],
    links: [{ href: "https://t.me/BotFather", label: "BotFather" }],
  },
  ai: {
    steps: [
      <>
        <A href="https://console.groq.com/keys">console.groq.com/keys</A> → zaloguj się (Google) → <b>Create API Key</b> → wklej do <C>GROQ_API_KEY</C> (zaczyna się od <C>gsk_</C>). Darmowe, wystarczy w zupełności.
      </>,
      <>
        Zapas (opcjonalnie, też za darmo): <A href="https://aistudio.google.com/apikey">aistudio.google.com/apikey</A> → <C>GEMINI_API_KEY</C>.
      </>,
      <>
        Najlepsza jakość (opcjonalnie, płatne za użycie): <A href="https://console.anthropic.com/settings/keys">console.anthropic.com</A> → <C>ANTHROPIC_API_KEY</C>.
      </>,
    ],
    links: [
      { href: "https://console.groq.com/keys", label: "Groq" },
      { href: "https://aistudio.google.com/apikey", label: "Gemini" },
    ],
  },
  voice: {
    steps: [<>Ten sam darmowy <C>GROQ_API_KEY</C> co wyżej zamienia głosówki z Telegrama na tekst (Whisper). Nic więcej nie trzeba.</>],
    links: [],
  },
  email: {
    steps: [
      <>
        <A href="https://resend.com/domains">resend.com</A> → <b>Domains → Add domain</b> (Twoja domena) → rekordy DNS, które pokaże Resend, dodaj u dostawcy domeny → <b>Verify</b> (zwykle kilka minut).
      </>,
      <>
        <b>API Keys → Create API key</b> (wystarczy „Sending access”) → <C>RESEND_API_KEY</C>.
      </>,
      <>
        <C>NOTIFY_EMAIL</C> = adres, na który mają przychodzić zapytania. <C>NOTIFY_FROM</C> = nadawca z Twojej domeny, np. <C>Claudio Taras &lt;ciao@twojadomena.pl&gt;</C>.
      </>,
      <>Zrestartuj serwer i kliknij „Wyślij testowy e-mail”.</>,
    ],
    links: [{ href: "https://resend.com/domains", label: "Resend" }],
  },
  site: {
    steps: [
      <>
        <A href="https://vercel.com/new">vercel.com/new</A> → zaimportuj projekt (z GitHuba albo poleceniem <C>npx vercel</C> w folderze projektu).
      </>,
      <>
        <b>Settings → Environment Variables</b>: wklej wszystkie zmienne z <C>.env.local</C> (Vercel przyjmuje cały plik naraz: „Import .env”).
      </>,
      <>
        <b>Settings → Domains</b>: dodaj swoją domenę i ustaw DNS, jak pokaże Vercel. Wtedy <C>NEXT_PUBLIC_SITE_URL=https://twojadomena.pl</C>.
      </>,
      <>
        <C>ADMIN_PASSWORD</C> = własne mocne hasło; <C>ADMIN_SECRET</C> = losowe 32+ znaków (przycisk „Wylosuj sekret” na górze strony).
      </>,
    ],
    links: [{ href: "https://vercel.com/new", label: "Vercel" }],
  },
};

const ORDER: Check["id"][] = ["db", "telegram", "ai", "voice", "email", "site"];
const DOT: Record<Level, string> = { ok: "bg-emerald-500", warn: "bg-amber-400", off: "bg-ink/20", error: "bg-[#ff5a36]" };
const BADGE: Record<Level, string> = { ok: "Działa", warn: "Do dokończenia", off: "Nie podłączone", error: "Błąd" };

export function Board() {
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [at, setAt] = useState<Date | null>(null);
  const [pending, start] = useTransition();
  const [note, setNote] = useState<Record<string, { ok: boolean; msg: string }>>({});
  const [secret, setSecret] = useState("");

  const refresh = useCallback(() => {
    start(async () => {
      try {
        setChecks(await checkConnections());
        setAt(new Date());
      } catch (e) {
        setNote((n) => ({ ...n, all: { ok: false, msg: (e as Error).message } }));
      }
    });
  }, []);
  useEffect(refresh, [refresh]);

  const act = (id: string, fn: () => Promise<{ ok: boolean; msg: string }>) =>
    start(async () => {
      const r = await fn().catch((e: Error) => ({ ok: false, msg: e.message }));
      setNote((n) => ({ ...n, [id]: r }));
    });

  const roll = () => {
    const b = new Uint8Array(24);
    crypto.getRandomValues(b);
    setSecret(Array.from(b, (x) => x.toString(16).padStart(2, "0")).join(""));
  };

  const byId = new Map(checks?.map((c) => [c.id, c]));
  const ready = checks?.filter((c) => c.level === "ok").length ?? 0;
  const missing = [...new Set(checks?.flatMap((c) => c.missing ?? []) ?? [])];

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white p-5">
        <div>
          <p className="text-sm text-ink/55">{checks ? `${ready} z ${checks.length} gotowe` : "Sprawdzam połączenia…"}</p>
          <div className="mt-2 flex gap-1.5">
            {ORDER.map((id) => (
              <span key={id} title={byId.get(id)?.title} className={`h-2 w-10 rounded-full ${byId.get(id) ? DOT[byId.get(id)!.level] : "animate-pulse bg-ink/10"}`} />
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {at ? <span className="text-xs text-ink/45">sprawdzone {at.toLocaleTimeString("pl-PL")}</span> : null}
          <button type="button" onClick={refresh} disabled={pending} className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {pending ? "Sprawdzam…" : "Sprawdź ponownie"}
          </button>
        </div>
      </div>
      {note.all ? <p className="text-sm text-[#e5361b]">{note.all.msg}</p> : null}

      {missing.length ? (
        <section className="rounded-2xl bg-white p-5">
          <h2 className="font-semibold">Brakujące linijki w .env.local</h2>
          <p className="mt-1 text-sm text-ink/55">
            Plik <C>.env.local</C> leży w folderze projektu. Dopisz wartości po znaku „=”, zapisz i zrestartuj <C>npm run dev</C>. Na Vercelu wpisujesz te same zmienne w Settings → Environment Variables.
          </p>
          <pre className="mt-3 overflow-x-auto rounded-xl bg-[#17131f] p-4 text-[0.8rem] leading-relaxed text-[#f2f0ec]">{missing.map((k) => `${k}=`).join("\n")}</pre>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => navigator.clipboard?.writeText(missing.map((k) => `${k}=`).join("\n"))} className="rounded-full bg-ink/6 px-3 py-1.5 text-sm font-medium hover:bg-ink/10">
              Kopiuj
            </button>
            <button type="button" onClick={roll} className="rounded-full bg-ink/6 px-3 py-1.5 text-sm font-medium hover:bg-ink/10">
              Wylosuj sekret
            </button>
            {secret ? (
              <code className="cursor-copy select-all rounded-lg bg-ink/6 px-2 py-1 text-xs" onClick={() => navigator.clipboard?.writeText(secret)} title="Kliknij, żeby skopiować">
                {secret}
              </code>
            ) : null}
          </div>
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {ORDER.map((id, n) => {
          const c = byId.get(id);
          const g = GUIDES[id];
          const level = c?.level ?? "off";
          return (
            <section key={id} className="flex flex-col rounded-2xl bg-white p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">Krok {n + 1}</p>
                  <h2 className="mt-0.5 text-lg font-semibold">{c?.title ?? "…"}</h2>
                </div>
                <span className="flex shrink-0 items-center gap-2 rounded-full bg-ink/5 px-3 py-1 text-xs font-semibold">
                  <span className={`h-2 w-2 rounded-full ${c ? DOT[level] : "animate-pulse bg-ink/20"}`} />
                  {c ? BADGE[level] : "…"}
                </span>
              </div>
              <p className="mt-3 text-sm font-medium">{c?.summary ?? "Sprawdzam…"}</p>
              {c?.details?.length ? (
                <ul className="mt-2 grid gap-1 text-sm text-ink/60">
                  {c.details.map((d) => (
                    <li key={d}>· {d}</li>
                  ))}
                </ul>
              ) : null}
              {c?.missing?.length ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {c.missing.map((k) => (
                    <span key={k} className="rounded-md bg-amber-100 px-2 py-0.5 font-mono text-xs text-amber-900">
                      {k}
                    </span>
                  ))}
                </div>
              ) : null}

              <details className="group mt-4 rounded-xl bg-ink/[0.03] p-3" open={!!c && level !== "ok"}>
                <summary className="cursor-pointer select-none text-sm font-semibold">Jak podłączyć</summary>
                <ol className="mt-3 grid list-decimal gap-2 pl-5 text-sm leading-relaxed text-ink/75">
                  {g.steps.map((s, k) => (
                    <li key={k}>{s}</li>
                  ))}
                </ol>
              </details>

              <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
                {id === "email" ? (
                  <button type="button" disabled={pending} onClick={() => act("email", testEmail)} className="rounded-full bg-ink/6 px-3 py-1.5 text-sm font-medium hover:bg-ink/10 disabled:opacity-50">
                    Wyślij testowy e-mail
                  </button>
                ) : null}
                {id === "telegram" ? (
                  <>
                    <button type="button" disabled={pending} onClick={() => act("telegram", testTelegram)} className="rounded-full bg-ink/6 px-3 py-1.5 text-sm font-medium hover:bg-ink/10 disabled:opacity-50">
                      Wyślij test na Telegram
                    </button>
                    <button type="button" disabled={pending} onClick={() => act("telegram", connectWebhook)} className="rounded-full bg-ink/6 px-3 py-1.5 text-sm font-medium hover:bg-ink/10 disabled:opacity-50">
                      Podłącz webhook
                    </button>
                  </>
                ) : null}
                {g.links.map((l) => (
                  <a key={l.href} href={l.href} target="_blank" rel="noreferrer" className="rounded-full px-3 py-1.5 text-sm text-ink/60 hover:bg-ink/5 hover:text-ink">
                    {l.label} ↗
                  </a>
                ))}
              </div>
              {note[id] ? <p className={`mt-2 text-sm ${note[id].ok ? "text-emerald-700" : "text-[#e5361b]"}`}>{note[id].msg}</p> : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}
