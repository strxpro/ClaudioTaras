"use client";

import { useActionState } from "react";
import { login } from "../actions";
import { LogoMark } from "@/components/site/logo";

export default function Login() {
  const [state, action, pending] = useActionState(login, null);
  return (
    <main className="grid min-h-screen place-items-center px-6">
      <form action={action} className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-[0_30px_80px_-40px_rgba(23,19,31,0.35)]">
        <LogoMark size={52} />
        <p className="mt-5 text-2xl font-bold">Cześć, Claudio</p>
        <p className="mb-8 text-sm text-ink/55">Panel strony · projekty, teksty, wiadomości</p>
        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink/50" htmlFor="password">
          Hasło
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          className="mb-4 w-full rounded-xl border border-ink/15 bg-[#faf9f7] px-4 py-3 text-lg outline-none focus:border-[#ff5a36]"
        />
        {state?.error ? <p className="mb-4 text-sm text-ember">{state.error}</p> : null}
        <button disabled={pending} className="w-full rounded-full bg-ink py-3 font-semibold text-white transition hover:bg-[#ff5a36] disabled:opacity-60">
          {pending ? "Logowanie…" : "Zaloguj"}
        </button>
      </form>
    </main>
  );
}
