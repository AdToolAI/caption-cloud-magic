/**
 * V524 — PLATE-NATIVE IDENTITY REGISTRATION
 *
 * Scene 67b392b1, generation 20, Sarah pass 0. V523 refused the repair with
 * `identity_unresolved` and was right to: the reference it was handed was
 * [269,84,343,204] while Sarah's actual face on base-video frame 60 was
 * [87,192,275,378]. Centre distance 188 px, IoU 0.002, width 74 against 188.
 *
 * The reference came from the v278 router, whose own comment states the
 * defect: Rekognition cannot read MP4 bytes, so it detects on the ANCHOR
 * STILL and scales the boxes into plateDims. Anchor composition, plate units.
 * The legacy detector does the same whenever an anchorUrl exists.
 *
 * Identity may come from the anchor. Geometry may not. This suite proves the
 * two are now separate, that plate geometry is measured on the actual plate,
 * and that everything unprovable still fails closed.
 *
 *   PURE     — executes the registration and the space rules.
 *   CONTRACT — asserts wiring no unit test can reach.
 */

import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  classifyIdentityMapSpace,
  findPlateNativeRecord,
  isPlateNativeRegistrationFresh,
  isPlateNativeSpace,
  registerPlateNativeIdentities,
} from "./v524-plate-identity-registration.ts";
import { resolveIdentityLockedRepair, resolveLockedIdentityReference } from "./v523-identity-repair.ts";
import { pickAssignedFace } from "./plate-face-track.ts";

type Box = [number, number, number, number];

// ── The generation-20 cast and geometry, as production held it ───────────
const SARAH = "5c81f9bf-a5f1-4608-849f-e2a4adc84bcb";
const SAMUEL = "a1111111-0000-0000-0000-000000000001";
const MATTHEW = "b2222222-0000-0000-0000-000000000002";
const KAY = "c3333333-0000-0000-0000-000000000003";
const CAST = [SARAH, SAMUEL, MATTHEW, KAY];

/** What V523 was given: anchor composition, expressed in plate pixels. */
const SARAH_ANCHOR_SCALED: Box = [269, 84, 343, 204];
/** Where Sarah actually was, on base-video frame 60. */
const SARAH_PLATE: Box = [87, 192, 275, 378];

const PLATE = { width: 720, height: 1280 };
const SCENE = "67b392b1-aca1-489d-b773-d604deb22623";
const RUN = "33480f14-cbdf-4a33-ad23-c2fa502b3c20";
const GEN = 20;
const BASE_URL = "https://example.test/composer/67b392b1/gen-20/base.mp4";
const FENCE = { sceneId: SCENE, runId: RUN, plateGeneration: GEN, baseVideoUrl: BASE_URL, plateDims: PLATE };
const AT = "2026-08-28T00:00:00.000Z";

const characters = CAST.map((characterId, speakerIdx) => ({
  characterId,
  portraitUrl: `https://example.test/portraits/${characterId}.jpg`,
  speakerIdx,
}));

const okExtract = async (i: { videoUrl: string; frameNumber: number }) => ({
  ok: true,
  frameUrl: `https://example.test/frames/${i.frameNumber}.jpg`,
  reason: null,
});

/** A detector that answers with the given plate-space faces. */
const detectorFor = (
  faces: Array<{ characterId: string | null; bbox: Box; similarity?: number | null }>,
  dims = PLATE,
) =>
async () => ({
  ok: true,
  dims,
  faces: faces.map((f) => ({
    characterId: f.characterId,
    bbox: f.bbox,
    similarity: f.similarity ?? 97.5,
  })),
  resolvedCount: faces.filter((f) => f.characterId).length,
  reason: null,
});

/** A four-person plate layout, parameterised so framing can be varied. */
const layout = (over: Partial<Record<string, Box>> = {}) => [
  { characterId: SARAH, bbox: (over[SARAH] ?? SARAH_PLATE) as Box },
  { characterId: SAMUEL, bbox: (over[SAMUEL] ?? [300, 200, 470, 380]) as Box },
  { characterId: MATTHEW, bbox: (over[MATTHEW] ?? [490, 205, 650, 385]) as Box },
  { characterId: KAY, bbox: (over[KAY] ?? [10, 640, 170, 820]) as Box },
];

