"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/** Sends one anonymous page view per route (respects Do Not Track). */
export function Tracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (navigator.doNotTrack === "1") return;
    const body = JSON.stringify({ path: pathname, locale: pathname.split("/")[1], ref: document.referrer, w: innerWidth });
    const t = setTimeout(() => {
      if (!navigator.sendBeacon?.("/api/track", body)) fetch("/api/track", { method: "POST", body, keepalive: true }).catch(() => {});
    }, 600);
    return () => clearTimeout(t);
  }, [pathname]);
  return null;
}
