import { db, usingSupabase } from "@/lib/db";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const settings = await db.settings();
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="display mb-2 text-5xl md:text-6xl">Ustawienia</h1>
      <p className="mb-8 text-sm text-ink/60">
        Dane: {usingSupabase ? "Supabase" : "plik lokalny .data/db.json"} — aby przejść na Supabase, ustaw SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY (instrukcja w README).
      </p>
      <SettingsForm initial={settings} />
    </div>
  );
}
