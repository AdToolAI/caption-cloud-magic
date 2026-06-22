import { useEffect, useRef } from "react";
import { onStageEvent, type StageEventDetail } from "@/lib/stage/stageEvents";
import { useStudioPreferences } from "@/hooks/useStudioPreferences";

/**
 * Sound Stage Audio Layer.
 *
 * Generates cinematic cues (Action snap, Cut release, Take-Failed thud) and a
 * subtle soundstage ambient bed entirely via the Web Audio API — no network
 * roundtrips, no asset downloads, instant playback, identical on every device.
 *
 * Respects:
 * - useStudioPreferences().audioMode ('off' | 'ambient' | 'full')
 * - prefers-reduced-motion (auto-mute)
 * - document visibility (fade out when tab hidden)
 */

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
}

interface StageAudioContext {
  ctx: AudioContext;
  masterGain: GainNode;
  ambientGain: GainNode | null;
  ambientNodes: { osc: OscillatorNode; lfo: OscillatorNode; lfoGain: GainNode }[];
}

let shared: StageAudioContext | null = null;

function ensureAudio(): StageAudioContext | null {
  if (typeof window === "undefined") return null;
  if (shared) return shared;
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    const ctx = new Ctor();
    const masterGain = ctx.createGain();
    masterGain.gain.value = 0.8;
    masterGain.connect(ctx.destination);
    shared = { ctx, masterGain, ambientGain: null, ambientNodes: [] };
    return shared;
  } catch {
    return null;
  }
}

async function resume(s: StageAudioContext): Promise<void> {
  if (s.ctx.state === "suspended") {
    try {
      await s.ctx.resume();
    } catch {
      /* no-op */
    }
  }
}

function playClapperSnap(s: StageAudioContext): void {
  const { ctx, masterGain } = s;
  const t = ctx.currentTime;

  // Sharp wooden snap: short noise burst through bandpass + quick decay
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.18, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    const decay = Math.pow(1 - i / data.length, 3);
    data[i] = (Math.random() * 2 - 1) * decay;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 1800;
  bp.Q.value = 1.2;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.6, t + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);

  noise.connect(bp).connect(gain).connect(masterGain);
  noise.start(t);
  noise.stop(t + 0.2);

  // Low thump body
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(180, t);
  osc.frequency.exponentialRampToValueAtTime(60, t + 0.12);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.4, t);
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  osc.connect(og).connect(masterGain);
  osc.start(t);
  osc.stop(t + 0.14);
}

function playCutRelease(s: StageAudioContext): void {
  const { ctx, masterGain } = s;
  const t = ctx.currentTime;
  // Soft "film roll stop": descending sine with shimmer
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(880, t);
  osc.frequency.exponentialRampToValueAtTime(220, t + 0.45);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.3, t + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
  osc.connect(gain).connect(masterGain);
  osc.start(t);
  osc.stop(t + 0.55);

  // Subtle gold-shimmer overtone
  const o2 = ctx.createOscillator();
  o2.type = "triangle";
  o2.frequency.setValueAtTime(1320, t);
  o2.frequency.exponentialRampToValueAtTime(660, t + 0.45);
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0.0001, t);
  g2.gain.exponentialRampToValueAtTime(0.08, t + 0.04);
  g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
  o2.connect(g2).connect(masterGain);
  o2.start(t);
  o2.stop(t + 0.55);
}

function playTakeFailed(s: StageAudioContext): void {
  const { ctx, masterGain } = s;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(140, t);
  osc.frequency.exponentialRampToValueAtTime(48, t + 0.55);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.5, t + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
  osc.connect(gain).connect(masterGain);
  osc.start(t);
  osc.stop(t + 0.65);
}

function startAmbient(s: StageAudioContext): void {
  if (s.ambientGain) return;
  const { ctx, masterGain } = s;
  const ambientGain = ctx.createGain();
  ambientGain.gain.value = 0.0001;
  ambientGain.connect(masterGain);

  // Two low drones + slow LFO swells = "soundstage hush"
  const partials = [
    { freq: 58, gain: 0.05, lfoRate: 0.07 },
    { freq: 87, gain: 0.035, lfoRate: 0.05 },
    { freq: 174, gain: 0.012, lfoRate: 0.11 },
  ];

  const nodes: StageAudioContext["ambientNodes"] = [];

  partials.forEach((p) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = p.freq;
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = p.lfoRate;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = p.gain * 0.5;
    const baseGain = ctx.createGain();
    baseGain.gain.value = p.gain;
    lfo.connect(lfoGain).connect(baseGain.gain);
    osc.connect(baseGain).connect(ambientGain);
    osc.start();
    lfo.start();
    nodes.push({ osc, lfo, lfoGain });
  });

  s.ambientGain = ambientGain;
  s.ambientNodes = nodes;
  // Gentle fade-in
  ambientGain.gain.exponentialRampToValueAtTime(0.55, ctx.currentTime + 1.5);
}

function fadeAmbient(s: StageAudioContext, targetSeconds: number, target: number): void {
  if (!s.ambientGain) return;
  const t = s.ctx.currentTime;
  try {
    s.ambientGain.gain.cancelScheduledValues(t);
    s.ambientGain.gain.setValueAtTime(s.ambientGain.gain.value, t);
    s.ambientGain.gain.exponentialRampToValueAtTime(Math.max(0.0001, target), t + targetSeconds);
  } catch {
    /* no-op */
  }
}

/**
 * Mounts once inside MotionStudioStage. Listens for stage events + pref changes
 * and orchestrates the audio graph.
 */
export function useStageAudio(): void {
  const { prefs } = useStudioPreferences();
  const enabledRef = useRef(prefs.audioMode);
  enabledRef.current = prefs.audioMode;

  // Listen for stage events
  useEffect(() => {
    const off = onStageEvent(async (detail: StageEventDetail) => {
      const mode = enabledRef.current;
      if (mode === "off") return;
      if (prefersReducedMotion()) return;
      const s = ensureAudio();
      if (!s) return;
      await resume(s);
      switch (detail.type) {
        case "action":
          playClapperSnap(s);
          break;
        case "cut":
          playCutRelease(s);
          break;
        case "take-failed":
          playTakeFailed(s);
          break;
        case "welcome":
          playClapperSnap(s);
          break;
      }
    });
    return off;
  }, []);

  // Ambient bed lifecycle
  useEffect(() => {
    if (prefs.audioMode === "off" || prefersReducedMotion()) {
      const s = shared;
      if (s) fadeAmbient(s, 0.6, 0.0001);
      return;
    }
    let cancelled = false;
    const arm = async () => {
      const s = ensureAudio();
      if (!s) return;
      await resume(s);
      if (cancelled) return;
      startAmbient(s);
      fadeAmbient(s, 1.5, 0.55);
    };
    // Wait for first user gesture (browser autoplay policy)
    const trigger = () => {
      arm();
      window.removeEventListener("pointerdown", trigger);
      window.removeEventListener("keydown", trigger);
    };
    window.addEventListener("pointerdown", trigger, { once: true });
    window.addEventListener("keydown", trigger, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener("pointerdown", trigger);
      window.removeEventListener("keydown", trigger);
    };
  }, [prefs.audioMode]);

  // Tab visibility fade
  useEffect(() => {
    const handler = () => {
      const s = shared;
      if (!s) return;
      if (document.hidden) {
        fadeAmbient(s, 0.4, 0.0001);
      } else if (enabledRef.current !== "off" && !prefersReducedMotion()) {
        fadeAmbient(s, 0.8, 0.55);
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);
}
