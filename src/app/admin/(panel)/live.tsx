"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps a panel page fresh without reloading: re-renders the server data every `every` ms while the
 * tab is visible, and right away when you come back to the tab (client state such as a half-written
 * reply is kept). Works the same on the local file store and on Supabase.
 */
export function Live({ every = 15000 }: { every?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => document.visibilityState === "visible" && router.refresh();
    const t = setInterval(tick, every);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router, every]);
  return null;
}