const register = (
  faces: Array<{ characterId: string | null; bbox: Box; similarity?: number | null }>,
  over: Record<string, unknown> = {},
) =>
  registerPlateNativeIdentities({
    sceneId: SCENE,
    runId: RUN,
    plateGeneration: GEN,
    baseVideoUrl: BASE_URL,
    plateDims: PLATE,
    frameNumber: 60,
    registeredAt: AT,
    characters,
    extractFrame: okExtract,
    detectIdentities: detectorFor(faces),
    ...over,
  } as never);

const centerOf = (b: Box): [number, number] => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
const iou = (a: Box, b: Box) => {
  const ix = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
  const iy = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const inter = ix * iy;
  const ar = (x: Box) => (x[2] - x[0]) * (x[3] - x[1]);
  return inter / (ar(a) + ar(b) - inter);
};

// ═══ 1. the generation-20 mismatch, reproduced ═══════════════════════════
Deno.test("PURE — 1. anchor geometry and plate geometry are different pictures", () => {
  const [acx, acy] = centerOf(SARAH_ANCHOR_SCALED);
  const [pcx, pcy] = centerOf(SARAH_PLATE);
  assertEquals([acx, acy], [306, 144]);
  assertEquals([pcx, pcy], [181, 285]);
  assertEquals(Math.round(Math.hypot(pcx - acx, pcy - acy)), 188);
  assert(iou(SARAH_ANCHOR_SCALED, SARAH_PLATE) < 0.01, `IoU ${iou(SARAH_ANCHOR_SCALED, SARAH_PLATE)}`);
  assertEquals(SARAH_ANCHOR_SCALED[2] - SARAH_ANCHOR_SCALED[0], 74);
  assertEquals(SARAH_PLATE[2] - SARAH_PLATE[0], 188);

  // Not a near-threshold case: the picker refuses, exactly as in production,
  // and no tolerance change could or should rescue it.
  const picked = pickAssignedFace(
    [{ bbox: SARAH_PLATE, mouth: null }],
    SARAH_ANCHOR_SCALED,
    [],
  );
  assertEquals(picked, null);
});

// ═══ 2/13. anchor-scaled geometry cannot masquerade as plate-native ══════
Deno.test("PURE — 2/13. an anchor-native reference is refused, not compared", () => {
  const ref = resolveLockedIdentityReference({
    speakerIdx: 0,
    assignmentLock: { "0": SARAH },
    speakerCharacterId: SARAH,
    plateFaces: [{ characterId: SARAH, bbox: SARAH_ANCHOR_SCALED }],
    hydratedBbox: SARAH_ANCHOR_SCALED,
    hydratedSource: "plate-persisted-lock",
    referenceSpace: "anchor_native",
  });
  assertEquals(ref.ok, false);
  assertEquals(ref.reason, "reference_space_mismatch");
  assertEquals(ref.space, "anchor_native");
  assertEquals(ref.characterId, SARAH, "the identity was never in doubt");
  assertEquals(ref.bbox, undefined, "no geometry is handed on");

  // …and the repair built on it cannot proceed.
  const r = resolveIdentityLockedRepair({
    reference: ref,
    candidates: [{ bbox: SARAH_PLATE, mouth: null }],
    siblingCenters: [],
    siblingReferences: [],
    pick: pickAssignedFace,
    positionalSlot: 0,
  });
  assertEquals(r.ok, false);
  assertEquals(r.reason, "identity_unresolved");
  assertEquals(r.detail, "reference:reference_space_mismatch");
});

