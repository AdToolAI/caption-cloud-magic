/**
 * V516 — MOUTH AUTHORITY / SNAPSHOT BBOX COHERENCE
 *
 * Scene 67b392b1, generation 14, pass 5 (Kay Mark). The pre-dispatch gate
 * refused the pass with `preclip_mouth_roi_outside_crop` at margin −0.0658,
 * and every number it reported was right. The crop it judged was built from a
 * snapshot box measured at one frame and a mouth median measured over the
 * whole turn, 4 px apart at the box edge.
 *
 *   PURE     — executes the decision logic.
 *   GEOMETRY — drives the real planner and the real gate end to end.
 *   CONTRACT — asserts wiring no unit test can reach.
 */

import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  buildV516MouthAuthorityTelemetry,
  chooseCoherentMouthAuthority,
  mouthInsideBbox,
} from "./v516-mouth-coherence.ts";
import { computeMouthCenteredCrop } from "./compute-mouth-centered-crop.ts";
import { buildDispatchFaceBox } from "./plate-face-dispatch-box.ts";
import { resolveMouthAnchorPoseAware } from "./v456-roi-contract.ts";
import { evaluateV461FaceGate, V461_FACE_SHARE_FLOOR } from "./v461-face-gate.ts";

// ── The generation-14 plate and cast, exactly as measured ────────────────
const PLATE = { width: 656, height: 1406 };
const KAY_BBOX: [number, number, number, number] = [572, 474, 637, 581];
/** The V477 turn median. 641 is 4 px beyond the box's right edge (637). */
const KAY_TRACK_MOUTH: [number, number] = [641, 528];

/** The five passes that succeeded, with their production crops. */
const CONTROLS = [
  { name: "Sarah p0", bbox: [80, 502, 271, 693], crop: { x: 80, y: 502, size: 191 } },
  { name: "Sarah p1", bbox: [53, 513, 244, 704], crop: { x: 53, y: 513, size: 191 } },
  { name: "Samuel p2", bbox: [210, 487, 361, 638], crop: { x: 210, y: 487, size: 151 } },
  { name: "Samuel p3", bbox: [196, 497, 347, 648], crop: { x: 196, y: 497, size: 151 } },
  { name: "Matthew p4", bbox: [359, 649, 412, 722], crop: { x: 337, y: 656, size: 126 } },
] as const;

// ═══ Part A — the Kay fixture ════════════════════════════════════════════
Deno.test("PURE — A. the generation-14 track mouth is rejected for this bbox", () => {
  const d = chooseCoherentMouthAuthority({
    bbox: KAY_BBOX,
    trackMouth: KAY_TRACK_MOUTH,
    snapshotMouth: null,
  });
  assertEquals(d.requestedSource, "v477_track");
  assertEquals(d.selectedSource, "pose_estimate");
  assertEquals(d.landmark, null);
  assertEquals(d.rejectedReason, "track_mouth_outside_snapshot_bbox");
  assertEquals(d.coherenceChecked, true);
  // 641 > 637 is the whole of it — four pixels.
  assertEquals(mouthInsideBbox(KAY_TRACK_MOUTH, KAY_BBOX), false);
});

Deno.test("PURE — B. a coherent same-snapshot landmark takes over", () => {
  const snapshot: [number, number] = [604, 550];
  const d = chooseCoherentMouthAuthority({
    bbox: KAY_BBOX,
    trackMouth: KAY_TRACK_MOUTH,
    snapshotMouth: snapshot,
  });
  assertEquals(d.selectedSource, "snapshot_landmark");
  assertEquals(d.landmark, snapshot);
  assertEquals(d.rejectedReason, "track_mouth_outside_snapshot_bbox");
});

Deno.test("PURE — C. with no snapshot landmark the pose estimate decides", () => {
  const d = chooseCoherentMouthAuthority({ bbox: KAY_BBOX, trackMouth: KAY_TRACK_MOUTH });
  assertEquals(d.landmark, null);
  assertEquals(d.selectedSource, "pose_estimate");
  // The resolver's own math is untouched: a null landmark reaches its
  // existing pose path and produces a point inside the box.
  const r = resolveMouthAnchorPoseAware({ bbox: KAY_BBOX, landmark: null, yawDeg: 0 });
  assert(r !== null);
  assertEquals(r!.source, "pose_estimate");
  assert(mouthInsideBbox(r!.mouth, KAY_BBOX), "the pose estimate must be coherent by construction");
});

