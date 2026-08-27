/**
 * V523 — IDENTITY-LOCKED FACE REPAIR AUTHORITY
 *
 * Scene 67b392b1, generation 19, Sarah pass 1. The scene terminalized on
 * `no_coherent_track_samples`: V520 accepted 0 of 6 track samples (4
 * scale-incoherent, 2 invalid boxes) and V516 reported the tracked mouth at
 * ~[188,466] against Sarah's assignment-locked face [108,280,178,386].
 *
 * Both gates were right, and neither was the cause. Upstream, the v96
 * face-gate repair had chosen Sarah's face like this:
 *
 *     faces.filter(big enough).sort(x ascending)[pass.speaker_idx]
 *
 * On a four-person frame the left-to-right ordinal describes where someone is
 * standing, not who they are. It moved Sarah's locked centre [143,333] to
 * [91,471] — 52 px left, 138 px down — and the tracker followed.
 *
 * Sarah pass 0 succeeded in the same run, with a real Sync.so job. Her
 * identity is usable; the pipeline just stopped asking about it.
 *
 *   PURE     — executes the identity decision.
 *   CONTRACT — asserts wiring no unit test can reach.
 */

import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  centerOfBox,
  findFacesByCharacterId,
  isIdentityDerivedSource,
  resolveIdentityLockedRepair,
  resolveLockedIdentityReference,
  stripCharacterIdPrefix,
} from "./v523-identity-repair.ts";
import { pickAssignedFace } from "./plate-face-track.ts";

type Box = [number, number, number, number];

// ── The generation-19 cast, as production locked it ──────────────────────
const SARAH = "5c81f9bf-a5f1-4608-849f-e2a4adc84bcb";
const SAMUEL = "a1111111-0000-0000-0000-000000000001";
const MATTHEW = "b2222222-0000-0000-0000-000000000002";
const KAY = "c3333333-0000-0000-0000-000000000003";

/** Sarah's assignment-locked plate face. Centre [143,333]. */
const SARAH_LOCKED: Box = [108, 280, 178, 386];
const SAMUEL_LOCKED: Box = [300, 270, 372, 380];
const MATTHEW_LOCKED: Box = [480, 275, 552, 385];
const KAY_LOCKED: Box = [660, 265, 732, 375];

/**
 * The candidate the retired x-sort chose on repair frame 202. Derived from
 * the production repair coordinate [91,471] through the unchanged
 * `[cx, y1 + 0.45·h]` rule: cx = 91, y1 + 0.45·106 = 471.
 */
const GEN19_BAD: Box = [56, 423, 126, 529];
/** Sarah where she actually was on that frame — a small step from her lock. */
const GEN19_SARAH: Box = [116, 292, 186, 398];

const CANDIDATES = (boxes: Box[]) => boxes.map((bbox) => ({ bbox, mouth: null }));

/** The unchanged coordinate rule, so before/after are measured identically. */
const coordsOf = (b: Box): [number, number] => [
  Math.round((b[0] + b[2]) / 2),
  Math.round(b[1] + (b[3] - b[1]) * 0.45),
];

const speakers = [
  { character_id: SARAH },
  { character_id: SAMUEL },
  { character_id: MATTHEW },
  { character_id: KAY },
];
const LOCK: Record<string, string> = { "0": SARAH, "1": SAMUEL, "2": MATTHEW, "3": KAY };
const LOCKED_BOXES: Box[] = [SARAH_LOCKED, SAMUEL_LOCKED, MATTHEW_LOCKED, KAY_LOCKED];

const refFor = (idx: number, over: Record<string, unknown> = {}) =>
  resolveLockedIdentityReference({
    speakerIdx: idx,
    assignmentLock: LOCK,
    speakerCharacterId: speakers[idx].character_id,
    plateFaces: [
      { characterId: KAY, bbox: KAY_LOCKED },
      { characterId: SARAH, bbox: SARAH_LOCKED },
      { characterId: MATTHEW, bbox: MATTHEW_LOCKED },
      { characterId: SAMUEL, bbox: SAMUEL_LOCKED },
    ],
    hydratedBbox: LOCKED_BOXES[idx],
    hydratedSource: "plate-persisted-lock",
    ...over,
  } as never);

const siblingsOf = (idx: number, boxes: Box[] = LOCKED_BOXES) =>
  boxes.filter((_, i) => i !== idx).map(centerOfBox);

