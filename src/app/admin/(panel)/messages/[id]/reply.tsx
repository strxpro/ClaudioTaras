"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { polishMessageReply, replyMessage } from "../../../actions";

const LANG: Record<string, string> = { pl: "polski", it: "włoski", en: "angielski", es: "hiszpański", de: "niemiecki", fr: "francuski" };
const IN: Record<string, string> = { pl: "po polsku", it: "po włosku", en: "po angielsku", es: "po hiszpańsku", de: "po niemiecku", fr: "po francusku" };

/** Compose a reply: write (or paste) a note, optionally let AI polish + translate it, send as branded e-mail. */
export function Reply({ id, locale, name }: { id: string; locale: string; name: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [note, setNote] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [polishing, startPolish] = useTransition();
  const [sending, startSend] = useTransition();

  const polish = () =>
    startPolish(async () => {
      setNote(null);
      const r = await polishMessageReply(id, text);
      if (r.error) setNote({ kind: "err", text: r.error });
      else if (r.text) setText(r.text);
    });

  const send = () =>
    startSend(async () => {
      setNote(null);
      const r = await replyMessage(id, text);
      if (r.error) return setNote({ kind: "err", text: r.error });
      setText("");
      setNote(
        r.emailed
          ? { kind: "ok", text: `Wysłane do ${name} ✓` }
          : { kind: "err", text: "Zapisane w wątku, ale e-mail nie wyszedł — ustaw RESEND_API_KEY i NOTIFY_FROM (patrz SETUP.md)." },
      );
      router.refresh();
    });

  return (
    <div className="mt-8 border-t border-ink/10 pt-6">
      <label htmlFor="reply" className="mb-2 block text-xs uppercase tracking-wide text-ink/50">
        Odpowiedz klientowi · e-mail w Twoim szablonie
      </label>
      <textarea
        id="reply"
        rows={6}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={`Napisz po swojemu, nawet w punktach — „✨ Popraw” zamieni to na ładną odpowiedź ${IN[locale] ?? "po angielsku"}.`}
        className="w-full rounded-xl border border-ink/15 p-3 leading-relaxed outline-none focus:border-cobalt"
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={polish}
          disabled={!text.trim() || polishing || sending}
          className="rounded-full border border-ink/15 bg-white px-4 py-2 text-sm transition hover:border-ink/40 disabled:opacity-40"
        >
          {polishing ? "Piszę…" : `✨ Popraw i przetłumacz (${LANG[locale] ?? "angielski"})`}
        </button>
        <button
          type="button"
          onClick={send}
          disabled={!text.trim() || sending || polishing}
          className="rounded-full bg-ink px-5 py-2 text-sm font-medium text-bone transition disabled:opacity-40"
        >
          {sending ? "Wysyłam…" : "Wyślij e-mail ↗"}
        </button>
        {note ? <span className={`text-sm ${note.kind === "ok" ? "text-emerald-700" : "text-ember"}`}>{note.text}</span> : null}
      </div>
    </div>
  );
}
