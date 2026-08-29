/**
 * V526-B — COMMON-FRAME IDENTITY COMPLETION
 *
 * Scene 67b392b1, generation 24. V526-A sampled the scene correctly — frames
 * 23, 225 and 428 at the renderer's real 30 fps — and V525 delivered all three
 * stills. V524 then resolved 3/4 at frame 23 (missing Sarah), 3/4 at frame 225
 * (missing Matthew) and 1/4 at frame 428.
 *
 * Every character is biometrically resolvable somewhere in this plate. No
 * single sampled frame carries all four.
 *
 * Unioning the frames would hand V523 a target and siblings measured six
 * seconds apart. Identity evidence may cross frames; geometry may not. One
 * frame is the target, and whoever is missing there is carried to it by the
 * identity-locked continuity rule the V452 tracker already uses.
 *
 *   PURE     — executes planning and completion.
 *   CONTRACT — asserts wiring no unit test can reach.
 */

import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  buildCommonFrameTelemetry,
  buildStepFrames,
  completeCommonFrameCohort,
  planCommonFrameCompletion,
  type FrameAttemptEvidence,
} from "./v526b-common-frame-identity.ts";
import type { PlateNativeIdentityRecord } from "./v524-plate-identity-registration.ts";
import { registerPlateNativeIdentities } from "./v524-plate-identity-registration.ts";
import { pickAssignedFace } from "./plate-face-track.ts";
import { trackSampleTimes, TRACK_SAMPLE_COUNT_MAX } from "./dynamic-camera-path.ts";

type Box = [number, number, number, number];

// ── The generation-24 cast and plate ─────────────────────────────────────
const SARAH = "5c81f9bf-a5f1-4608-849f-e2a4adc84bcb";
const SAMUEL = "483f9cdc-eb31-4486-bf67-9c5e7d955016";
const MATTHEW = "54d90504-7253-482f-9c6f-1902e8a6749b";
const KAY = "c65de5c6-75e1-47aa-956c-cd0cc424e736";
const CAST = [SARAH, SAMUEL, MATTHEW, KAY];

const SCENE = "67b392b1-aca1-489d-b773-d604deb22623";
const RUN = "81ccdd86-ef8e-4258-9927-c4d0415149e2";
const GEN = 24;
const BASE_URL = "https://example.test/composer/67b392b1/gen-24/base.mp4";
const PLATE = { width: 720, height: 1280 };
const FENCE = { sceneId: SCENE, runId: RUN, plateGeneration: GEN, baseVideoUrl: BASE_URL, plateDims: PLATE };
const AT = "2026-08-29T00:00:00.000Z";
const FPS = 30;

const rec = (
  characterId: string,
  frame: number,
  bbox: Box,
  similarity = 90,
): PlateNativeIdentityRecord => ({
  characterId,
  bbox,
  frameNumber: frame,
  plateDims: PLATE,
  source: "plate_native",
  identityEvidence: "aws_rekognition_compare_faces",
  similarity,
  baseVideoUrl: BASE_URL,
  sceneId: SCENE,
  runId: RUN,
  plateGeneration: GEN,
  registeredAt: AT,
});

/** Where the four stand, per sampled frame. */
const AT23: Record<string, Box> = {
  [MATTHEW]: [100, 300, 180, 410],
  [SAMUEL]: [300, 290, 380, 400],
  [KAY]: [500, 295, 580, 405],
};
const AT225: Record<string, Box> = {
  [SARAH]: [120, 305, 200, 415],
  [SAMUEL]: [310, 292, 390, 402],
  [KAY]: [505, 296, 585, 406],
};
/** Matthew at 225 — where the propagation must land him. */
const MATTHEW_AT_225: Box = [140, 302, 220, 412];

const GEN24: FrameAttemptEvidence[] = [
  { frame: 23, records: Object.entries(AT23).map(([c, b]) => rec(c, 23, b)) },
  { frame: 225, records: Object.entries(AT225).map(([c, b]) => rec(c, 225, b)) },
  { frame: 428, records: [rec(MATTHEW, 428, [160, 300, 240, 410])] },
];

const plan = (over: Record<string, unknown> = {}) =>
  planCommonFrameCompletion({
    attempts: GEN24,
    requestedCharacterIds: CAST,
    fence: FENCE,
    fps: FPS,
    maxSteps: TRACK_SAMPLE_COUNT_MAX,
    sampleTimes: trackSampleTimes,
    ...over,
  } as never);