const repair = (params: {
  idx: number;
  candidates: Box[];
  reference?: ReturnType<typeof refFor>;
  siblings?: Array<[number, number]>;
  siblingRefs?: Box[];
  positionalSlot?: number | null;
}) =>
  resolveIdentityLockedRepair({
    reference: params.reference ?? refFor(params.idx),
    candidates: CANDIDATES(params.candidates),
    siblingCenters: params.siblings ?? siblingsOf(params.idx),
    siblingReferences: params.siblingRefs ?? LOCKED_BOXES.filter((_, i) => i !== params.idx),
    pick: pickAssignedFace,
    positionalSlot: params.positionalSlot ?? params.idx,
  });

// ═══ 1. the generation-19 misassignment, reproduced ══════════════════════
Deno.test("PURE — 1. the old x-sort really does produce [91,471] for Sarah", () => {
  const frame = [GEN19_BAD, GEN19_SARAH, SAMUEL_LOCKED, MATTHEW_LOCKED, KAY_LOCKED];
  const positional = [...frame].sort((a, b) => a[0] - b[0])[0];
  assertEquals(positional, GEN19_BAD, "slot 0 is the leftmost face, not Sarah");
  assertEquals(coordsOf(positional), [91, 471], "the production repair coordinate");
  // …and how far that is from the identity it claimed to repair.
  const [lcx, lcy] = centerOfBox(SARAH_LOCKED);
  assertEquals([lcx, lcy], [143, 333]);
  assertEquals(coordsOf(positional)[0] - lcx, -52);
  assertEquals(coordsOf(positional)[1] - lcy, 138);
});

// ═══ 2/3. the unrelated leftmost face is refused, the real one is chosen ══
Deno.test("PURE — 2/3. identity picks Sarah's face and refuses the leftmost", () => {
  const r = repair({
    idx: 0,
    candidates: [GEN19_BAD, GEN19_SARAH, SAMUEL_LOCKED, MATTHEW_LOCKED, KAY_LOCKED],
  });
  assertEquals(r.ok, true, `expected a proven repair, got ${r.reason}`);
  assertEquals(r.bbox, GEN19_SARAH);
  assert(r.bbox !== undefined && coordsOf(r.bbox)[1] < 420, "Sarah does not move to the lower frame");
  // The retired rule's answer is recorded, and it is the wrong one.
  assertEquals(r.positionalWouldHavePicked, GEN19_BAD);
  assert(r.iou !== undefined && r.iou > 0.5, `continuation IoU ${r.iou}`);
});

Deno.test("PURE — 2. with ONLY the bad candidate present, nothing is repaired", () => {
  // The exact generation-19 hazard in isolation: a face exists, it is the
  // leftmost, and it is not Sarah. The old rule took it.
  const r = repair({ idx: 0, candidates: [GEN19_BAD, SAMUEL_LOCKED, MATTHEW_LOCKED, KAY_LOCKED] });
  assertEquals(r.ok, false);
  assertEquals(r.reason, "identity_unresolved");
  assertEquals(r.bbox, undefined, "no substitute face");
  assertEquals(r.positionalWouldHavePicked, GEN19_BAD);
});

