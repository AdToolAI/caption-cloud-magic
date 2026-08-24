import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  classifyMuxDispatch,
  MUX_DISPATCH_LOST_MS,
  MUX_REDISPATCH_MS,
} from "./v501-mux-dispatch-guard.ts";

const NOW = Date.parse("2026-08-24T11:00:00.000Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

Deno.test("V501: fertige Szene wird nie angefasst", () => {
  assertEquals(
    classifyMuxDispatch({ lipSyncStatus: "applied", audioMux: null, nowMs: NOW }).action,
    "none",
  );
  assertEquals(
    classifyMuxDispatch({ lipSyncStatus: "failed", audioMux: null, nowMs: NOW }).action,
    "none",
  );
});

Deno.test("V501: frischer Claim wartet ab", () => {
  const v = classifyMuxDispatch({
    lipSyncStatus: "audio_muxing",
    audioMux: { mux_dispatch_requested_at: ago(30_000) },
    nowMs: NOW,
  });
  assertEquals(v.action, "none");
});

Deno.test("V501: reserviert ohne Dispatch → genau ein Re-Dispatch", () => {
  const v = classifyMuxDispatch({
    lipSyncStatus: "audio_muxing",
    audioMux: { mux_dispatch_requested_at: ago(MUX_REDISPATCH_MS + 1_000) },
    nowMs: NOW,
  });
  assertEquals(v.action, "redispatch");
});

Deno.test("V501: alter Claim ohne Re-Dispatch bekommt trotzdem erst einen Versuch", () => {
  const v = classifyMuxDispatch({
    lipSyncStatus: "audio_muxing",
    audioMux: { mux_dispatch_requested_at: ago(MUX_DISPATCH_LOST_MS + 1_000) },
    nowMs: NOW,
  });
  assertEquals(v.action, "redispatch");
});

Deno.test("V501: Re-Dispatch frisch → abwarten", () => {
  const v = classifyMuxDispatch({
    lipSyncStatus: "audio_muxing",
    audioMux: {
      mux_dispatch_requested_at: ago(MUX_DISPATCH_LOST_MS + 60_000),
      v501_redispatch_at: ago(30_000),
    },
    nowMs: NOW,
  });
  assertEquals(v.action, "none");
});

Deno.test("V501: Re-Dispatch ohne Erfolg > 6min → terminal", () => {
  const v = classifyMuxDispatch({
    lipSyncStatus: "audio_muxing",
    audioMux: {
      mux_dispatch_requested_at: ago(MUX_DISPATCH_LOST_MS * 2),
      v501_redispatch_at: ago(MUX_DISPATCH_LOST_MS + 1_000),
    },
    nowMs: NOW,
  });
  assertEquals(v.action, "hard_fail");
  if (v.action === "hard_fail") assertEquals(v.reason, "audio_mux_dispatch_lost");
});

Deno.test("V501: dispatched aber still → bleibt v252-Pfad", () => {
  const fresh = classifyMuxDispatch({
    lipSyncStatus: "audio_muxing",
    audioMux: { dispatched_at: ago(60_000), render_id: "r1" },
    nowMs: NOW,
  });
  assertEquals(fresh.action, "none");
  const stale = classifyMuxDispatch({
    lipSyncStatus: "audio_muxing",
    audioMux: { dispatched_at: ago(MUX_DISPATCH_LOST_MS + 5_000), render_id: "r1" },
    nowMs: NOW,
  });
  assertEquals(stale.action, "v252_stall");
});

Deno.test("V501: Mux ohne Claim wird nicht spekulativ angestoßen", () => {
  assertEquals(
    classifyMuxDispatch({ lipSyncStatus: "audio_muxing", audioMux: {}, nowMs: NOW }).action,
    "none",
  );
});
