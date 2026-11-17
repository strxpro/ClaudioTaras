"use client";

/**
 * Site sound, from the Ocular Sounds FX bundle (built by scripts/build-sound.py into public/sound).
 *
 * Music: an ambient bed — piano and airy pads ("Light As A Feather" → "Water Harp" → "Cloud
 * Supplies", in neighbouring keys, levels matched). The ~2 minute file is played as one long sound;
 * a few seconds before it ends a second copy starts and the two cross-fade, so it never seams.
 * Effects: short recorded UI sounds (a soft click, a tick, whooshes, a chime), with a touch of room.
 * Until a file is decoded (or if it fails) a small synthesized version plays instead.
 *
 * Browsers only allow audio after a click/tap/key, so the music starts on the first one (unless the
 * visitor muted it before; remembered in localStorage). The music file is only downloaded then.
 * Muting fades to zero and then suspends the audio thread so it costs nothing.
 */

export type Sfx = "tap" | "pop" | "whoosh" | "chime" | "tick" | "swipe" | "transition";

/** Recorded effects: file in public/sound and playback volume. */
const SAMPLES: Record<Sfx, [string, number]> = {
  tap: ["tap.wav", 0.3],
  tick: ["tick.wav", 0.2],
  pop: ["pop.wav", 0.32],
  chime: ["chime.mp3", 0.3],
  whoosh: ["whoosh.mp3", 0.34],
  swipe: ["swipe.mp3", 0.42],
  transition: ["transition.mp3", 0.4],
};
type Listener = () => void;

const KEY = "ct_sound";
const MUSIC_URL = "/sound/music.mp3";
const MUSIC_VOL = 0.5;
/** seconds the end of the piece overlaps the start of the next copy */
const XFADE = 6;
export const FADE_OUT = 1.1;
const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);