Deno.test("PURE — 2. the router's own provenance is classified as anchor-native", () => {
  assertEquals(
    classifyIdentityMapSpace({
      detector: "v278-rekognition-hungarian",
      assignmentLockSource: "v278_hungarian_plate_router",
    }),
    "anchor_native",
  );
  assertEquals(classifyIdentityMapSpace({ detector: "aws_rekognition_anchor" }), "anchor_native");
  assertEquals(classifyIdentityMapSpace({ detector: "gemini-2.5-pro-mp4" }), "plate_native");
  assertEquals(classifyIdentityMapSpace({}), "unknown");
  assertEquals(isPlateNativeSpace("plate_native"), true);
  assertEquals(isPlateNativeSpace("registered_plate"), true);
  assertEquals(isPlateNativeSpace("anchor_native"), false);
  assertEquals(isPlateNativeSpace("unknown"), false);
});

// ═══ 3/12. registration on the actual plate frame ════════════════════════
Deno.test("PURE — 3. registration on the real plate frame succeeds", async () => {
  const reg = await register(layout());
  assertEquals(reg.ok, true, `${reg.reason} ${reg.detail ?? ""}`);
  assertEquals(reg.records.length, 4);
  assertEquals(reg.frameNumber, 60);
  const sarah = reg.records.find((r) => r.characterId === SARAH)!;
  assertEquals(sarah.bbox, SARAH_PLATE, "geometry is what the plate showed");
  assertEquals(sarah.source, "plate_native");
  assertEquals(sarah.identityEvidence, "aws_rekognition_compare_faces");
  assertEquals(sarah.baseVideoUrl, BASE_URL);
  assertEquals(sarah.plateGeneration, GEN);
  assertEquals(sarah.runId, RUN);
  assertEquals(reg.diagnostics.resolved, 4);
  assertEquals(reg.diagnostics.rescaled, false);
});

Deno.test("PURE — 12. V523 consumes the plate-native reference and repairs", async () => {
  const reg = await register(layout());
  const own = findPlateNativeRecord(reg.records, SARAH, FENCE)!;
  const ref = resolveLockedIdentityReference({
    speakerIdx: 0,
    assignmentLock: { "0": SARAH },
    speakerCharacterId: SARAH,
    // The anchor-native legacy evidence is still present and still wrong…
    plateFaces: [{ characterId: SARAH, bbox: SARAH_ANCHOR_SCALED }],
    hydratedBbox: SARAH_ANCHOR_SCALED,
    hydratedSource: "plate-persisted-lock",
    referenceSpace: "anchor_native",
    // …and is outranked.
    plateNativeBbox: own.bbox,
  });
  assertEquals(ref.ok, true);
  assertEquals(ref.source, "plate_native");
  assertEquals(ref.space, "plate_native");
  assertEquals(ref.bbox, SARAH_PLATE);

  const others = CAST.slice(1).map((c) => findPlateNativeRecord(reg.records, c, FENCE)!.bbox);
  const r = resolveIdentityLockedRepair({
    reference: ref,
    // Sarah drifted slightly between registration and the repair frame.
    candidates: [{ bbox: [92, 196, 280, 382] as Box, mouth: null }, ...others.map((bbox) => ({ bbox, mouth: null }))],
    siblingCenters: others.map(centerOf),
    siblingReferences: others,
    pick: pickAssignedFace,
    positionalSlot: 0,
  });
  assertEquals(r.ok, true, `${r.reason} ${r.detail ?? ""}`);
  assertEquals(r.bbox, [92, 196, 280, 382]);
});

// ═══ 4/5/6. framing, scale and translation ═══════════════════════════════
Deno.test("PURE — 4. different framing keeps identity and moves geometry", async () => {
  const reframed: Box = [400, 60, 560, 240];
  const reg = await register(layout({ [SARAH]: reframed }));
  assertEquals(reg.ok, true);
  const sarah = findPlateNativeRecord(reg.records, SARAH, FENCE)!;
  assertEquals(sarah.characterId, SARAH, "identity unchanged");
  assertEquals(sarah.bbox, reframed, "geometry followed the plate");
  assert(iou(sarah.bbox, SARAH_ANCHOR_SCALED) < 0.15, "and it is nowhere near the anchor box");
});

