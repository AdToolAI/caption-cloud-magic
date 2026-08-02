import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildTwoshotPlanFromMetadata,
  hashTwoshotAudioInput,
  isCompleteTwoshotPlan,
  isReusableTwoshotAudio,
  TWOSHOT_AUDIO_PLAN_VERSION,
} from "./twoshot-audio-contract.ts";

const identity = { activeRunId: "run-new", plateGeneration: 3, inputHash: "hash-new" };
const validMeta = {
  active_run_id: "run-new",
  plate_generation: 3,
  audio_plan_version: TWOSHOT_AUDIO_PLAN_VERSION,
  audio_input_hash: "hash-new",
  speakers: [{ character_id: "a" }, { character_id: "b" }],
  segments: [{ start: 0, end: 1 }],
  spoken_seconds: 1,
  scene_duration_seconds: 10,
};

Deno.test("audio generation contract rejects an older generation", () => {
  assertEquals(isReusableTwoshotAudio({ ...validMeta, plate_generation: 2 }, identity), false);
});

Deno.test("audio generation contract rejects legacy rows without provenance", () => {
  assertEquals(isReusableTwoshotAudio({ speakers: [], segments: [] }, identity), false);
});

Deno.test("same-run audio reconstructs a complete plan", () => {
  assert(isReusableTwoshotAudio(validMeta, identity));
  const plan = buildTwoshotPlanFromMetadata(validMeta, "https://audio/current.wav", 10);
  assert(isCompleteTwoshotPlan(plan));
  assertEquals(plan?.useExternalAudio, true);
});

Deno.test("audio input hash changes with script or run inputs", async () => {
  const a = await hashTwoshotAudioInput({ script: "Hallo", voices: { a: "1" } });
  const b = await hashTwoshotAudioInput({ script: "Tschüss", voices: { a: "1" } });
  assert(a !== b);
});