// ═══ Part E/F/G — the coherence contract itself ══════════════════════════
Deno.test("PURE — E. a coherent track mouth keeps its authority", () => {
  const inside: [number, number] = [605, 550];
  const d = chooseCoherentMouthAuthority({
    bbox: KAY_BBOX,
    trackMouth: inside,
    snapshotMouth: [600, 545],
  });
  assertEquals(d.selectedSource, "v477_track");
  assertEquals(d.landmark, inside);
  assertEquals(d.rejectedReason, null);
});

Deno.test("PURE — F/G. the boundary is inclusive, one pixel past it is not", () => {
  for (const p of [[637, 528], [572, 528], [605, 474], [605, 581], [572, 474], [637, 581]]) {
    assert(mouthInsideBbox(p, KAY_BBOX), `${JSON.stringify(p)} is on the boundary and must be accepted`);
    assertEquals(chooseCoherentMouthAuthority({ bbox: KAY_BBOX, trackMouth: p }).selectedSource, "v477_track");
  }
  for (const p of [[638, 528], [571, 528], [605, 473], [605, 582]]) {
    assert(!mouthInsideBbox(p, KAY_BBOX), `${JSON.stringify(p)} is outside and must be rejected`);
    assertEquals(chooseCoherentMouthAuthority({ bbox: KAY_BBOX, trackMouth: p }).selectedSource, "pose_estimate");
  }
});

Deno.test("PURE — an unreadable bbox reproduces the pre-V516 behaviour verbatim", () => {
  // Refusing a landmark because we could not read the box would be a new
  // failure mode, not a fix.
  for (const bad of [null, undefined, [1, 2, 3], [0, 0, 0, 0], [10, 10, 5, 20], "x"]) {
    const d = chooseCoherentMouthAuthority({ bbox: bad, trackMouth: KAY_TRACK_MOUTH, snapshotMouth: [1, 2] });
    assertEquals(d.landmark, KAY_TRACK_MOUTH, `bbox ${JSON.stringify(bad)} must not change the landmark`);
    assertEquals(d.coherenceChecked, false);
    assertEquals(d.rejectedReason, null);
  }
  const d = chooseCoherentMouthAuthority({ bbox: null, trackMouth: null, snapshotMouth: [1, 2] });
  assertEquals(d.landmark, [1, 2]);
});

Deno.test("PURE — J/13. an incoherent pair never forwards a landmark", () => {
  const d = chooseCoherentMouthAuthority({
    bbox: KAY_BBOX,
    trackMouth: [641, 528],
    snapshotMouth: [700, 900],
  });
  assertEquals(d.landmark, null);
  assertEquals(d.selectedSource, "pose_estimate");
  assertEquals(d.rejectedReason, "track_mouth_outside_snapshot_bbox");
  // And with no track at all, the incoherent snapshot is still refused.
  const e = chooseCoherentMouthAuthority({ bbox: KAY_BBOX, snapshotMouth: [700, 900] });
  assertEquals(e.landmark, null);
  assertEquals(e.rejectedReason, "snapshot_mouth_outside_snapshot_bbox");
});

Deno.test("PURE — non-finite inputs are treated as absent, never as zero", () => {
  for (const bad of [[NaN, 500], [605, null], ["a", "b"], [605], null, undefined]) {
    const d = chooseCoherentMouthAuthority({ bbox: KAY_BBOX, trackMouth: bad });
    assertEquals(d.trackMouth, null, `${JSON.stringify(bad)} must not read as a point`);
    assertEquals(d.requestedSource, "pose_estimate");
    assertEquals(d.rejectedReason, null);
  }
});

Deno.test("PURE — telemetry is bounded and URL-free", () => {
  const t = buildV516MouthAuthorityTelemetry(
    chooseCoherentMouthAuthority({ bbox: KAY_BBOX, trackMouth: KAY_TRACK_MOUTH }),
  );
  assertEquals(Object.keys(t).sort(), [
    "bbox", "coherence_checked", "rejected_reason", "requested_source",
    "selected_source", "snapshot_mouth", "track_mouth", "version",
  ]);
  assert(!JSON.stringify(t).includes("://"));
});