Deno.test("PURE — 5. a large scale change is geometry, not an identity failure", async () => {
  const huge: Box = [40, 100, 640, 700]; // 600 px wide vs the anchor's 74
  const reg = await register(layout({ [SARAH]: huge, [KAY]: [650, 900, 700, 960] as Box }));
  assertEquals(reg.ok, true, `${reg.reason} ${reg.detail ?? ""}`);
  const sarah = findPlateNativeRecord(reg.records, SARAH, FENCE)!;
  assertEquals(sarah.bbox, huge);
  assertEquals(sarah.bbox[2] - sarah.bbox[0], 600);
});

Deno.test("PURE — 6. a camera translation moves every box, not the identities", async () => {
  const shift = (b: Box, dx: number, dy: number): Box => [b[0] + dx, b[1] + dy, b[2] + dx, b[3] + dy];
  const base = layout();
  const shifted = base.map((f) => ({ characterId: f.characterId, bbox: shift(f.bbox, 40, 25) }));
  const reg = await register(shifted);
  assertEquals(reg.ok, true);
  for (const f of base) {
    const rec = findPlateNativeRecord(reg.records, f.characterId, FENCE)!;
    assertEquals(rec.bbox, shift(f.bbox, 40, 25), `${f.characterId} followed the camera`);
  }
});

// ═══ 7. actor reordering ═════════════════════════════════════════════════
Deno.test("PURE — 7. a left-right reorder does not exchange identities", async () => {
  // Sarah and Samuel trade places on the plate. The detector reports them in
  // an arbitrary order; only the characterId decides.
  const swapped = [
    { characterId: SAMUEL, bbox: [87, 192, 275, 378] as Box },
    { characterId: MATTHEW, bbox: [490, 205, 650, 385] as Box },
    { characterId: SARAH, bbox: [300, 200, 470, 380] as Box },
    { characterId: KAY, bbox: [10, 640, 170, 820] as Box },
  ];
  const reg = await register(swapped);
  assertEquals(reg.ok, true);
  assertEquals(findPlateNativeRecord(reg.records, SARAH, FENCE)!.bbox, [300, 200, 470, 380]);
  assertEquals(findPlateNativeRecord(reg.records, SAMUEL, FENCE)!.bbox, [87, 192, 275, 378]);
  // The record order follows the requested cast, never the detector's.
  assertEquals(reg.records.map((r) => r.characterId), CAST);
});

// ═══ 8/9. missing and ambiguous ══════════════════════════════════════════
Deno.test("PURE — 8. a character the plate cannot place fails the whole registration", async () => {
  const reg = await register(layout().filter((f) => f.characterId !== SARAH));
  assertEquals(reg.ok, false);
  assertEquals(reg.reason, "incomplete_registration");
  assertEquals(reg.records.length, 0, "no partial registration is published");
  assert((reg.detail ?? "").includes(SARAH));
});

Deno.test("PURE — 9. two plate faces claiming one character fail closed", async () => {
  const reg = await register([...layout(), { characterId: SARAH, bbox: [500, 900, 600, 1000] as Box }]);
  assertEquals(reg.ok, false);
  assertEquals(reg.reason, "ambiguous_identity");
  assertEquals(reg.records.length, 0);
});

Deno.test("PURE — 9. a detector that names nobody is not a registration", async () => {
  const reg = await register([{ characterId: null, bbox: SARAH_PLATE }]);
  assertEquals(reg.ok, false);
  assertEquals(reg.reason, "no_identity_evidence");
});

// ═══ 10/11. generation and source fencing ════════════════════════════════
Deno.test("PURE — 10. a prior generation's registration is not this plate", async () => {
  const reg = await register(layout());
  assertEquals(findPlateNativeRecord(reg.records, SARAH, FENCE)?.bbox, SARAH_PLATE);
  // Generation 19's record, offered for generation 20.
  assertEquals(
    findPlateNativeRecord(reg.records, SARAH, { ...FENCE, plateGeneration: 19 }),
    null,
  );
  assertEquals(
    isPlateNativeRegistrationFresh(reg.records[0], { ...FENCE, plateGeneration: 19 }),
    false,
  );
  // …and a different run of the same generation is not it either.
  assertEquals(
    isPlateNativeRegistrationFresh(reg.records[0], { ...FENCE, runId: "other-run" }),
    false,
  );
});