// ═══ 4. horizontal order crossing ════════════════════════════════════════
Deno.test("PURE — 4. a horizontal crossing never transfers an identity", () => {
  // Two cast members standing close together trade places. Sarah's lock is
  // [143,333]; Samuel's is moved next to her at [230,330] so a crossing is
  // physically possible without either leaving their own drift radius.
  const samuelLock: Box = [194, 277, 266, 383]; // centre [230,330]
  const locks: Box[] = [SARAH_LOCKED, samuelLock, MATTHEW_LOCKED, KAY_LOCKED];
  const sarahNow: Box = [165, 282, 235, 388]; // centre [200,335] — now RIGHT
  const samuelNow: Box = [140, 275, 212, 381]; // centre [176,328] — now LEFT
  const frame = [sarahNow, samuelNow, MATTHEW_LOCKED, KAY_LOCKED];
  assertEquals(
    [...frame].sort((a, b) => a[0] - b[0])[0],
    samuelNow,
    "the ordinal has genuinely swapped — slot 0 is now Samuel",
  );

  // Geometry alone cannot undo a crossing: from Sarah's stale locked box,
  // Samuel's CURRENT face is the better continuation (IoU 0.34 vs 0.10).
  // The picker on its own would hand her his face with no ambiguity to
  // catch it — the generation-19 defect in geometric clothing. What stops
  // it is exclusivity: that face is also claimable by Samuel's own lock,
  // so no character may take it.
  const bare = pickAssignedFace(
    CANDIDATES(frame),
    SARAH_LOCKED,
    locks.filter((_, i) => i !== 0).map(centerOfBox),
  );
  assertEquals(bare?.bbox, samuelNow, "the picker alone really is fooled");

  for (const idx of [0, 1]) {
    const r = resolveIdentityLockedRepair({
      reference: {
        ok: true,
        characterId: speakers[idx].character_id,
        bbox: locks[idx],
        mouth: null,
        source: "lock_face",
      },
      candidates: CANDIDATES(frame),
      siblingCenters: locks.filter((_, i) => i !== idx).map(centerOfBox),
      siblingReferences: locks.filter((_, i) => i !== idx),
      pick: pickAssignedFace,
      positionalSlot: idx,
    });
    // Never the other person's face, and never a silent swap.
    assert(r.bbox !== (idx === 0 ? samuelNow : sarahNow), "identity was transferred");
    assertEquals(r.ok, false, "a crossing is not provable from anonymous geometry");
    assertEquals(r.reason, "identity_contested");
  }
});

// ═══ 5. the same-order control — V523 does not simply disable repair ═════
Deno.test("PURE — 5. an ordinary same-order repair still succeeds", () => {
  // Everyone stayed put and each drifted a little. This is the common case,
  // and it must keep working or the fix is just a block.
  const frame: Box[] = [
    [114, 286, 184, 392],
    [306, 276, 378, 386],
    [486, 281, 558, 391],
    [666, 271, 738, 381],
  ];
  for (let i = 0; i < 4; i++) {
    const r = repair({ idx: i, candidates: frame });
    assertEquals(r.ok, true, `speaker ${i}: ${r.reason} ${r.detail ?? ""}`);
    assertEquals(r.bbox, frame[i]);
    // Here the ordinal happens to agree — which is exactly why it looked
    // safe for so long.
    assertEquals(r.positionalWouldHavePicked, frame[i]);
  }
});

// ═══ 6. the requested character is not recoverable ═══════════════════════
Deno.test("PURE — 6. a missing character fails closed, with no substitute", () => {
  // Sarah has left the frame; the other three are present and one of them is
  // the leftmost remaining face.
  const frame = [SAMUEL_LOCKED, MATTHEW_LOCKED, KAY_LOCKED];
  const r = repair({ idx: 0, candidates: frame, positionalSlot: 0 });
  assertEquals(r.ok, false);
  assertEquals(r.reason, "identity_unresolved");
  assertEquals(r.bbox, undefined);
  assert(r.positionalWouldHavePicked !== null, "the old rule would have taken one");
});

Deno.test("PURE — 6. an empty repair frame is not an identity failure", () => {
  const r = repair({ idx: 0, candidates: [] });
  assertEquals(r.ok, false);
  assertEquals(r.reason, "no_candidates");
  assertEquals(r.candidatesConsidered, 0);
});

// ═══ 7. ambiguity ════════════════════════════════════════════════════════
Deno.test("PURE — 7. two equally plausible candidates fail closed", () => {
  // Two faces sit symmetrically about Sarah's locked box, equally far and
  // equally overlapping. Nothing in the existing evidence distinguishes
  // them, so the continuation is not provable.
  const a: Box = [98, 280, 168, 386];
  const b: Box = [118, 280, 188, 386];
  const r = repair({ idx: 0, candidates: [a, b], siblings: [] });
  assertEquals(r.ok, false);
  assertEquals(r.reason, "identity_unresolved");
  assertEquals(r.bbox, undefined);
});