// ═══ 3/4/5. the target rule, on the real generation-24 evidence ══════════
Deno.test("PURE — 3/4/5. the rule selects frame 225, seeded from 23", () => {
  const p = plan();
  assertEquals(p.ok, true, `${p.reason} ${p.detail ?? ""}`);
  assertEquals(p.targetFrame, 225, "frame 23 loses: Sarah's only evidence is later");
  assertEquals(p.characterId, MATTHEW);
  assertEquals(p.seedFrame, 23);
  assertEquals(p.seedBbox, AT23[MATTHEW]);
  // Frame 428 never qualifies — three characters missing there.
  assertEquals(p.targetRecords?.length, 3);
  assertEquals(
    new Set(p.targetRecords!.map((r) => r.characterId)),
    new Set([SARAH, SAMUEL, KAY]),
  );
});

Deno.test("PURE — 4. a target whose seed is only later is refused", () => {
  // Strip frame 23 entirely: now the best target is 225, missing Matthew,
  // whose only remaining evidence is at 428 — after it.
  const p = plan({ attempts: GEN24.filter((a) => a.frame !== 23) });
  assertEquals(p.ok, false);
  assertEquals(p.reason, "common_frame_seed_not_earlier");
});

Deno.test("PURE — 5. a best target missing two characters is refused", () => {
  const thin: FrameAttemptEvidence[] = [
    { frame: 23, records: [rec(SAMUEL, 23, AT23[SAMUEL]), rec(KAY, 23, AT23[KAY])] },
    { frame: 225, records: [rec(SAMUEL, 225, AT225[SAMUEL]), rec(KAY, 225, AT225[KAY])] },
  ];
  const p = plan({ attempts: thin });
  assertEquals(p.ok, false);
  assertEquals(p.reason, "common_frame_too_many_missing");
});

Deno.test("PURE — 6. the LATEST earlier seed wins, minimising the hop", () => {
  const extra: FrameAttemptEvidence[] = [
    GEN24[0],
    { frame: 120, records: [rec(MATTHEW, 120, [110, 301, 190, 411])] },
    GEN24[1],
    GEN24[2],
  ];
  // Frame 120 only resolves Matthew, so 225 is still the target — but his
  // nearest earlier evidence is now 120, not 23.
  const p = plan({ attempts: extra });
  assertEquals(p.ok, true);
  assertEquals(p.targetFrame, 225);
  assertEquals(p.seedFrame, 120);
});

Deno.test("PURE — 1/7/8/9/10. stale or foreign evidence is not a seed", () => {
  const bad = (over: Partial<PlateNativeIdentityRecord>) => ({
    ...rec(MATTHEW, 23, AT23[MATTHEW]),
    ...over,
  }) as PlateNativeIdentityRecord;
  for (
    const [name, r] of [
      ["generation", bad({ plateGeneration: 23 })],
      ["run", bad({ runId: "another-run" })],
      ["base video", bad({ baseVideoUrl: BASE_URL.replace("gen-24", "gen-23") })],
      ["scene", bad({ sceneId: "00000000-0000-0000-0000-000000000000" })],
      ["dims", bad({ plateDims: { width: 1080, height: 1920 } })],
    ] as Array<[string, PlateNativeIdentityRecord]>
  ) {
    const p = plan({
      attempts: [{ frame: 23, records: [r, rec(SAMUEL, 23, AT23[SAMUEL]), rec(KAY, 23, AT23[KAY])] }, GEN24[1]],
    });
    // With Matthew's seed rejected, frame 225 has no earlier evidence for him.
    assertEquals(p.ok, false, name);
    assert(
      p.reason === "common_frame_no_seed" || p.reason === "common_frame_too_many_missing",
      `${name}: ${p.reason}`,
    );
  }
});

Deno.test("PURE — a character resolved nowhere yields no_seed", () => {
  const p = plan({
    attempts: [
      { frame: 23, records: [rec(SARAH, 23, AT225[SARAH]), rec(SAMUEL, 23, AT23[SAMUEL]), rec(KAY, 23, AT23[KAY])] },
      { frame: 225, records: Object.entries(AT225).map(([c, b]) => rec(c, 225, b)) },
    ],
  });
  assertEquals(p.ok, false);
  assertEquals(p.reason, "common_frame_no_seed");
});