// ═══ Part D — the geometry, end to end through the real planner + gate ═══
/** Plan a crop exactly the way `pass-face-preclip` does, then gate it. */
function planAndGate(bbox: [number, number, number, number], mouth: [number, number] | null) {
  const center: [number, number] = [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
  const r = computeMouthCenteredCrop({
    face: { bbox, center, mouth: mouth ?? undefined },
    plateWidth: PLATE.width,
    plateHeight: PLATE.height,
    targetFaceShare: 0.42,
    minSize: 128,
    outputSize: 720,
    containBox: buildDispatchFaceBox(bbox, PLATE),
    faceShareFloor: V461_FACE_SHARE_FLOOR,
  });
  const gate = evaluateV461FaceGate({
    usePreclip: true,
    faceShare: r.faceShareInCrop,
    faceBbox: bbox,
    crop: { size: r.crop.size, outputSize: r.crop.outputSize },
    anchor: r.anchor === "mouth" ? "mouth" : r.anchor,
    mouthOffsetXy: r.mouthOffsetXy,
  });
  return { r, gate };
}

Deno.test("GEOMETRY — D. the incoherent pair reproduces the production failure", () => {
  const { r, gate } = planAndGate(KAY_BBOX, KAY_TRACK_MOUTH);
  // The exact production geometry, to the pixel.
  assertEquals(r.crop.size, 165);
  assertEquals(r.crop.x, 491);
  assertEquals(r.mouthOffsetXy?.dx, 67.5);
  assertEquals(r.faceShareInCrop, 0.25546372819100094);
  assertEquals(gate.metrics.mouth_roi?.centerX, 0.9090909090909092);
  assertEquals(gate.metrics.mouth_roi_worst_margin, -0.06577551037372564);
  assertEquals(gate.code, "preclip_mouth_roi_outside_crop");
  assertEquals(gate.failedCheck, "mouth_roi");
});

Deno.test("GEOMETRY — D. the coherent fallback passes the same gate", () => {
  // What the wired pairing layer now hands the planner for generation 14.
  const d = chooseCoherentMouthAuthority({ bbox: KAY_BBOX, trackMouth: KAY_TRACK_MOUTH });
  const resolved = resolveMouthAnchorPoseAware({ bbox: KAY_BBOX, landmark: d.landmark, yawDeg: 0 });
  assert(resolved !== null);
  const { r, gate } = planAndGate(KAY_BBOX, resolved!.mouth);

  assertEquals(gate.status, "pass");
  assertEquals(gate.code, "face_gate_ok");
  assertEquals(gate.checks.mouth_roi, true);
  assert(
    (gate.metrics.mouth_roi_worst_margin ?? -1) > 0,
    `margin must be positive, was ${gate.metrics.mouth_roi_worst_margin}`,
  );
  // The crop still clamps at the plate edge — that was never the defect.
  assertEquals(r.crop.size, 165);
  assertEquals(r.crop.x, 491);
  assert(Math.abs(r.mouthOffsetXy!.dx) < 67.5, "the offset must shrink, not the crop");
});

Deno.test("GEOMETRY — the size-independence of the old overhang", () => {
  // The band's half-width in plate px does not depend on the crop size, so no
  // crop the planner could have chosen would have contained a mouth 15 px from
  // the plate edge. Documented so a future fix is never attempted in the
  // planner.
  const halfBandPlatePx = 0.62 * Math.sqrt(65 * 107) / 2;
  assert(halfBandPlatePx > PLATE.width - KAY_TRACK_MOUTH[0]);
  for (const size of [128, 140, 165, 200, 300]) {
    const share = (65 * 107) / (size * size);
    const x = Math.min(PLATE.width - size, Math.round(KAY_TRACK_MOUTH[0] - size / 2));
    const dx = KAY_TRACK_MOUTH[0] - (x + size / 2);
    const centerX = 0.5 + dx / size;
    const width = 0.62 * Math.sqrt(share);
    const overhangPx = (centerX + width / 2 - 1) * size;
    assert(Math.abs(overhangPx - 10.853) < 0.01, `size ${size} overhang ${overhangPx}`);
  }
});

// ═══ Part I — the five controls ═════════════════════════════════════════
Deno.test("PURE — I. every successful pass keeps its authority decision", () => {
  for (const c of CONTROLS) {
    const bbox = c.bbox as unknown as [number, number, number, number];
    // Their crops are unclamped, so the mouth sat at the crop centre.
    const mouth: [number, number] = [c.crop.x + c.crop.size / 2, c.crop.y + c.crop.size / 2];
    assert(
      mouthInsideBbox(mouth, bbox) || c.name.startsWith("Matthew"),
      `${c.name}: centre ${JSON.stringify(mouth)} vs bbox ${JSON.stringify(bbox)}`,
    );
    const d = chooseCoherentMouthAuthority({ bbox, trackMouth: mouth });
    if (mouthInsideBbox(mouth, bbox)) {
      assertEquals(d.selectedSource, "v477_track", `${c.name} must keep the track authority`);
      assertEquals(d.rejectedReason, null);
    }
    // None of them is clamped at the plate edge — that is why they passed.
    assert(c.crop.x < PLATE.width - c.crop.size, `${c.name} must not sit at the plate edge`);
  }
});

Deno.test("GEOMETRY — I. Matthew's control geometry still passes the gate", () => {
  const { gate } = planAndGate([359, 649, 412, 722], [400, 719]);
  assertEquals(gate.status, "pass");
  assertEquals(gate.checks.mouth_roi, true);
});

// ═══ CONTRACT — wiring ══════════════════════════════════════════════════
const DIALOG = Deno.readTextFileSync(new URL("../compose-dialog-segments/index.ts", import.meta.url));
const codeOnly = (src: string) =>
  src.split(/\r?\n/).map((l) => (l.trim().startsWith("//") ? "" : l)).join("\n");

Deno.test("CONTRACT — B. the decision sits at the v477/snapshot pairing", () => {
  const code = codeOnly(DIALOG);
  assert(code.includes("const v516Mouth = chooseCoherentMouthAuthority({"));
  assert(code.includes("trackMouth: v477Authority.mouth ?? null,"));
  assert(code.includes("snapshotMouth: v456DetectedMouth ?? null,"));
  // The old pairing must be gone — exactly one landmark expression survives.
  assertEquals(code.split("landmark: v477Authority.mouth ?? v456DetectedMouth").length - 1, 0);
  assert(code.includes("landmark: v516Mouth.landmark,"));
});

Deno.test("CONTRACT — H/7. the preliminary snapshot/snapshot pairing is untouched", () => {
  const code = codeOnly(DIALOG);
  // Same bbox, same-snapshot landmark, no coherence layer: temporally coherent
  // already, and it feeds the track identity tiebreak.
  assert(code.includes("const v456MouthPreliminary = resolveMouthAnchorPoseAware({"));
  const at = code.indexOf("const v456MouthPreliminary");
  const body = code.slice(at, code.indexOf("})", at));
  assert(body.includes("landmark: v456DetectedMouth,"), "the preliminary landmark must stay direct");
  assertEquals(body.includes("v516Mouth"), false, "no coherence layer on the preliminary call");
  assertEquals(body.includes("chooseCoherentMouthAuthority"), false);
});

Deno.test("CONTRACT — the frozen modules carry no V516 edit", () => {
  for (
    const rel of [
      "./v456-roi-contract.ts",
      "./v477-mouth-authority.ts",
      "./v461-face-gate.ts",
      "./compute-mouth-centered-crop.ts",
      "./pass-face-preclip.ts",
    ]
  ) {
    const src = Deno.readTextFileSync(new URL(rel, import.meta.url));
    assertEquals(src.includes("v516"), false, `${rel} must not reference v516`);
    assertEquals(src.includes("V516"), false, `${rel} must not reference V516`);
  }
  // And the gate's constants are exactly where V461 left them.
  const gate = Deno.readTextFileSync(new URL("./v461-face-gate.ts", import.meta.url));
  assert(gate.includes("export const V461_FACE_SHARE_FLOOR = 0.24;"));
  assert(gate.includes("export const V461_FACE_SIZE_PROVIDER_PX_FLOOR = 144;"));
});

Deno.test("CONTRACT — K. the gate still refuses a genuinely invalid ROI", () => {
  const g = evaluateV461FaceGate({
    usePreclip: true,
    faceShare: 0.42,
    faceBbox: [100, 100, 300, 300],
    crop: { size: 300, outputSize: 720 },
    anchor: "mouth",
    // A mouth far outside the crop — must still block.
    mouthOffsetXy: { dx: 200, dy: 0 },
  });
  assertEquals(g.status, "block");
  assertEquals(g.code, "preclip_mouth_roi_outside_crop");
});