class Engine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private music!: GainNode;
  private fx!: GainNode;
  private send!: GainNode;
  private samples: Partial<Record<Sfx, AudioBuffer>> = {};
  private track: AudioBuffer | null = null;
  private trackLoad: Promise<AudioBuffer | null> | null = null;
  private voices: { src: AudioBufferSourceNode; gain: GainNode }[] = [];
  private nextAt = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  analyser: AnalyserNode | null = null;
  private listeners = new Set<Listener>();
  /** what the visitor wants (persisted); `playing` = actually audible right now */
  wanted = true;
  playing = false;

  constructor() {
    if (typeof window === "undefined") return;
    try {
      this.wanted = localStorage.getItem(KEY) !== "off";
    } catch {}
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }
  private emit() {
    this.listeners.forEach((f) => f());
  }

  private build() {
    if (this.ctx) return this.ctx;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx({ latencyHint: "interactive" });
    this.ctx = ctx;

    // master: gentle glue compressor → analyser (for the button) → out
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 14;
    comp.ratio.value = 2.5;
    comp.attack.value = 0.008;
    comp.release.value = 0.3;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.85;
    this.master.connect(comp).connect(this.analyser).connect(ctx.destination);

    // a small generated room for the effects (the music has its own space)
    const room = ctx.createConvolver();
    room.buffer = this.impulse(1.4, 3.2);
    const roomOut = ctx.createGain();
    roomOut.gain.value = 0.4;
    this.send = ctx.createGain();
    this.send.connect(room).connect(roomOut).connect(this.master);

    this.music = ctx.createGain();
    this.music.gain.value = 0;
    this.music.connect(this.master);

    this.fx = ctx.createGain();
    this.fx.gain.value = 1;
    this.fx.connect(this.master);

    this.loadSamples(ctx);
    return ctx;
  }

  /** Fetch and decode the effects once (~120 KB). */
  private loadSamples(ctx: AudioContext) {
    for (const k of Object.keys(SAMPLES) as Sfx[]) {
      fetch(`/sound/${SAMPLES[k][0]}`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()))
        .then((b) => ctx.decodeAudioData(b))
        .then((buf) => void (this.samples[k] = buf))
        .catch(() => {});
    }
  }

  private loadTrack(ctx: AudioContext) {
    if (!this.trackLoad)
      this.trackLoad = fetch(MUSIC_URL)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()))
        .then((b) => ctx.decodeAudioData(b))
        .then((buf) => (this.track = buf))
        .catch(() => null);
    return this.trackLoad;
  }

  private impulse(seconds: number, decay: number) {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = buf.getChannelData(c);
      for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.min(1, i / 400) * (1 - i / len) ** decay;
    }
    return buf;
  }

  /** Start (or resume) the music with a slow fade-in. Must run inside a user gesture the first time. */
  async start() {
    this.wanted = true;
    this.save();
    const ctx = this.build();
    if (!ctx) return;
    if (ctx.state !== "running") await ctx.resume().catch(() => {});
    if (ctx.state !== "running") return;
    this.playing = true;
    this.emit();
    const t = ctx.currentTime;
    this.music.gain.cancelScheduledValues(t);
    this.music.gain.setValueAtTime(this.music.gain.value, t);
    this.music.gain.linearRampToValueAtTime(MUSIC_VOL, t + 3.2);
    const buf = this.track ?? (await this.loadTrack(ctx));
    if (!buf || !this.playing) return;
    if (!this.voices.length) this.voice(ctx.currentTime + 0.05, 2.5);
    else if (!this.timer) this.arm(); // turned back on while the last copy was still fading
  }

  /** One copy of the piece, fading in; the next copy is scheduled to cross-fade over its ending. */
  private voice(at: number, fadeIn: number) {
    const ctx = this.ctx!;
    const buf = this.track!;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    // equal-power-ish curve: sine in, cosine out
    gain.gain.setValueCurveAtTime(curve(true), at, fadeIn);
    gain.gain.setValueCurveAtTime(curve(false), at + buf.duration - XFADE, XFADE - 0.05);
    src.connect(gain).connect(this.music);
    src.start(at);
    src.stop(at + buf.duration);
    const v = { src, gain };
    this.voices.push(v);
    src.onended = () => (this.voices = this.voices.filter((x) => x !== v));
    this.nextAt = at + buf.duration - XFADE;
    this.arm();
  }

  /** wake up shortly before the next copy is due */
  private arm() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      if (this.playing) this.voice(Math.max(this.nextAt, this.ctx!.currentTime + 0.05), XFADE);
    }, Math.max(0, (this.nextAt - this.ctx!.currentTime - 1) * 1000));
  }

  /** Fade to silence, then stop and suspend the audio thread. */
  stop() {
    this.wanted = false;
    this.save();
    this.playing = false;
    this.emit();
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.music.gain.cancelScheduledValues(t);
    this.music.gain.setValueAtTime(this.music.gain.value, t);
    this.music.gain.setTargetAtTime(0, t, FADE_OUT / 4);
    clearTimeout(this.timer);
    this.timer = undefined;
    setTimeout(() => {
      if (this.playing) return;
      this.voices.forEach((v) => {
        try {
          v.src.stop();
        } catch {}
      });
      this.voices = [];
      ctx.suspend().catch(() => {});
    }, (FADE_OUT + 1.6) * 1000);
  }

  /**
   * Build the audio graph ahead of time, in a quiet moment (the context stays suspended — browsers only
   * let it play after a gesture). Opening the audio device takes a few hundred ms on Windows; done
   * here, the visitor's first click only has to resume it.
   */
  prepare() {
    if (this.ctx || !this.wanted || typeof window === "undefined") return;
    this.build();
  }

  toggle() {
    if (this.playing) this.stop();
    else void this.start();
  }

  /** 0..1 loudness of what is playing right now (for the button's wave). */
  level(buf: Float32Array<ArrayBuffer>) {
    const a = this.analyser;
    if (!a || !this.ctx || this.ctx.state !== "running") return 0;
    a.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    return Math.min(1, Math.sqrt(sum / buf.length) * 7);
  }

  private save() {
    try {
      localStorage.setItem(KEY, this.wanted ? "on" : "off");
    } catch {}
  }

  /* ─── effects ───────────────────────────────────────────────────────── */

  sfx(kind: Sfx) {
    const ctx = this.ctx;
    if (!ctx || !this.playing || ctx.state !== "running") return;
    const t = ctx.currentTime + 0.003;
    const buf = this.samples[kind];
    if (buf) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      // a hair of random pitch so repeated clicks never sound like a loop
      src.playbackRate.value = 1 + (Math.random() - 0.5) * 0.05;
      const g = ctx.createGain();
      g.gain.value = SAMPLES[kind][1];
      src.connect(g).connect(this.fx);
      const w = ctx.createGain();
      w.gain.value = kind === "transition" || kind === "chime" || kind === "whoosh" ? 0.22 : 0.06;
      g.connect(w).connect(this.send);
      src.start(t);
      return;
    }
    // fallbacks while the files load
    const tone = (f0: number, f1: number, len: number, vol: number, at = t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(f0, at);
      o.frequency.exponentialRampToValueAtTime(f1, at + len * 0.7);
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(vol, at + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0005, at + len);
      o.connect(g).connect(this.fx);
      o.start(at);
      o.stop(at + len + 0.02);
    };
    if (kind === "tick") tone(2100, 1700, 0.03, 0.03);
    else if (kind === "tap") tone(1150, 720, 0.06, 0.06);
    else if (kind === "pop") tone(420, 1050, 0.12, 0.07);
    else if (kind === "chime") [86, 90, 93].forEach((m, i) => tone(hz(m), hz(m), 1.2, 0.04, t + i * 0.1));
  }
}

const curves = new Map<boolean, Float32Array>();
/** a 64-point sine (in) / cosine (out) fade shape */
function curve(up: boolean) {
  let c = curves.get(up);
  if (!c) {
    c = new Float32Array(64);
    for (let i = 0; i < 64; i++) {
      const p = i / 63;
      c[i] = up ? Math.sin((p * Math.PI) / 2) : Math.cos((p * Math.PI) / 2);
    }
    curves.set(up, c);
  }
  return c;
}

let engine: Engine | null = null;
export function sound(): Engine {
  if (!engine) engine = new Engine();
  return engine;
}

/** Play an effect (silent until the visitor has sound on). */
export const sfx = (kind: Sfx) => {
  if (typeof window !== "undefined") sound().sfx(kind);
};