// ═══ 16/17. the step frames ══════════════════════════════════════════════
Deno.test("PURE — 16/17. steps end EXACTLY at the target and stay bounded", () => {
  const p = plan();
  const steps = p.stepFrames!;
  assertEquals(steps[steps.length - 1], 225, "the last step is the target itself");
  assert(steps.length <= TRACK_SAMPLE_COUNT_MAX, `${steps.length} steps`);
  for (let i = 1; i < steps.length; i++) assert(steps[i] > steps[i - 1], "strictly increasing");
  for (const f of steps.slice(0, -1)) {
    assert(f > 23 && f < 225, `intermediate ${f} lies strictly between seed and target`);
  }
  assertEquals(new Set(steps).size, steps.length, "no repeated render");
  // The sampler's 5 % padding would stop short of the target; appending it is
  // what makes "the same frame" true rather than nearly true.
  const raw = trackSampleTimes(23 / FPS, 225 / FPS, TRACK_SAMPLE_COUNT_MAX - 1);
  assert(Math.round(raw[raw.length - 1] * FPS) < 225);
});

Deno.test("PURE — buildStepFrames degrades and refuses safely", () => {
  const f = (seedFrame: number, targetFrame: number, maxSteps: number) =>
    buildStepFrames({ seedFrame, targetFrame, fps: FPS, maxSteps, sampleTimes: trackSampleTimes });
  assertEquals(f(23, 24, 8), [24], "adjacent frames need no intermediate");
  assertEquals(f(23, 225, 1), [225], "a cap of one is the target alone");
  assertEquals(f(225, 23, 8), [], "backward is not a path");
  assertEquals(f(23, 23, 8), [], "no distance, no path");
  assert(f(23, 225, 8).length <= 8);
});

// ═══ 13/14/15/20/21. completion at the target ════════════════════════════
const detectorFor = (perFrame: Record<number, Box[]>) => async (frame: number) => ({
  ok: perFrame[frame] !== undefined,
  candidates: (perFrame[frame] ?? []).map((bbox) => ({ bbox, mouth: null })),
  reason: perFrame[frame] === undefined ? "no_still" : null,
});

/** A plausible walk: Matthew drifts from his seed box toward 225. */
const walk = (steps: number[]): Record<number, Box[]> => {
  const out: Record<number, Box[]> = {};
  const from = AT23[MATTHEW], to = MATTHEW_AT_225;
  steps.forEach((f, i) => {
    const t = (i + 1) / steps.length;
    const box = from.map((v, k) => Math.round(v + (to[k] - v) * t)) as Box;
    out[f] = f === 225
      ? [box, ...Object.values(AT225)]
      : [box, ...Object.values(AT23).filter((b) => b !== from)];
  });
  return out;
};

Deno.test("PURE — 13/20/21/22. a provable walk yields one homogeneous cohort", async () => {
  const p = plan();
  const r = await completeCommonFrameCohort({
    plan: p,
    fence: FENCE,
    registeredAt: AT,
    pick: pickAssignedFace,
    detectAtFrame: detectorFor(walk(p.stepFrames!)),
  });
  assertEquals(r.ok, true, `${r.reason} ${r.detail ?? ""}`);
  assertEquals(r.records.length, 4);
  assertEquals(new Set(r.records.map((x) => x.characterId)).size, 4, "one per character");
  for (const x of r.records) {
    assertEquals(x.frameNumber, 225, `${x.characterId} is at the target`);
    assertEquals(x.sceneId, SCENE);
    assertEquals(x.runId, RUN);
    assertEquals(x.plateGeneration, GEN);
    assertEquals(x.baseVideoUrl, BASE_URL);
    assertEquals(x.plateDims, PLATE);
  }
  // The three direct records are untouched biometric measurements at 225.
  for (const cid of [SARAH, SAMUEL, KAY]) {
    const d = r.records.find((x) => x.characterId === cid)!;
    assertEquals(d.identityEvidence, "aws_rekognition_compare_faces");
    assertEquals(d.bbox, AT225[cid]);
  }
  // Matthew's carries its own evidence class and never borrows a score.
  const m = r.records.find((x) => x.characterId === MATTHEW)!;
  assertEquals(m.identityEvidence, "biometric_seed_plus_identity_locked_track");
  assertEquals(m.similarity, null, "no CompareFaces happened at 225");
  assertEquals(m.seedFrameNumber, 23);
  assertEquals(m.seedSimilarity, 90);
  assertEquals(m.trackSource, "identity_locked_continuity");
  assertEquals(m.trackStepCount, p.stepFrames!.length);
  assertEquals(r.steps.length, p.stepFrames!.length);
  assert(r.steps.every((s) => s.accepted));
});

