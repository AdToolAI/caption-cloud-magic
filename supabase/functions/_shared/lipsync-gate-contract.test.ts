/**
 * v394 — Vertrag zwischen Start- und Fortsetzungs-Gate des Lip-Syncs.
 *
 * Der Szenenzustand beschreibt die Phase, der Pass-Slot die Arbeitseinheit.
 * Genau deshalb darf `lipsync_running` nicht starten, aber sehr wohl
 * fortsetzen — sonst bleibt der Fan-out bei Pass 1/N stehen.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { canContinueLipsync, canDispatchLipsync } from "./scene-state.ts";

const base = {
  clip_url: "https://example.test/plate.mp4",
  plate_generation: 3,
  plate_ready_generation: 3,
  active_run_id: "05c85f61-0806-429f-8394-4abb89ef847a",
};

Deno.test("audio_ready darf starten und noch nicht fortsetzen", () => {
  const row = { ...base, pipeline_state: "audio_ready" };
  assertEquals(canDispatchLipsync(row), true);
  assertEquals(canContinueLipsync(row), false);
});

Deno.test("lipsync_dispatched erfuellt beide Vertraege", () => {
  const row = { ...base, pipeline_state: "lipsync_dispatched" };
  assertEquals(canDispatchLipsync(row), true);
  assertEquals(canContinueLipsync(row), true);
});

Deno.test("lipsync_running darf nur fortsetzen", () => {
  const row = { ...base, pipeline_state: "lipsync_running" };
  assertEquals(canDispatchLipsync(row), false);
  assertEquals(canContinueLipsync(row), true);
});

Deno.test("terminale und fertige Zustaende duerfen weder starten noch fortsetzen", () => {
  for (const state of ["failed", "canceled", "complete", "lipsync_muxing"]) {
    const row = { ...base, pipeline_state: state };
    assertEquals(canDispatchLipsync(row), false, `start:${state}`);
    assertEquals(canContinueLipsync(row), false, `continue:${state}`);
  }
});

Deno.test("veraltete Plate-Generation blockiert die Fortsetzung", () => {
  const row = { ...base, pipeline_state: "lipsync_running", plate_ready_generation: 2 };
  assertEquals(canContinueLipsync(row), false);
});

Deno.test("fehlende Plate blockiert die Fortsetzung", () => {
  const row = { ...base, pipeline_state: "lipsync_running", clip_url: "" };
  assertEquals(canContinueLipsync(row), false);
});
