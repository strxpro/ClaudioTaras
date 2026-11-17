"use client";

import { useState, useTransition } from "react";
import { setProjectUrl } from "../../actions";

/** Demo → live in one go: paste the address, Enter, done (status switches to "live"). */
export function QuickUrl({ id, url }: { id: string; url?: string }) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState(url ?? "");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className={`rounded-full px-3 py-1.5 text-xs font-medium ${url ? "bg-[#2fbf71]/15 text-[#1d7a47]" : "bg-[#ff5a36]/12 text-[#c2410c]"}`}>
        {url ? "🔗 Link" : "🔗 Dodaj link"}
      </button>
    );
  return (
    <form
      className="flex items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await setProjectUrl(id, val);
          if (r?.error) setMsg(r.error);
          else {
            setMsg("");
            setOpen(false);
          }
        });
      }}
    >
      <input autoFocus value={val} onChange={(e) => setVal(e.target.value)} placeholder="https://…" className="w-48 rounded-full border border-ink/15 px-3 py-1.5 text-xs" />
      <button disabled={pending} className="rounded-full bg-ink px-3 py-1.5 text-xs text-bone">{pending ? "…" : "OK"}</button>
      <button type="button" onClick={() => setOpen(false)} className="px-1 text-xs text-ink/50">✕</button>
      {msg ? <span className="text-xs text-[#c2410c]">{msg}</span> : null}
    </form>
  );
}