Deno.test("PURE — 13. a broken step fails closed and names the frame", async () => {
  const p = plan();
  const w = walk(p.stepFrames!);
  delete w[p.stepFrames![2]];
  const r = await completeCommonFrameCohort({
    plan: p, fence: FENCE, registeredAt: AT, pick: pickAssignedFace,
    detectAtFrame: detectorFor(w),
  });
  assertEquals(r.ok, false);
  assertEquals(r.reason, "common_frame_track_broken");
  assertEquals(r.records, []);
  assert((r.detail ?? "").includes(String(p.stepFrames![2])));
  assertEquals(r.completedSteps, 2, "the two proven steps are still reported");
});

Deno.test("PURE — 14. an unprovable intermediate fails closed", async () => {
  const p = plan();
  const w = walk(p.stepFrames!);
  // A face far from the reference: no continuation is provable.
  w[p.stepFrames![1]] = [[600, 900, 660, 980]];
  const r = await completeCommonFrameCohort({
    plan: p, fence: FENCE, registeredAt: AT, pick: pickAssignedFace,
    detectAtFrame: detectorFor(w),
  });
  assertEquals(r.ok, false);
  assertEquals(r.reason, "common_frame_ambiguous_step");
  assertEquals(r.records, []);
});

Deno.test("PURE — 15. a collision with the target cast fails closed", async () => {
  const p = plan();
  const w = walk(p.stepFrames!);
  // At the target, the only candidate near Matthew's tracked position is
  // Sarah's own box. The sibling veto must refuse it.
  w[225] = [AT225[SARAH], ...Object.values(AT225)];
  const r = await completeCommonFrameCohort({
    plan: p, fence: FENCE, registeredAt: AT, pick: pickAssignedFace,
    detectAtFrame: detectorFor(w),
  });
  assertEquals(r.ok, false);
  assertEquals(r.reason, "common_frame_sibling_conflict");
  assertEquals(r.records, []);
});

Deno.test("PURE — the sibling sets differ by step, and are never fabricated", () => {
  const p = plan();
  // Intermediates carry the cast known AT THE SEED frame — Samuel and Kay.
  assertEquals(p.seedSiblingCenters?.length, 2);
  // The final step carries the real, contemporaneous cast at 225 — three.
  assertEquals(p.targetSiblingCenters?.length, 3);
  // Nobody is invented for a sibling that was not resolved.
  assert(p.seedSiblingCenters!.every((c) => c.every(Number.isFinite)));
});

// ═══ 18. no CompareFaces during propagation ══════════════════════════════
Deno.test("PURE — 18. propagation never calls the biometric matcher", async () => {
  const p = plan();
  let acquisitions = 0;
  const r = await completeCommonFrameCohort({
    plan: p, fence: FENCE, registeredAt: AT, pick: pickAssignedFace,
    detectAtFrame: async (frame) => {
      acquisitions++;
      const w = walk(p.stepFrames!);
      return { ok: true, candidates: (w[frame] ?? []).map((bbox) => ({ bbox, mouth: null })) };
    },
  });
  assertEquals(r.ok, true);
  // One acquisition per step, no more — the interface offers no matcher at
  // all, so a CompareFaces during propagation is not merely unused but
  // unreachable.
  assertEquals(acquisitions, p.stepFrames!.length);
  assert(acquisitions <= TRACK_SAMPLE_COUNT_MAX, "hard step cap");
});

