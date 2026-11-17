"use client";

import { useState, useTransition } from "react";
import { saveMessageNotes } from "../../../actions";

export function Notes({ id, initial }: { id: string; initial: string }) {
  const [v, setV] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="mt-8 border-t border-ink/10 pt-6">
      <label className="mb-2 block text-xs uppercase tracking-wide text-ink/50" htmlFor="notes">
        Notatki (prywatne)
      </label>
      <textarea
        id="notes"
        rows={4}
        value={v}
        onChange={(e) => {
          setV(e.target.value);
          setSaved(false);
        }}
        className="w-full rounded-lg border border-ink/15 p-3 outline-none focus:border-cobalt"
        placeholder="Wycena, ustalenia z rozmowy, następny krok…"
      />
      <button
        onClick={() => start(async () => (await saveMessageNotes(id, v), setSaved(true)))}
        disabled={pending}
        className="mt-2 rounded-full bg-ink px-4 py-2 text-sm text-bone disabled:opacity-50"
      >
        {pending ? "…" : saved ? "Zapisano ✓" : "Zapisz notatkę"}
      </button>
    </div>
  );
}
