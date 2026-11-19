"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const LABEL: Record<string, string> = {
  en: "Updated live",
  pl: "Zaktualizowano na żywo",
  it: "Aggiornato in tempo reale",
  es: "Actualizado en vivo",
  de: "Live aktualisiert",
  fr: "Mis à jour en direct",
};

/** Never flashed: things that change on their own (clocks, counters, live regions) and drawings. */
const SKIP = "head,script,style,canvas,svg,video,[data-live-ignore],[role=status],[aria-live]";
/** Signals closer than this are handled as one (the bot often writes a few rows in a row). */
const SETTLE = 800;
/** Second look: a CDN edge that still served the old page the first time has the new one by now. */
const RECHECK = 3500;
const BEAT = 25000;

/** What StoryHost gets with "content:changed": it re-reads the home story and reports what it did. */
export type LiveJob = { wait(p: Promise<unknown>): void; changed(): void };

declare global {
  interface Window {
    /** dev/test hook: run one live refresh as if the bot had changed something */
    __live?: () => void;
  }
}

const frames = (n: number) => new Promise<void>((r) => { const f = () => (--n <= 0 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Collects the elements React touches while it applies new data, until the returned stop(). */
function watch() {
  const hit = new Set<Element>();
  const add = (el: Element | null) => {
    if (el && el !== document.body && !el.closest(SKIP)) hit.add(el);
  };
  const take = (list: MutationRecord[]) => {
    for (const m of list) {
      if (m.type === "characterData") add(m.target.parentElement);
      else if (m.type === "attributes") add(m.target as Element);
      else m.addedNodes.forEach((n) => add(n.nodeType === 1 ? (n as Element) : n.parentElement));
    }
  };
  const mo = new MutationObserver(take);
  mo.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["src", "srcset", "poster", "href", "data-status"] });
  return () => {
    take(mo.takeRecords());
    mo.disconnect();
    const vh = innerHeight;
    // outermost changed element only, and nothing page-sized (a whole section blinking reads as a glitch)
    return [...hit].filter((el) => el.isConnected && ![...hit].some((o) => o !== el && o.contains(el)) && el.getBoundingClientRect().height < vh * 1.2);
  };
}

/** The changed words / pictures surface again: tangerine, slightly blurred, settling in reading order. */
function flash(els: Element[]) {
  if (!els.length || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const vh = innerHeight;
  const shown = els
    .map((el) => ({ el: el as HTMLElement, top: el.getBoundingClientRect().top }))
    .filter((x) => x.top > -vh && x.top < vh * 2)
    .sort((a, b) => a.top - b.top);
  shown.forEach(({ el }, k) => {
    el.style.setProperty("--live-d", `${Math.min(k, 10) * 45}ms`);
    el.removeAttribute("data-live");
    void el.offsetWidth; // restart when the same element changes twice in a row
    el.setAttribute("data-live", "");
  });
  setTimeout(() => shown.forEach(({ el }) => { el.removeAttribute("data-live"); el.style.removeProperty("--live-d"); }), 2200);
}

/**
 * Keeps open pages in sync with the admin panel and the Telegram bot: every content write sends a
 * Supabase Realtime broadcast (lib/db.ts → announce), this socket hears it, the page re-reads its
 * data in place (no reload, scroll and forms untouched) and whatever changed animates in.
 * Plain WebSocket (Phoenix protocol), no SDK: ~2 KB instead of supabase-js.
 */
export function LiveUpdates({ socket }: { socket: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const settle = useRef<(() => void) | null>(null);
  const [toast, setToast] = useState({ on: false, label: "" });

  // the refresh has been committed once the transition is no longer pending
  useEffect(() => {
    if (pending || !settle.current) return;
    const done = settle.current;
    settle.current = null;
    done();
  }, [pending]);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let ref = 0;
    let beat = 0;
    let retry = 0;
    let retryTimer = 0;
    let hideTimer = 0;
    let toastTimer = 0;
    let alive = true;
    let joinedOnce = false;
    let lostAt = 0;
    let busy = false;
    let again = false;
    let missed = false;

    const refresh = () =>
      new Promise<void>((resolve) => {
        settle.current = resolve;
        startTransition(() => router.refresh());
        setTimeout(resolve, 8000); // never wait forever
      });

    /** One look at the server: the page (and the home story) re-read; returns how much changed. */
    const pass = async (story: boolean) => {
      const stop = watch();
      const jobs: Promise<unknown>[] = [refresh()];
      let changed = 0;
      if (story) dispatchEvent(new CustomEvent<LiveJob>("content:changed", { detail: { wait: (p) => jobs.push(p), changed: () => changed++ } }));
      await Promise.allSettled(jobs);
      await frames(2);
      const els = stop();
      flash(els);
      return els.length + changed;
    };

    const run = async () => {
      if (busy) return void (again = true);
      if (document.hidden) return void (missed = true);
      busy = true;
      try {
        await sleep(SETTLE);
        // a page transition in flight: let it land first
        while (document.documentElement.hasAttribute("data-morph")) await sleep(400);
        const tell = (n: number) => {
          if (!n || !alive) return;
          setToast({ on: true, label: LABEL[document.documentElement.lang] ?? LABEL.en });
          clearTimeout(toastTimer);
          toastTimer = window.setTimeout(() => setToast((t) => ({ ...t, on: false })), 2600);
        };
        tell(await pass(true));
        await sleep(RECHECK);
        tell(await pass(false));
      } finally {
        busy = false;
        if (again && alive) {
          again = false;
          void run();
        }
      }
    };
    window.__live = () => void run();

    const send = (topic: string, event: string, payload: object) => {
      if (ws?.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ topic, event, payload, ref: String(++ref), join_ref: topic === "phoenix" ? undefined : "1" }));
    };

    const connect = () => {
      if (!alive || ws || document.hidden) return;
      try {
        ws = new WebSocket(socket);
      } catch {
        return;
      }
      ws.onopen = () => {
        send("realtime:site", "phx_join", { config: { broadcast: { ack: false, self: false }, presence: { key: "", enabled: false }, postgres_changes: [], private: false } });
        clearInterval(beat);
        beat = window.setInterval(() => send("phoenix", "heartbeat", {}), BEAT);
      };
      ws.onmessage = (m) => {
        let d: { event?: string; payload?: { event?: string; status?: string } };
        try {
          d = JSON.parse(String(m.data));
        } catch {
          return;
        }
        if (d.event === "phx_reply" && d.payload?.status === "ok" && !joinedOnce) {
          joinedOnce = true;
          retry = 0;
          lostAt = 0;
        } else if (d.event === "phx_reply" && d.payload?.status === "ok" && lostAt) {
          // back after a drop: whatever changed meanwhile was not heard
          retry = 0;
          if (Date.now() - lostAt > 10000) void run();
          lostAt = 0;
        } else if (d.event === "broadcast" && d.payload?.event === "changed") void run();
        else if (d.event === "phx_error" || d.event === "phx_close") ws?.close();
      };
      ws.onclose = () => {
        clearInterval(beat);
        ws = null;
        if (!alive) return;
        lostAt ||= Date.now();
        clearTimeout(retryTimer);
        retryTimer = window.setTimeout(connect, [1000, 2000, 5000, 10000, 30000][Math.min(retry++, 4)]);
      };
      ws.onerror = () => ws?.close();
    };

    const drop = () => {
      if (!ws) return;
      lostAt = Date.now();
      const w = ws;
      ws = null;
      w.onclose = null;
      w.close();
      clearInterval(beat);
    };

    // a background tab lets go of the socket after a minute (battery); coming back reconnects and catches up
    const onVis = () => {
      clearTimeout(hideTimer);
      if (document.hidden) hideTimer = window.setTimeout(drop, 60000);
      else {
        if (!ws) {
          clearTimeout(retryTimer);
          connect();
        }
        if (missed) {
          missed = false;
          void run();
        }
      }
    };

    // the socket waits until the page has loaded and gone quiet: it never competes with the first paint
    const idle = (window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback ?? ((f: () => void) => setTimeout(f, 1500));
    const start = () => window.setTimeout(() => idle(connect, { timeout: 4000 }), 2500);
    if (document.readyState === "complete") start();
    else addEventListener("load", start, { once: true });
    document.addEventListener("visibilitychange", onVis);

    return () => {
      alive = false;
      delete window.__live;
      removeEventListener("load", start);
      document.removeEventListener("visibilitychange", onVis);
      clearTimeout(retryTimer);
      clearTimeout(hideTimer);
      clearTimeout(toastTimer);
      clearInterval(beat);
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, [router, socket]);

  return (
    <div className="ct-live" data-on={toast.on ? "" : undefined} role="status" aria-live="polite">
      <i aria-hidden />
      {toast.label}
    </div>
  );
}