Deno.test("PURE — 11. a registration against another base video is rejected", async () => {
  const reg = await register(layout());
  assertEquals(
    findPlateNativeRecord(reg.records, SARAH, {
      ...FENCE,
      baseVideoUrl: "https://example.test/composer/67b392b1/gen-19/base.mp4",
    }),
    null,
  );
  // A record without provenance is never fresh.
  assertEquals(isPlateNativeRegistrationFresh(null, FENCE), false);
  assertEquals(isPlateNativeRegistrationFresh({ characterId: SARAH, bbox: SARAH_PLATE }, FENCE), false);
});

// ═══ raster coherence ════════════════════════════════════════════════════
Deno.test("PURE — a same-aspect still is rescaled; a different one is refused", async () => {
  // Half-size still of the same picture: a unit conversion, not a change of
  // subject. This is what anchor→plate scaling was NOT.
  const half = { width: 360, height: 640 };
  const reg = await register([], {
    detectIdentities: detectorFor(
      layout().map((f) => ({
        characterId: f.characterId,
        bbox: f.bbox.map((v) => Math.round(v / 2)) as Box,
      })),
      half,
    ),
  });
  assertEquals(reg.ok, true, `${reg.reason} ${reg.detail ?? ""}`);
  assertEquals(reg.diagnostics.rescaled, true);
  const sarah = findPlateNativeRecord(reg.records, SARAH, FENCE)!;
  assert(Math.abs(sarah.bbox[0] - SARAH_PLATE[0]) <= 2, `${JSON.stringify(sarah.bbox)}`);

  // A still whose aspect ratio does not match the plate is a different frame.
  const wrong = await register([], {
    detectIdentities: detectorFor(layout(), { width: 720, height: 720 }),
  });
  assertEquals(wrong.ok, false);
  assertEquals(wrong.reason, "dims_incoherent");
});

Deno.test("PURE — extraction and detection failures fail closed, and say which", async () => {
  const noFrame = await register(layout(), {
    extractFrame: async () => ({ ok: false, frameUrl: null, reason: "ffmpeg_timeout" }),
  });
  assertEquals(noFrame.ok, false);
  assertEquals(noFrame.reason, "frame_extract_failed");
  assertEquals(noFrame.detail, "ffmpeg_timeout");

  const noDetect = await register(layout(), {
    detectIdentities: async () => ({ ok: false, dims: PLATE, faces: [], reason: "aws_credentials_missing" }),
  });
  assertEquals(noDetect.ok, false);
  assertEquals(noDetect.reason, "identity_detect_failed");

  const noChars = await register(layout(), { characters: [] });
  assertEquals(noChars.ok, false);
  assertEquals(noChars.reason, "no_characters");
});

// ═══ 14. no positional fallback anywhere ═════════════════════════════════
Deno.test("PURE — 14. array position never resolves a character", async () => {
  // The detector reports four faces in an order that has nothing to do with
  // the cast, and one of them carries no identity at all.
  const reg = await register([
    { characterId: null, bbox: [600, 1000, 700, 1100] as Box },
    { characterId: KAY, bbox: [10, 640, 170, 820] as Box },
    { characterId: SARAH, bbox: SARAH_PLATE },
    { characterId: MATTHEW, bbox: [490, 205, 650, 385] as Box },
    { characterId: SAMUEL, bbox: [300, 200, 470, 380] as Box },
  ]);
  assertEquals(reg.ok, true);
  assertEquals(findPlateNativeRecord(reg.records, SARAH, FENCE)!.bbox, SARAH_PLATE);
  assertEquals(reg.records.length, 4, "the anonymous face is not adopted by anyone");
});

// ═══ CONTRACT — wiring ═══════════════════════════════════════════════════
const read = (rel: string) => Deno.readTextFileSync(new URL(rel, import.meta.url));
const codeOnly = (src: string) =>
  src.split(/\r?\n/).map((l) => {
    const t = l.trim();
    return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") ? "" : l;
  }).join("\n");