// ═══ 8. sibling safety — identity outranks proximity ═════════════════════
Deno.test("PURE — 8. a nearer face belonging to another character is refused", () => {
  // Samuel has moved close to Sarah's locked position. His candidate sits
  // almost exactly on his own locked centre, so the sibling veto fires even
  // though he is well inside Sarah's drift radius.
  const samuelLockedNear: Box = [164, 287, 236, 393]; // centre [200,340]
  const samuelCandidate: Box = [162, 285, 234, 391]; // centre [198,338]
  const sarahCandidate: Box = [115, 287, 185, 393]; // centre [150,340]
  const r = resolveIdentityLockedRepair({
    reference: refFor(0),
    candidates: CANDIDATES([sarahCandidate, samuelCandidate]),
    siblingCenters: [centerOfBox(samuelLockedNear), centerOfBox(MATTHEW_LOCKED), centerOfBox(KAY_LOCKED)],
    siblingReferences: [samuelLockedNear, MATTHEW_LOCKED, KAY_LOCKED],
    pick: pickAssignedFace,
    positionalSlot: 0,
  });
  assert(!r.ok || r.bbox !== samuelCandidate, "the sibling must never be selected");
  // Samuel's locked box sits 50 px from Sarah's own candidate — inside his
  // own drift radius — so he could claim it too. Identity outranks
  // proximity in both directions: nobody gets it.
  assertEquals(r.ok, false);
  assertEquals(r.reason, "identity_contested");
});

Deno.test("PURE — 8. a well-separated cast still repairs normally", () => {
  // The same shape with the real generation-19 spacing: Samuel is 190 px
  // away, cannot claim Sarah's face, and the repair proceeds.
  const sarahCandidate: Box = [115, 287, 185, 393];
  const r = repair({ idx: 0, candidates: [sarahCandidate, SAMUEL_LOCKED, MATTHEW_LOCKED, KAY_LOCKED] });
  assertEquals(r.ok, true, `${r.reason} ${r.detail ?? ""}`);
  assertEquals(r.bbox, sarahCandidate);
});

// ═══ 9. no index-alignment assumption ════════════════════════════════════
Deno.test("PURE — 9. shuffled faces[] still resolve by characterId", () => {
  // `plate_identity.faces[]` is detector-ordered; `bboxes[]` and the
  // assignment lock are speaker-indexed. Nothing guarantees they agree.
  const shuffled = [
    { characterId: MATTHEW, bbox: MATTHEW_LOCKED },
    { characterId: KAY, bbox: KAY_LOCKED },
    { characterId: SAMUEL, bbox: SAMUEL_LOCKED },
    { characterId: SARAH, bbox: SARAH_LOCKED },
  ];
  const ref = resolveLockedIdentityReference({
    speakerIdx: 0,
    assignmentLock: LOCK,
    speakerCharacterId: SARAH,
    plateFaces: shuffled,
    // Deliberately WRONG for the index, to prove the index is not consulted
    // when a characterId match exists.
    hydratedBbox: KAY_LOCKED,
    hydratedSource: "plate-persisted-lock",
  });
  assertEquals(ref.ok, true);
  assertEquals(ref.source, "lock_face");
  assertEquals(ref.bbox, SARAH_LOCKED, "characterId beat array position");
  assertEquals(ref.characterId, SARAH);
});

Deno.test("PURE — 9. the accessor is characterId-only, and prefix-tolerant", () => {
  const faces = [
    { characterId: `outfit:${SARAH}`, bbox: SARAH_LOCKED },
    { characterId: SAMUEL, bbox: SAMUEL_LOCKED },
  ];
  assertEquals(findFacesByCharacterId(faces, SARAH).length, 1);
  assertEquals(findFacesByCharacterId(faces, `POSE:${SARAH}`).length, 1);
  assertEquals(findFacesByCharacterId(faces, KAY).length, 0);
  assertEquals(findFacesByCharacterId(faces, null).length, 0);
  assertEquals(findFacesByCharacterId(faces, ""), []);
  assertEquals(stripCharacterIdPrefix(`wardrobe:${SARAH}`), SARAH);
  assertEquals(stripCharacterIdPrefix(null), "");
});

Deno.test("PURE — 9. two faces claiming one character is an ambiguity, not a race", () => {
  const ref = resolveLockedIdentityReference({
    speakerIdx: 0,
    assignmentLock: LOCK,
    speakerCharacterId: SARAH,
    plateFaces: [
      { characterId: SARAH, bbox: SARAH_LOCKED },
      { characterId: `pose:${SARAH}`, bbox: GEN19_BAD },
    ],
    hydratedBbox: SARAH_LOCKED,
    hydratedSource: "plate-persisted-lock",
  });
  assertEquals(ref.ok, false);
  assertEquals(ref.reason, "identity_lock_ambiguous");
});

