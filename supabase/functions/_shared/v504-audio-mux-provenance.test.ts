import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isReusableAudioMuxLedgerCandidate } from "./v504-audio-mux-provenance.ts";

const scene = { id: "scene-1", activeRunId: "run-1", plateGeneration: 18 };
const valid = {
  id: "job-1",
  scene_id: "scene-1",
  run_id: "run-1",
  stage: "audio_mux",
  plate_generation: 18,
  status: "dispatch_uncertain",
  external_job_id: null,
};

Deno.test("V504 accepts only the current unbound audio_mux attempt", () => {
  assertEquals(isReusableAudioMuxLedgerCandidate(valid, scene), true);
});

Deno.test("V504 rejects a stale sync_segment pointer", () => {
  assertEquals(
    isReusableAudioMuxLedgerCandidate({ ...valid, stage: "sync_segment" }, scene),
    false,
  );
});

Deno.test("V504 rejects stale epochs and already-bound attempts", () => {
  assertEquals(isReusableAudioMuxLedgerCandidate({ ...valid, run_id: "old-run" }, scene), false);
  assertEquals(isReusableAudioMuxLedgerCandidate({ ...valid, plate_generation: 17 }, scene), false);
  assertEquals(isReusableAudioMuxLedgerCandidate({ ...valid, external_job_id: "old-render" }, scene), false);
});