const DIALOG = codeOnly(read("../compose-dialog-segments/index.ts"));
const V524 = codeOnly(read("./v524-plate-identity-registration.ts"));
const V523 = codeOnly(read("./v523-identity-repair.ts"));

Deno.test("CONTRACT — registration runs on the base video, not the anchor", () => {
  assert(DIALOG.includes("baseVideoUrl: v524BaseVideoUrl!,"));
  assert(DIALOG.includes("const v524BaseVideoUrl = sourceClipUrl ?? null;"));
  assert(DIALOG.includes("extractFrame: async (i) => {"));
  // V525 replaced the cache-only probe helper with the real extractor;
  // V526-B hoisted the acquisition into one shared function, so the fenced
  // base-video URL is now named directly instead of threaded through the
  // callback argument. Same property, one indirection fewer.
  assert(DIALOG.includes("const r = await extractPlateFrame({"));
  assert(DIALOG.includes("baseVideoUrl: v524BaseVideoUrl,"), "the extractor is given the fenced base video");
  assert(DIALOG.includes("const v525Acquire = async (frameNumber: number)"));
  // The biometric matcher is pointed at the extracted still, never at the
  // anchor, for this registration.
  assert(DIALOG.includes("anchorUrl: i.imageUrl,"));
});

Deno.test("CONTRACT — the frame authority is the gate's own candidates, bounded", () => {
  // V526-A moved the registration's frame authority from the first turn
  // of the first pass to a scene-wide sample. The invariant this test
  // exists for is the BOUND, not which clock supplies the candidates.
  assert(DIALOG.includes("const v526Selection = selectSceneIdentityFrames({"));
  assert(DIALOG.includes("maxFrames: 3,"));
  assert(DIALOG.includes("const v524Frames = v526Selection.frames;"));
  // Stop at the first COMPLETE registration; never scan. V524-P0 also
  // skips the loop entirely on a cache hit.
  const at = DIALOG.indexOf("for (const frame of v524Reuse.hit ? [] : v524Frames) {");
  assert(at > 0);
  // V525 widened the injected extractor body; anchor on the loop, not on a
  // byte distance that tracks how much code happens to sit inside it.
  const loop = DIALOG.slice(at, at + 8000);
  assert(loop.includes("if (reg.ok) {"));
  assert(loop.includes("break;"));
});

Deno.test("CONTRACT — 12/13. V523 receives the plate-native box and the space", () => {
  assert(DIALOG.includes("plateNativeBbox: v524Own?.bbox ?? null,"));
  assert(DIALOG.includes("referenceSpace: v524LegacySpace,"));
  assert(DIALOG.includes("const v524Own = findPlateNativeRecord("));
  // The space rule itself lives in V523 and refuses anchor geometry.
  assert(V523.includes('if (params.referenceSpace === "anchor_native") {'));
  assert(V523.includes('reason: "reference_space_mismatch",'));
  // Plate-native outranks everything, and is checked first.
  const pn = V523.indexOf("const plateNative = asBox(params.plateNativeBbox);");
  const claimed = V523.indexOf("const claimed = findFacesByCharacterId(");
  assert(pn > 0 && claimed > pn, "plate-native is resolved before the legacy sources");
});

Deno.test("CONTRACT — siblings are compared in the same space as the target", () => {
  assert(DIALOG.includes('const v524TargetIsPlateNative = v523Ref?.space === "plate_native";'));
  assert(DIALOG.includes("const sb = v524TargetIsPlateNative ? sibPlate : speakerPlateBboxes[si];"));
});

Deno.test("CONTRACT — 15. a failed registration reaches no provider", () => {
  // Registration happens before the gate resolves, and a reference that stays
  // unproven becomes the V523 hard block, which returns 422 with a refund.
  const reg = DIALOG.indexOf("const v524Frames =");
  const gate = DIALOG.indexOf("const gateResults = await Promise.all(");
  const dispatch = DIALOG.indexOf("v406_canonical_boxes_frozen");
  assert(reg > 0 && gate > reg && dispatch > gate, "registration precedes the gate and every dispatch");
  assert(DIALOG.includes("identityHardFail: true,"));
  assert(DIALOG.includes("const v523Block = firstReject.identityHardFail === true;"));
});