// ═══ the reference itself must be identity-derived ═══════════════════════
Deno.test("PURE — a positional reference is not an identity authority", () => {
  const ref = resolveLockedIdentityReference({
    speakerIdx: 0,
    assignmentLock: LOCK,
    speakerCharacterId: SARAH,
    plateFaces: [],
    hydratedBbox: SARAH_LOCKED,
    hydratedSource: "plate-persisted-positional",
  });
  assertEquals(ref.ok, false);
  assertEquals(ref.reason, "reference_not_identity_locked");
  // …and a repair built on it cannot proceed, however good the candidates.
  const r = repair({ idx: 0, candidates: [GEN19_SARAH], reference: ref });
  assertEquals(r.ok, false);
  assertEquals(r.reason, "identity_unresolved");
  assertEquals(r.detail, "reference:reference_not_identity_locked");
});

Deno.test("PURE — provenance strings are classified as production writes them", () => {
  for (const s of [
    "plate-persisted-lock",
    "plate-persisted-cid",
    "plate-persisted-mouth-lock",
    "plate-persisted-mouth-cid",
    "plate-identity-cid",
    "plate-identity-cid-rekognition",
  ]) assertEquals(isIdentityDerivedSource(s), true, s);
  for (const s of [
    "plate-persisted-positional",
    "plate-persisted-mouth-positional",
    "anchor-rescale",
    "",
    null,
  ]) assertEquals(isIdentityDerivedSource(s), false, String(s));
});

Deno.test("PURE — a lock that contradicts the cast slot fails closed", () => {
  const ref = resolveLockedIdentityReference({
    speakerIdx: 0,
    assignmentLock: { "0": KAY },
    speakerCharacterId: SARAH,
    plateFaces: [{ characterId: SARAH, bbox: SARAH_LOCKED }],
    hydratedBbox: SARAH_LOCKED,
    hydratedSource: "plate-persisted-lock",
  });
  assertEquals(ref.ok, false);
  assertEquals(ref.reason, "identity_lock_conflict");
});

Deno.test("PURE — no characterId anywhere is a refusal, not a fallback", () => {
  const ref = resolveLockedIdentityReference({
    speakerIdx: 0,
    assignmentLock: {},
    speakerCharacterId: null,
    plateFaces: [{ characterId: SARAH, bbox: SARAH_LOCKED }],
    hydratedBbox: SARAH_LOCKED,
    hydratedSource: "plate-persisted-lock",
  });
  assertEquals(ref.ok, false);
  assertEquals(ref.reason, "no_character_id");
});

// ═══ CONTRACT — wiring ═══════════════════════════════════════════════════
const read = (rel: string) => Deno.readTextFileSync(new URL(rel, import.meta.url));
const codeOnly = (src: string) =>
  src.split(/\r?\n/).map((l) => {
    const t = l.trim();
    return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") ? "" : l;
  }).join("\n");

const DIALOG = codeOnly(read("../compose-dialog-segments/index.ts"));
const HELPER = codeOnly(read("./v523-identity-repair.ts"));

Deno.test("CONTRACT — 3/4. the ordinal no longer decides who a face belongs to", () => {
  // The x-sort survives only as the candidate list and as telemetry.
  assert(DIALOG.includes("const v523NeedsIdentity = speakers.length >= 3 && !!plateDims;"));
  assert(DIALOG.includes("resolveLockedIdentityReference({"));
  assert(DIALOG.includes("pick: pickAssignedFace,"));
  // Exclusivity is not optional at the call site either: the locked boxes of
  // the rest of the cast travel with every repair.
  assert(DIALOG.includes("siblingReferences: v523SiblingRefs,"));
  assert(DIALOG.includes("v523SiblingRefs.push(sb as [number, number, number, number]);"));
  // The repaired box comes from the identity result, never from `sortedBoxes[slot]`
  // once identity is required.
  assert(DIALOG.includes("const v523Box = v523Repair?.bbox ?? null;"));
  assert(DIALOG.includes('source: v523Box'));
  assert(DIALOG.includes('? "v523_identity_locked_repair"'));
  // The retired answer is recorded, not used.
  assert(DIALOG.includes("v523_positional_would_have: v523Repair?.positionalWouldHavePicked ?? null,"));
});