// ═══ 1/2. the V524 partial-record contract ═══════════════════════════════
Deno.test("PURE — 1/2. a failed registration keeps ok:false and records:[]", async () => {
  const characters = CAST.map((characterId, speakerIdx) => ({
    characterId,
    portraitUrl: `https://example.test/p/${characterId}.jpg`,
    speakerIdx,
  }));
  const reg = await registerPlateNativeIdentities({
    sceneId: SCENE, runId: RUN, plateGeneration: GEN, baseVideoUrl: BASE_URL,
    plateDims: PLATE, frameNumber: 23, registeredAt: AT, characters,
    extractFrame: async () => ({ ok: true, frameUrl: "https://example.test/f23.jpg", reason: null }),
    detectIdentities: async () => ({
      ok: true,
      dims: PLATE,
      faces: [
        { characterId: MATTHEW, bbox: AT23[MATTHEW], similarity: 88 },
        { characterId: SAMUEL, bbox: AT23[SAMUEL], similarity: 91 },
        { characterId: KAY, bbox: AT23[KAY], similarity: 84 },
        { characterId: null, bbox: [600, 900, 660, 980], similarity: null },
      ],
      resolvedCount: 3,
      reason: null,
    }),
  } as never);
  // The old contract, byte for byte.
  assertEquals(reg.ok, false);
  assertEquals(reg.reason, "incomplete_registration");
  assertEquals(reg.records, []);
  // The new field, alongside it.
  assertEquals(reg.partialRecords?.length, 3);
  assertEquals(
    new Set(reg.partialRecords!.map((r) => r.characterId)),
    new Set([MATTHEW, SAMUEL, KAY]),
  );
  for (const r of reg.partialRecords!) {
    assertEquals(r.frameNumber, 23);
    assertEquals(r.identityEvidence, "aws_rekognition_compare_faces");
    assertEquals(r.sceneId, SCENE);
    assertEquals(r.plateGeneration, GEN);
    assert(typeof r.similarity === "number", "an accepted match keeps its score");
  }
  // Never the unresolved detection.
  assertEquals(reg.partialRecords!.some((r) => !r.characterId), false);
});

Deno.test("PURE — 25. a complete registration needs no completion at all", async () => {
  const p = planCommonFrameCompletion({
    attempts: [{ frame: 225, records: CAST.map((c) => rec(c, 225, AT225[c] ?? [1, 2, 3, 4])) }],
    requestedCharacterIds: CAST,
    fence: FENCE, fps: FPS, maxSteps: TRACK_SAMPLE_COUNT_MAX, sampleTimes: trackSampleTimes,
  });
  // Nothing is missing, so there is no single-missing target to choose.
  assertEquals(p.ok, false);
  assertEquals(p.reason, "common_frame_too_many_missing");
});

Deno.test("PURE — telemetry is bounded and names the first failed step", async () => {
  const p = plan();
  const w = walk(p.stepFrames!);
  delete w[p.stepFrames![1]];
  const r = await completeCommonFrameCohort({
    plan: p, fence: FENCE, registeredAt: AT, pick: pickAssignedFace,
    detectAtFrame: detectorFor(w),
  });
  const t = buildCommonFrameTelemetry(p, r);
  assertEquals(t.target_frame, 225);
  assertEquals(t.character_id, MATTHEW);
  assertEquals(t.seed_frame, 23);
  assertEquals(t.result, "failed");
  assertEquals(t.reason, "common_frame_track_broken");
  assertEquals((t.steps as unknown[]).length <= TRACK_SAMPLE_COUNT_MAX, true);
  assertEquals(JSON.stringify(t).length < 2000, true, "bounded");
});

// ═══ CONTRACT — wiring ═══════════════════════════════════════════════════
const read = (rel: string) => Deno.readTextFileSync(new URL(rel, import.meta.url));
const codeOnly = (src: string) =>
  src.split(/\r?\n/).map((l) => {
    const t = l.trim();
    return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") ? "" : l;
  }).join("\n");

const DIALOG = codeOnly(read("../compose-dialog-segments/index.ts"));
const V526B = codeOnly(read("./v526b-common-frame-identity.ts"));
const TRACK = read("./plate-face-track.ts");

Deno.test("CONTRACT — 22. completion runs only after every normal attempt failed", () => {
  assert(DIALOG.includes("if (!v524Registration?.ok && v526bEvidence.length > 0 && plateDims && v524BaseVideoUrl) {"));
  const loop = DIALOG.indexOf("for (const frame of v524Reuse.hit ? [] : v524Frames) {");
  const complete = DIALOG.indexOf("v526bPlan = planCommonFrameCompletion({");
  assert(loop > 0 && complete > loop, "the bounded loop runs first");
});