Deno.test("CONTRACT — 16. 1- and 2-speaker scenes are untouched", () => {
  assert(DIALOG.includes("const v524Needed = speakers.length >= 3 && !!plateDims && !!v524BaseVideoUrl &&"));
  assert(DIALOG.includes("const v523NeedsIdentity = speakers.length >= 3 && !!plateDims;"));
});

Deno.test("CONTRACT — persistence is bounded and uses the existing JSONB", () => {
  assert(DIALOG.includes("(v153PlateIdentitySnapshot as any).plateNative = {"));
  assert(DIALOG.includes("records: v524Records,"));
  // No images, no per-frame tracks, no candidate dumps.
  const at = DIALOG.indexOf("(v153PlateIdentitySnapshot as any).plateNative = {");
  const block = DIALOG.slice(at, at + 900);
  assertEquals(block.includes("frameUrl"), false, "no image URL is persisted");
  assertEquals(block.includes("faceBoxes"), false);
  assertEquals(block.includes("frameBoxes"), false);
});

Deno.test("CONTRACT — the helper is a leaf: no network, no AWS, no storage", () => {
  assertEquals(V524.includes("fetch("), false);
  assertEquals(V524.includes("Deno.env"), false);
  assertEquals(V524.includes("supabase"), false);
  // `aws_rekognition_compare_faces` is an evidence LABEL; the module makes
  // no AWS call and carries no signing, endpoint or SDK.
  assertEquals(V524.includes("AwsClient"), false);
  assertEquals(V524.includes("amazonaws"), false);
  assertEquals(V524.includes("AWS_ACCESS_KEY"), false);
  // Its only import is the shared character-id normalisation.
  const imports = V524.split(/\r?\n/).filter((l) => l.trim().startsWith("import "));
  assertEquals(imports.length, 1, imports.join(" | "));
  assert(imports[0].includes("v523-identity-repair.ts"));
});

Deno.test("CONTRACT — no new thresholds, and the frozen layers are untouched", () => {
  // The only number V524 owns is the aspect-ratio coherence bound, which
  // guards a unit conversion rather than an identity decision.
  const track = read("./plate-face-track.ts");
  assert(track.includes("export const TRACK_MIN_IOU = 0.15;"));
  assert(track.includes("export const TRACK_MAX_CENTER_DRIFT = 0.7;"));
  // V526-A added one comment to that file naming V524 as the caller it
  // corrected. No executable line does.
  assertEquals(codeOnly(track).includes("V524"), false);
  for (const f of [
    "./v520-track-feasibility.ts",
    "./compute-mouth-centered-crop.ts",
    "./pass-face-preclip.ts",
    "./preclip-crop-containment.ts",
    "./v464-asd-projection.ts",
    "./v516-mouth-coherence.ts",
    "./v461-face-gate.ts",
    "./plateFaceSlotRouter.ts",
    "./face-frame-extract.ts",
  ]) assertEquals(read(f).includes("V524"), false, f);

  // `resolveIdentityViaRekognition.ts` carries exactly ONE V524-P0 change:
  // the compile-only BufferSource normalisation that restores typecheck
  // parity. Its AWS surface is untouched — same endpoint, same SigV4, same
  // thresholds, same requests.
  const rek = read("./resolveIdentityViaRekognition.ts");
  // Both mentions sit inside that one comment block; no code line names it.
  const rekCode = codeOnly(rek);
  assertEquals(rekCode.includes("V524"), false, "no executable line mentions V524");
  assert(rek.includes("function asBufferSource(bytes: Uint8Array): BufferSource {"));
  assert(rek.includes('crypto.subtle.digest("SHA-256", asBufferSource(bytes))'));
  assert(rek.includes("const MIN_SIMILARITY_PASS2 = 45;"));
  assert(rek.includes("const BOX_IOU_LINK_MIN = 0.35;"));
});
