import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { db, usingSupabase } from "@/lib/db";
import { logout } from "../actions";
import { NavLink } from "./nav-link";
import { LogoMark } from "@/components/site/logo";

export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAdmin())) redirect("/admin/login");
  const unread = (await db.messages()).filter((m) => m.status === "new").length;

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col gap-6 border-b border-ink/8 bg-white/80 p-4 backdrop-blur md:sticky md:top-0 md:h-screen md:w-60 md:border-b-0 md:border-r md:p-5">
        <Link href="/admin" className="flex items-center gap-3">
          <LogoMark size={40} />
          <span className="leading-tight">
            <span className="block font-bold">Claudio Taras</span>
            <span className="block text-xs text-ink/50">Panel · {usingSupabase ? "Supabase" : "baza lokalna"}</span>
          </span>
        </Link>
        <nav className="flex gap-1 overflow-x-auto md:flex-col">
          <NavLink href="/admin">Pulpit</NavLink>
          <NavLink href="/admin/projects">Projekty</NavLink>
          <NavLink href="/admin/messages">
            Wiadomości
            {unread ? <span className="ml-auto rounded-full bg-[#ff5a36] px-2 text-xs font-bold text-white">{unread}</span> : null}
          </NavLink>
          <NavLink href="/admin/stats">Statystyki</NavLink>
          <NavLink href="/admin/content">Teksty strony</NavLink>
          <NavLink href="/admin/settings">Ustawienia</NavLink>
          <NavLink href="/admin/connect">Połączenia</NavLink>
        </nav>
        <div className="mt-auto hidden flex-col gap-2 md:flex">
          <a href="/" target="_blank" className="rounded-xl px-3 py-2 text-sm text-ink/60 hover:bg-ink/5 hover:text-ink">
            Zobacz stronę ↗
          </a>
          <form action={logout}>
            <button className="w-full rounded-xl px-3 py-2 text-left text-sm text-ink/60 hover:bg-ink/5 hover:text-ink">Wyloguj</button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-5 md:p-10">{children}</main>
    </div>
  );
}