Deno.test("CONTRACT — 8. every still goes through the V525 source-fenced cache", () => {
  // ONE acquisition path, shared by the registration loop and the completion.
  assertEquals(DIALOG.split("await extractPlateFrame({").length - 1, 1);
  assert(DIALOG.includes("const v525Acquire = async (frameNumber: number)"));
  assert(DIALOG.includes("const r = await v525Acquire(i.frameNumber);"));
  assert(DIALOG.includes("const got = await v525Acquire(frame);"));
  assertEquals(DIALOG.includes("renderStill: defaultRenderStill()"), false, "never around the cache");
});

Deno.test("CONTRACT — 7/12. the detector and the picker are reused, not rebuilt", () => {
  assert(TRACK.includes("export function defaultDetectFaces() {"));
  assert(DIALOG.includes("const v526bDetect = defaultDetectFaces();"));
  assert(DIALOG.includes("pick: pickAssignedFace,"));
  assert(DIALOG.includes("stillBoxToSource(f.bbox, plateDims!.width, plateDims!.height, img.width, img.height)"));
  // The helper owns no detector, no picker and no I/O of its own.
  assertEquals(V526B.includes("AwsClient"), false);
  assertEquals(V526B.includes("fetch("), false);
  assertEquals(V526B.includes("Deno.env"), false);
  const imports = V526B.split(/\r?\n/).filter((l) => l.trim().startsWith("import "));
  assertEquals(imports.length, 2, imports.join(" | "));
});

Deno.test("CONTRACT — 11/13. the frame and threshold authorities are unchanged", () => {
  assert(DIALOG.includes("fps: STILL_FPS,"));
  assert(DIALOG.includes("maxSteps: TRACK_SAMPLE_COUNT_MAX,"));
  assertEquals(V526B.includes("ASSUMED_FPS"), false);
  for (const t of [
    "export const TRACK_MIN_IOU = 0.15;",
    "export const TRACK_MAX_CENTER_DRIFT = 0.7;",
    "export const TRACK_AMBIGUITY_DIST_RATIO = 1.15;",
  ]) assert(TRACK.includes(t), t);
  // No long-distance relaxation anywhere in the new code.
  assertEquals(/TRACK_(MIN_IOU|MAX_CENTER_DRIFT|AMBIGUITY)/.test(V526B), false);
  assertEquals(codeOnly(TRACK).split("V526").length - 1, 0, "no executable line names V526");
});

Deno.test("CONTRACT — 20/21. V523 receives the same homogeneous shape as ever", () => {
  // The completed cohort replaces the registration result wholesale.
  assert(DIALOG.includes("v524Records = v526bResult.records;"));
  assert(DIALOG.includes("frameNumber: v526bResult.targetFrame ?? -1,"));
  // V523 itself is untouched.
  assertEquals(read("./v523-identity-repair.ts").includes("V526"), false);
  assert(DIALOG.includes("plateNativeBbox: v524Own?.bbox ?? null,"));
});

Deno.test("CONTRACT — 24. completion is visible in the persisted record", () => {
  assert(DIALOG.includes("common_frame: v526bPlan"));
  assert(DIALOG.includes("? buildCommonFrameTelemetry(v526bPlan, v526bResult)"));
  assert(DIALOG.includes("v526b_common_frame"));
  // The top-level source literal is untouched, so nothing downstream is
  // surprised by a new value.
  assert(DIALOG.includes('registration_source: v524Reuse.hit ? "reused" : "registered",'));
});

Deno.test("CONTRACT — frozen: V526-A, V525, V520-V522, V516, V510, V508", () => {
  for (const f of [
    "./v526-scene-frame-authority.ts",
    "./v525-plate-frame-extract.ts",
    "./v520-track-feasibility.ts",
    "./compute-mouth-centered-crop.ts",
    "./pass-face-preclip.ts",
    "./preclip-crop-containment.ts",
    "./v464-asd-projection.ts",
    "./v516-mouth-coherence.ts",
    "./v510-terminal-fence.ts",
    "./v508-strict-identity.ts",
    "./resolveIdentityViaRekognition.ts",
    "./dynamic-camera-path.ts",
  ]) assertEquals(read(f).includes("V526-B"), false, f);
  const rek = read("./resolveIdentityViaRekognition.ts");
  assert(rek.includes("const MIN_SIMILARITY = 55;"));
  assert(rek.includes("const MIN_SIMILARITY_PASS2 = 45;"));
});