Deno.test("CONTRACT — 6/10. an unprovable repair blocks before any dispatch", () => {
  assert(DIALOG.includes("if (v523NeedsIdentity && !v523Repair?.ok) {"));
  // The frame loop moves on; only the end of the loop is a refusal.
  const at = DIALOG.indexOf("if (v523NeedsIdentity && !v523Repair?.ok) {");
  assert(at > 0 && DIALOG.slice(at, at + 900).includes("continue;"));
  assert(DIALOG.includes("`face_repair_identity_unresolved_pass_${pass.idx}_speaker_${pass.speaker_name}`"));
  assert(DIALOG.includes("identityHardFail: true,"));
  // …and the block happens in the face-gate, which returns 422 before the
  // provider is ever contacted.
  const block = DIALOG.indexOf("const v523Block = firstReject.identityHardFail === true;");
  const dispatch = DIALOG.indexOf("v406_canonical_boxes_frozen");
  assert(block > 0 && dispatch > block, "the identity block precedes every dispatch path");
});

Deno.test("CONTRACT — 10. the v283 soft-pass cannot demote an identity refusal", () => {
  assert(DIALOG.includes("const v523IdentityReject = gateResults.find("));
  assert(DIALOG.includes("if (firstReject && plateIdentityAuthoritative && !v523IdentityReject) {"));
  // The identity refusal is also the one that gets reported.
  assert(DIALOG.includes("const firstReject = (v523IdentityReject ??"));
});

Deno.test("CONTRACT — 11. V523 adds no second refund", () => {
  // The face-gate block already refunds exactly once; V523 reuses that path
  // and writes no wallet update of its own.
  assertEquals(HELPER.includes("wallets"), false);
  assertEquals(HELPER.includes("supabase"), false);
  const at = DIALOG.indexOf("FACE-GATE BLOCK (hard)");
  const end = DIALOG.indexOf("const MAX_INFLIGHT", at);
  assert(at > 0 && end > at);
  assertEquals(
    DIALOG.slice(at, end).split('.from("wallets")').length - 1,
    2,
    "one balance read + one refund write, exactly as before V523",
  );
});

Deno.test("CONTRACT — 12. no fabricated face reaches the track or V520", () => {
  // Coordinates are written only after a proven repair: the refusal path
  // `continue`s before `pass.coords` is touched.
  const at = DIALOG.indexOf("if (v523NeedsIdentity && !v523Repair?.ok) {");
  const cont = DIALOG.indexOf("continue;", at);
  const write = DIALOG.indexOf("pass.coords = clampSyncCoords(repaired);", at);
  assert(at > 0 && cont > at && write > cont, "the refusal returns before any coord write");
  // And V520 is untouched by this release.
  const feas = read("./v520-track-feasibility.ts");
  assertEquals(feas.includes("V523"), false);
});

Deno.test("CONTRACT — 5/11. one continuation rule, no new thresholds", () => {
  // Every number the repair depends on lives in `plate-face-track.ts`.
  const track = read("./plate-face-track.ts");
  assert(track.includes("export const TRACK_MIN_IOU = 0.15;"));
  assert(track.includes("export const TRACK_MAX_CENTER_DRIFT = 0.7;"));
  assert(track.includes("export const TRACK_AMBIGUITY_DIST_RATIO = 1.15;"));
  assertEquals(track.includes("V523"), false, "the picker is reused, not modified");
  // The helper declares no threshold of its own and never reimplements the
  // picker — it is injected.
  assertEquals(/const\s+[A-Z_]{4,}\s*=\s*[0-9]/.test(HELPER), false, "no new constants");
  assertEquals(HELPER.includes("plate-face-track.ts"), false, "leaf module, picker injected");
  assertEquals(HELPER.includes("TRACK_MIN_IOU"), false);
});

Deno.test("CONTRACT — frozen: V516, V520, V521, V522 untouched", () => {
  for (const f of [
    "./v516-mouth-coherence.ts",
    "./v520-track-feasibility.ts",
    "./compute-mouth-centered-crop.ts",
    "./pass-face-preclip.ts",
    "./preclip-crop-containment.ts",
    "./v464-asd-projection.ts",
    "./v461-face-gate.ts",
  ]) assertEquals(read(f).includes("V523"), false, f);
});
