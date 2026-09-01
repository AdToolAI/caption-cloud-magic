/**
 * V536 — DYNAMIC MOUTH CONTAINMENT CONTRACT.
 *
 * Acceptance test N1-02 ("Dreiviertel mit Bewegung", one speaker, dynamic
 * camera path, scene afad496f, run 89149a29) died pre-dispatch on
 * `preclip_mouth_roi_outside_crop`. Face share 0.365 against a 0.24 floor and
 * provider face size 466.98 px against a 144 px floor were both healthy; the
 * V434 mouth band overhung the rendered crop by 0.65 % of its width at
 * t = 1.4954.
 *
 * The planner solved the crop centre from the FACE box alone and then wrote
 * the frame's mouth onto the keyframe as a passenger. V461 read exactly that
 * mouth back, put the full unclamped V434 band around it, and required the
 * band to fit — a contract nothing upstream had ever been asked to satisfy.
 * The planner's satisfaction set was a strict superset of the gate's
 * acceptance set, so every solution in the difference was a guaranteed
 * pre-dispatch failure produced by the planner using its own data.
 *
 * These tests pin the unified contract, the planner reserve, the
 * render-cadence proof, and the fact that V461 lost no strictness.
 */
import { assert, assertAlmostEquals, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildInfeasibility,
  feasibleCropCentre,
  mouthRoiInCrop,
  projectIntoInterval,
  roiContainmentMargin,
  roiFullyInside,
  v434MouthBand,
  verifyPathAtRenderCadence,
  type Box,
} from "./mouth-crop-feasibility.ts";
import { V434_MOUTH_BAND } from "./v434-motion-roi.ts";
import {
  buildDynamicCameraPath,
  CONTAINMENT_PAD_RATIO,
  KEYFRAME_TOLERANCE_PX,
  MAX_ADVERSE_ORIGIN_SHIFT_PX,
  MOUTH_RESERVE_PX,
  sampleCameraPath,
  type TrackSample,
} from "./dynamic-camera-path.ts";
import {
  evaluateV461FaceGate,
  V461_FACE_SHARE_FLOOR,
  V461_FACE_SIZE_PROVIDER_PX_FLOOR,
} from "./v461-face-gate.ts";

// ── The incident, exactly as production reported it ───────────────────────

const N1_02 = {
  faceShare: 0.3653493045957441,
  bandWidth: 0.3747536159753552,
  bandHeight: 0.20551004747035612,
  worstT: 1.4954,
  centerX: 0.8191214470284238,
  centerY: 0.599483204134367,
  margin: -0.006498255016101462,
};

// ─────────────────────────────────────────────────────────────────────
// J — the band is one derivation, shared.
// ─────────────────────────────────────────────────────────────────────

Deno.test("J — the shared band reproduces the N1-02 production numbers exactly", () => {
  const b = v434MouthBand(N1_02.faceShare);
  assertEquals(b.width, N1_02.bandWidth);
  assertEquals(b.height, N1_02.bandHeight);

  // And the reported margin follows from it.
  const roi = { centerX: N1_02.centerX, centerY: N1_02.centerY, ...b };
  assertEquals(roiContainmentMargin(roi), N1_02.margin);
  assertEquals(roiFullyInside(roi), false);
});

Deno.test("J2 — helper and V461 agree across a faceShare sweep", () => {
  const GATE = Deno.readTextFileSync(new URL("./v461-face-gate.ts", import.meta.url));
  // V461 no longer carries its own derivation; it delegates.
  assert(GATE.includes("return v434MouthBand(faceShare);"), "gate delegates the band");
  assert(!GATE.includes("V434_MOUTH_BAND.widthOfFaceSide"), "no second copy of the derivation");
  assert(GATE.includes("return sharedRoiFullyInside(roi);"), "gate delegates the predicate");
  assert(GATE.includes("return sharedRoiMargin(roi);"), "gate delegates the margin");

  // The derivation itself is unchanged: recompute it independently.
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  for (let s = 0.01; s <= 1.0; s += 0.0137) {
    const f = clamp(Math.sqrt(s), 0.05, 1);
    const expect = {
      width: clamp(V434_MOUTH_BAND.widthOfFaceSide * f, V434_MOUTH_BAND.minWidth, V434_MOUTH_BAND.maxWidth),
      height: clamp(V434_MOUTH_BAND.heightOfFaceSide * f, V434_MOUTH_BAND.minHeight, V434_MOUTH_BAND.maxHeight),
    };
    assertEquals(v434MouthBand(s), expect, `share ${s}`);
  }
});

// ─────────────────────────────────────────────────────────────────────
// B — the incident geometry.
// ─────────────────────────────────────────────────────────────────────

/**
 * Incident-SHAPED, not incident-replayed: production no longer persists the
 * raw `b[0]/b[2]/mx/size` for run 89149a29, so nothing here pretends to be
 * those values. What is reproduced is the exact failing RELATION — a crop
 * whose mouth band overhangs the right edge by N1-02's margin — and the exact
 * band it is measured with.
 */
const SIZE = 772;
const PLATE = { width: 1920, height: 1080 };

/** A crop origin that places the mouth exactly at N1-02's centerX. */
function incidentCrop(mouthX: number) {
  return { x: mouthX - N1_02.centerX * SIZE, y: 0, size: SIZE };
}

Deno.test("B — the old face-only geometry is exactly what V461 rejects", () => {
  const mouthX = 1200;
  const crop = incidentCrop(mouthX);
  const roi = mouthRoiInCrop(N1_02.faceShare, { x: mouthX, y: crop.y + N1_02.centerY * SIZE }, crop);
  assertAlmostEquals(roi.centerX, N1_02.centerX, 1e-9);
  assertAlmostEquals(roiContainmentMargin(roi), N1_02.margin, 1e-9);
  assertEquals(roiFullyInside(roi), false, "this is the shipped failure");
});

Deno.test("B2 — the shared solver moves that same case into a valid margin", () => {
  const mouthX = 1200;
  const mouthY = 500;
  // A face box the old solver would have been happy with: the crop that
  // contains it with pad is exactly the one that pushed the mouth out.
  const old = incidentCrop(mouthX);
  const faceBox: Box = [old.x + 60, mouthY - 300, old.x + 60 + 466, mouthY + 166];
  const feas = feasibleCropCentre({
    faceBox,
    mouth: { x: mouthX, y: mouthY },
    faceShare: N1_02.faceShare,
    size: SIZE,
    facePad: SIZE * CONTAINMENT_PAD_RATIO,
    plateWidth: PLATE.width,
    plateHeight: PLATE.height,
    mouthReservePx: MOUTH_RESERVE_PX,
  });
  assert(feas.ok, `expected a feasible interval, empty on ${feas.emptyAxis}`);
  assert(feas.mouthConstrained, "the mouth participated");

  // Project the OLD (failing) centre into the interval and re-measure.
  const oldCentre = old.x + SIZE / 2;
  const cx = projectIntoInterval(oldCentre, feas.x);
  const cy = projectIntoInterval(mouthY, feas.y);
  assert(cx > oldCentre, "the crop had to move right");
  const fixed = { x: cx - SIZE / 2, y: cy - SIZE / 2, size: SIZE };
  const roi = mouthRoiInCrop(N1_02.faceShare, { x: mouthX, y: mouthY }, fixed);
  assert(roiFullyInside(roi), "mouth band now fits");
  assert(roiContainmentMargin(roi) >= 0, "true margin, no tolerance");

  // The face is still contained with its unchanged pad.
  const pad = SIZE * CONTAINMENT_PAD_RATIO;
  assert(faceBox[0] - pad >= fixed.x && faceBox[2] + pad <= fixed.x + SIZE, "face still held");
});

// ─────────────────────────────────────────────────────────────────────
// C–G — the feasibility algebra.
// ─────────────────────────────────────────────────────────────────────

const base = {
  faceShare: 0.36,
  size: 800,
  facePad: 800 * CONTAINMENT_PAD_RATIO,
  plateWidth: 4000,
  plateHeight: 4000,
};

Deno.test("C — a horizontal mouth violation is corrected", () => {
  const faceBox: Box = [1000, 1000, 1480, 1480];
  const mouth = { x: 1460, y: 1300 }; // near the face's right edge
  const feas = feasibleCropCentre({ ...base, faceBox, mouth, mouthReservePx: 0 });
  assert(feas.ok);
  const band = v434MouthBand(base.faceShare);
  // The rightmost admissible centre still leaves the band inside.
  const crop = { x: feas.x.hi - base.size / 2, y: feas.y.lo - base.size / 2, size: base.size };
  const roi = mouthRoiInCrop(base.faceShare, mouth, crop);
  assertAlmostEquals(roi.width, band.width, 1e-12);
  assert(roiContainmentMargin(roi) >= -1e-12);
});

Deno.test("D — a vertical mouth violation is corrected", () => {
  const faceBox: Box = [1000, 1000, 1480, 1480];
  const mouth = { x: 1240, y: 1465 }; // near the face's bottom edge
  const feas = feasibleCropCentre({ ...base, faceBox, mouth, mouthReservePx: 0 });
  assert(feas.ok);
  const crop = { x: feas.x.lo - base.size / 2, y: feas.y.lo - base.size / 2, size: base.size };
  const roi = mouthRoiInCrop(base.faceShare, mouth, crop);
  assert(roiContainmentMargin(roi) >= -1e-12, "vertical band held");
});

Deno.test("E — face and mouth constraints can both bind", () => {
  const faceBox: Box = [1000, 1000, 1600, 1600];
  const mouth = { x: 1570, y: 1300 };
  const withMouth = feasibleCropCentre({ ...base, faceBox, mouth, mouthReservePx: 0 });
  const faceOnly = feasibleCropCentre({ ...base, faceBox, mouth: null, mouthReservePx: 0 });
  assert(withMouth.ok && faceOnly.ok);
  // The mouth strictly tightens the interval it binds on.
  assert(withMouth.x.lo >= faceOnly.x.lo && withMouth.x.hi <= faceOnly.x.hi);
  assert(withMouth.x.lo > faceOnly.x.lo, "mouth is the binding lower bound here");
  assertEquals(faceOnly.mouthConstrained, false);
});

Deno.test("F — the plate edge and the mouth constrain together", () => {
  const faceBox: Box = [40, 1000, 520, 1480];
  const mouth = { x: 80, y: 1300 };
  const feas = feasibleCropCentre({
    ...base,
    faceBox,
    mouth,
    plateWidth: 1000,
    plateHeight: 4000,
    mouthReservePx: 0,
  });
  // Plate floor is size/2 = 400; the mouth wants the centre no lower than
  // mouth + halfBand - half. Whichever is larger wins, and it is the plate.
  assert(feas.x.lo >= base.size / 2, "plate bound respected");
  if (feas.ok) {
    const crop = { x: feas.x.lo - base.size / 2, y: feas.y.lo - base.size / 2, size: base.size };
    assert(crop.x >= 0, "crop never leaves the plate");
  }
});

Deno.test("G — a genuinely empty intersection is reported precisely", () => {
  // A face wider than the crop can hold with pad: no centre satisfies it.
  const faceBox: Box = [1000, 1000, 1900, 1480];
  const feas = feasibleCropCentre({ ...base, faceBox, mouth: { x: 1450, y: 1300 }, mouthReservePx: 0 });
  assertEquals(feas.ok, false);
  assertEquals(feas.emptyAxis, "x");

  const info = buildInfeasibility({
    axis: feas.emptyAxis!,
    frame: 7,
    t: 0.2333,
    input: { ...base, faceBox, mouth: { x: 1450, y: 1300 }, mouthReservePx: 0 },
    feasibility: feas,
  });
  assertEquals(info.reason, "dynamic_mouth_crop_infeasible");
  assertEquals(info.axis, "x");
  assertEquals(info.frame, 7);
  assertEquals(info.cropSize, 800);
  assertEquals(info.faceWidth, 900);
  assertAlmostEquals(info.bandWidthPx!, v434MouthBand(base.faceShare).width * 800, 1e-9);
  // N — bounded scalars only.
  for (const v of Object.values(info)) {
    assert(v === null || ["string", "number"].includes(typeof v), `scalar only, got ${typeof v}`);
  }
  const json = JSON.stringify(info);
  for (const f of ["http", "url", "base64", "data:", "Bytes"]) {
    assert(!json.toLowerCase().includes(f.toLowerCase()), `no ${f}`);
  }
});

// ─────────────────────────────────────────────────────────────────────
// H / I — the untouched paths.
// ─────────────────────────────────────────────────────────────────────

Deno.test("H — a null mouth leaves the face-only interval exactly as it was", () => {
  const faceBox: Box = [1000, 1000, 1480, 1480];
  const feas = feasibleCropCentre({ ...base, faceBox, mouth: null, mouthReservePx: MOUTH_RESERVE_PX });
  assertEquals(feas.mouthConstrained, false);
  // Precisely the legacy bounds.
  const half = base.size / 2;
  assertEquals(feas.x.lo, faceBox[2] + base.facePad - half);
  assertEquals(feas.x.hi, faceBox[0] - base.facePad + half);
  assertEquals(feas.y.lo, faceBox[3] + base.facePad - half);
  assertEquals(feas.y.hi, faceBox[1] - base.facePad + half);
});

Deno.test("I — no faceShare means no mouth constraint at all", () => {
  const faceBox: Box = [1000, 1000, 1480, 1480];
  for (const share of [0, -1, Number.NaN]) {
    const feas = feasibleCropCentre({
      ...base,
      faceShare: share,
      faceBox,
      mouth: { x: 1470, y: 1300 },
      mouthReservePx: 0,
    });
    assertEquals(feas.mouthConstrained, false, `share ${share} must not constrain`);
  }
  // And the planner honours the same rule end to end.
  const PATH = Deno.readTextFileSync(new URL("./dynamic-camera-path.ts", import.meta.url));
  assert(PATH.includes("const mouthAuthority = Number.isFinite(shareForBand) && shareForBand > 0;"));
  assert(PATH.includes("const m = mouthAuthority ? mouthAt(i) : null;"));
});

// ─────────────────────────────────────────────────────────────────────
// K — the reserve survives rounding, snapping and decimation.
// ─────────────────────────────────────────────────────────────────────

Deno.test("K — the reserve covers the PROVEN worst adverse displacement", () => {
  // round(u) - u in [-0.5, +0.5); the even snap subtracts 0 or 1 and never
  // adds; decimation is bounded by KEYFRAME_TOLERANCE_PX in max-norm. The
  // far-edge constraints are hurt by a DECREASING origin, so the adverse
  // bound is 0.5 + 1 + 0.75 = 2.25 px.
  assertEquals(KEYFRAME_TOLERANCE_PX, 0.75);
  assertEquals(MAX_ADVERSE_ORIGIN_SHIFT_PX, 2.25);
  assertEquals(MOUTH_RESERVE_PX, Math.ceil(MAX_ADVERSE_ORIGIN_SHIFT_PX));
  assertEquals(MOUTH_RESERVE_PX, 3);

  // Empirical: solve with reserve, then apply all three, and re-measure.
  const mouth = { x: 1460, y: 1300 };
  const faceBox: Box = [1000, 1000, 1480, 1480];
  const feas = feasibleCropCentre({ ...base, faceBox, mouth, mouthReservePx: MOUTH_RESERVE_PX });
  assert(feas.ok);
  const half = base.size / 2;
  for (const drift of [-MAX_ADVERSE_ORIGIN_SHIFT_PX, -2, -1.5, -1, -0.5, 0, 0.5, 1, 1.25]) {
    const cx = projectIntoInterval(feas.x.hi, feas.x) + drift;
    const crop = { x: cx - half, y: projectIntoInterval(feas.y.hi, feas.y) - half, size: base.size };
    const roi = mouthRoiInCrop(base.faceShare, mouth, crop);
    assert(roiFullyInside(roi), `drift ${drift} must stay contained`);
  }
});

// ─────────────────────────────────────────────────────────────────────
// L / M — the render-cadence proof.
// ─────────────────────────────────────────────────────────────────────

const validPath = {
  keyframes: [
    { t: 0, x: 1000, y: 1000, size: 800 },
    { t: 1, x: 1040, y: 1000, size: 800 },
    { t: 2, x: 1080, y: 1000, size: 800 },
  ],
};

Deno.test("L — a valid decimated path passes the render-cadence re-check", () => {
  const frames = Array.from({ length: 61 }, (_, i) => {
    const t = i / 30;
    const w = sampleCameraPath(validPath, t)!;
    return {
      t,
      faceBox: [w.x + 160, w.y + 160, w.x + 640, w.y + 640] as Box,
      mouth: { x: w.x + 400, y: w.y + 500 },
    };
  });
  const v = verifyPathAtRenderCadence({
    frames,
    faceShare: base.faceShare,
    facePad: base.facePad,
    sampleAt: (t) => sampleCameraPath(validPath, t),
  });
  assertEquals(v.ok, true);
  assertEquals(v.checked, 61);
  assertEquals(v.mouthChecked, 61);
});

Deno.test("M — a corrupted decimated path is refused by the post-check", () => {
  const frames = Array.from({ length: 61 }, (_, i) => {
    const t = i / 30;
    const w = sampleCameraPath(validPath, t)!;
    return {
      t,
      faceBox: [w.x + 160, w.y + 160, w.x + 640, w.y + 640] as Box,
      mouth: { x: w.x + 400, y: w.y + 500 },
    };
  });
  // Same frames, but the path a renderer would follow is shifted away.
  const corrupted = { keyframes: validPath.keyframes.map((k) => ({ ...k, x: k.x - 260 })) };
  const v = verifyPathAtRenderCadence({
    frames,
    faceShare: base.faceShare,
    facePad: base.facePad,
    sampleAt: (t) => sampleCameraPath(corrupted, t),
  });
  assertEquals(v.ok, false);
  assert(v.failedKind === "face" || v.failedKind === "mouth");
  assert(v.failedFrame !== null && v.failedT !== null);
});

// ─────────────────────────────────────────────────────────────────────
// A / N / O / P / Q / R — the freeze.
// ─────────────────────────────────────────────────────────────────────

Deno.test("A — the N1-01 static control geometry is still accepted, bit for bit", () => {
  // Baseline frontal, single speaker, mouth_roi_source = static,
  // worst margin +0.3282729552. The static path never touches the planner.
  const share = 0.3021;
  const band = v434MouthBand(share);
  const roi = { centerX: 0.5, centerY: 0.5, ...band };
  const margin = roiContainmentMargin(roi);
  assert(roiFullyInside(roi));
  assert(margin > 0.3, `healthy static margin, got ${margin}`);

  const gate = evaluateV461FaceGate({
    usePreclip: true,
    faceShare: share,
    faceBbox: [0, 0, 466, 466],
    crop: { x: 0, y: 0, size: 848, outputSize: 848 },
    anchor: "mouth",
    mouthOffsetXy: { dx: 0, dy: 0 },
    cameraPathDynamic: false,
    cameraPathKeyframes: null,
    identity: null,
    expectedIdentity: null,
  });
  assertEquals(gate.metrics.mouth_roi_source, "static");
  assertEquals(gate.checks.mouth_roi, true);
});

Deno.test("N — V461 still rejects a true negative margin, with no epsilon", () => {
  const GATE = Deno.readTextFileSync(new URL("./v461-face-gate.ts", import.meta.url));
  const code = GATE.replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert(!/margin\s*[<>]=?\s*-/.test(code), "no negative tolerance");
  assert(!/1e-\d/.test(code), "no epsilon");
  assert(!/EPSILON/.test(code), "no epsilon constant");

  // The predicate itself is boundary-inclusive and exact.
  const band = v434MouthBand(N1_02.faceShare);
  const justOut = { centerX: 1 - band.width / 2 + 1e-12, centerY: 0.5, ...band };
  assertEquals(roiFullyInside(justOut), false, "a 1e-12 escape is still an escape");
  const exact = { centerX: 1 - band.width / 2, centerY: 0.5, ...band };
  assertEquals(roiFullyInside(exact), true, "the boundary itself is accepted");
});

Deno.test("O/P — the frozen thresholds and the face pad did not move", () => {
  assertEquals(V461_FACE_SHARE_FLOOR, 0.24);
  assertEquals(V461_FACE_SIZE_PROVIDER_PX_FLOOR, 144);
  assertEquals(CONTAINMENT_PAD_RATIO, 0.04);
  assertEquals(V434_MOUTH_BAND.widthOfFaceSide, 0.62);
  assertEquals(V434_MOUTH_BAND.heightOfFaceSide, 0.34);
  assertEquals(KEYFRAME_TOLERANCE_PX, 0.75);
});

Deno.test("Q — V519 / V521 / V522 / V464 semantics are untouched", () => {
  const base_ = new URL("./", import.meta.url);
  for (const f of ["./preclip-crop-containment.ts", "./v464-asd-projection.ts", "./preclip-geometry-authority.ts"]) {
    const s = Deno.readTextFileSync(new URL(f, base_));
    assert(!s.includes("v536"), `${f} carries no V536 code`);
    assert(!s.includes("V536"), `${f} carries no V536 marker`);
    assert(!s.includes("mouth-crop-feasibility"), `${f} does not import the helper`);
  }
  const C = Deno.readTextFileSync(new URL("./preclip-crop-containment.ts", base_));
  assert(C.includes("export function siblingCenterInBox(center: [number, number], box: Box): boolean {"));
  assert(C.includes("return center[0] >= box[0] && center[0] <= box[2] &&"));

  // E.3 is translation-invariant, which is WHY it is not in the solver: both
  // arguments are projected through the same crop, so a shift moves them
  // together. Demonstrated rather than asserted in prose.
  const boxPlate: Box = [100, 100, 300, 300];
  const sibPlate: [number, number] = [200, 200];
  const project = (originX: number) =>
    ({
      box: [boxPlate[0] - originX, boxPlate[1], boxPlate[2] - originX, boxPlate[3]] as Box,
      sib: [sibPlate[0] - originX, sibPlate[1]] as [number, number],
    });
  const inBox = (c: [number, number], b: Box) =>
    c[0] >= b[0] && c[0] <= b[2] && c[1] >= b[1] && c[1] <= b[3];
  for (const shift of [-50, -1, 0, 1, 50, 500]) {
    const p = project(shift);
    assertEquals(inBox(p.sib, p.box), true, `E.3 invariant under shift ${shift}`);
  }
});

Deno.test("R — the corrected geometry is per-pass, with no speaker-count branch", () => {
  const PATH = Deno.readTextFileSync(new URL("./dynamic-camera-path.ts", import.meta.url));
  const HELP = Deno.readTextFileSync(new URL("./mouth-crop-feasibility.ts", import.meta.url));
  for (const [name, s] of [["planner", PATH], ["helper", HELP]] as const) {
    assert(!/speakers?\s*\.\s*length/.test(s), `${name} has no speaker-count branch`);
    assert(!/speakerIdx/.test(s), `${name} does not know speaker indices`);
    assert(!/passIdx/.test(s), `${name} does not know pass indices`);
  }
});

// ─────────────────────────────────────────────────────────────────────
// End to end through the real planner.
// ─────────────────────────────────────────────────────────────────────

function samples(n: number, f: (i: number) => { box: Box; mouth: [number, number] }): TrackSample[] {
  return Array.from({ length: n }, (_, i) => {
    const { box, mouth } = f(i);
    return { t: i * 0.25, box, mouth } as unknown as TrackSample;
  });
}

Deno.test("END-TO-END — a moving track with a far-right mouth stays containable", () => {
  // The mouth rides near the face's right edge, the N1-02 pose.
  const track = samples(9, (i) => {
    const x = 600 + i * 30;
    return {
      box: [x, 400, x + 470, 870] as Box,
      mouth: [x + 440, 700] as [number, number],
    };
  });
  const path = buildDynamicCameraPath({
    samples: track,
    staticCrop: { x: 500, y: 300, size: SIZE, outputSize: 1024 },
    srcWidth: PLATE.width,
    srcHeight: PLATE.height,
    startSec: 0,
    endSec: 2,
    faceShare: N1_02.faceShare,
  });

  if (path.mouthInfeasible) {
    // Allowed outcome B — but then it must NOT be a moving path.
    assertEquals(path.moving, false);
    assertEquals(path.reason, "dynamic_mouth_crop_infeasible");
    return;
  }

  // Outcome A — every keyframe the gate will read must hold the band.
  const band = v434MouthBand(N1_02.faceShare);
  for (const k of path.keyframes) {
    if (k.mx === null || k.my === null) continue;
    const roi = {
      centerX: (k.mx - k.x) / k.size,
      centerY: (k.my - k.y) / k.size,
      ...band,
    };
    assert(
      roiFullyInside(roi),
      `keyframe t=${k.t} escaped: margin ${roiContainmentMargin(roi)}`,
    );
  }
});

Deno.test("END-TO-END — without faceShare the path is byte-identical to before", () => {
  const track = samples(9, (i) => {
    const x = 600 + i * 30;
    return { box: [x, 400, x + 470, 870] as Box, mouth: [x + 440, 700] as [number, number] };
  });
  const args = {
    samples: track,
    staticCrop: { x: 500, y: 300, size: SIZE, outputSize: 1024 },
    srcWidth: PLATE.width,
    srcHeight: PLATE.height,
    startSec: 0,
    endSec: 2,
  };
  const legacy = buildDynamicCameraPath(args);
  const alsoLegacy = buildDynamicCameraPath({ ...args, faceShare: null });
  assertEquals(legacy.signature, alsoLegacy.signature);
  assertEquals(legacy.keyframes, alsoLegacy.keyframes);
  assertEquals(legacy.mouthInfeasible ?? null, null, "no mouth verdict without a share");
});

// ─────────────────────────────────────────────────────────────────────
// The two failure kinds must never be confused.
// ─────────────────────────────────────────────────────────────────────

/** A cohort whose mouth rides so far off the face that no centre holds both. */
function infeasibleTrack(): TrackSample[] {
  return samples(9, (i) => {
    const x = 400 + i * 20;
    return {
      // Face nearly as wide as the crop: the face interval is razor thin.
      box: [x, 400, x + 740, 1140] as Box,
      // Mouth outside the face box entirely, far to the right.
      mouth: [x + 1400, 700] as [number, number],
    };
  });
}

Deno.test("FAIL-CLOSED A — tracking unavailable keeps the historical static fallback", () => {
  const args = {
    samples: [] as TrackSample[],
    staticCrop: { x: 500, y: 300, size: SIZE, outputSize: 1024 },
    srcWidth: PLATE.width,
    srcHeight: PLATE.height,
    startSec: 0,
    endSec: 2,
    faceShare: N1_02.faceShare,
  };
  const path = buildDynamicCameraPath(args);
  assertEquals(path.moving, false);
  assertEquals(path.reason, "static_fallback", "unchanged acquisition-failure idiom");
  assertEquals(path.mouthInfeasible ?? null, null, "nothing was PROVEN, so no verdict");
  // And the crop is exactly the frozen one.
  assertEquals(path.keyframes.length, 1);
  assertEquals(path.keyframes[0].x, 500);
  assertEquals(path.keyframes[0].y, 300);
});

Deno.test("FAIL-CLOSED B — proven infeasibility is NOT a static fallback", () => {
  const path = buildDynamicCameraPath({
    samples: infeasibleTrack(),
    staticCrop: { x: 500, y: 300, size: SIZE, outputSize: 1024 },
    srcWidth: PLATE.width,
    srcHeight: PLATE.height,
    startSec: 0,
    endSec: 2,
    faceShare: N1_02.faceShare,
  });
  assertEquals(path.reason, "dynamic_mouth_crop_infeasible");
  assert(path.mouthInfeasible, "the verdict is carried");
  assertEquals(path.mouthInfeasible!.reason, "dynamic_mouth_crop_infeasible");
  assert(["x", "y"].includes(path.mouthInfeasible!.axis));
  assert(path.mouthInfeasible!.frame >= 0);

  // The distinguishing mark: a tracking failure never sets this field.
  const acquisition = buildDynamicCameraPath({
    samples: [] as TrackSample[],
    staticCrop: { x: 500, y: 300, size: SIZE, outputSize: 1024 },
    srcWidth: PLATE.width,
    srcHeight: PLATE.height,
    startSec: 0,
    endSec: 2,
    faceShare: N1_02.faceShare,
  });
  assert(acquisition.reason !== path.reason, "the two failure kinds are distinguishable");
});

Deno.test("FAIL-CLOSED B2 — the preclip refuses a proven infeasibility outright", () => {
  const SRC = Deno.readTextFileSync(new URL("./pass-face-preclip.ts", import.meta.url));
  // The refusal exists, and it is placed BEFORE the dynamic/static decision so
  // no fallback can absorb it.
  const refuse = SRC.indexOf("if (cameraPath?.mouthInfeasible) {");
  const decide = SRC.indexOf("const useDynamicPath = isDynamicCameraPath(cameraPath);");
  assert(refuse >= 0, "the refusal exists");
  assert(refuse < decide, "it runs before the dynamic/static decision");

  const block = SRC.slice(refuse, decide);
  assert(block.includes("ok: false,"), "it fails the preclip");
  assert(
    block.includes("error: `preclip_crop_contract_unsatisfiable:${mi.reason}`"),
    "same pre-dispatch shape as the V461-E planner refusal",
  );
  assert(block.includes('errorClass: "invalid_input"'));
  assert(block.includes('refused_at: "planner"'));
  // Bounded scalars only — no images, urls or payloads in the diagnostics.
  for (const f of ["url", "Url", "base64", "Bytes", "data:", "preclipUrl"]) {
    assert(!block.includes(f), `diagnostics must not carry ${f}`);
  }
  // And it never hands back a usable crop.
  assert(!block.includes("preclipUrl:"), "no preclip url is returned");
  assert(!/\bcrop:\s/.test(block), "no crop is returned");
});

// ─────────────────────────────────────────────────────────────────────
// The reserve, proven rather than asserted.
// ─────────────────────────────────────────────────────────────────────

Deno.test("K2 — a 2px reserve is provably insufficient at the worst displacement", () => {
  const mouth = { x: 1460, y: 1300 };
  const faceBox: Box = [1000, 1000, 1480, 1480];
  const half = base.size / 2;
  const worst = -MAX_ADVERSE_ORIGIN_SHIFT_PX; // 2.25 px, the far-edge direction

  // The FAR-edge constraint sits at `x.lo` (c >= mouth + bandHalf - half) and
  // is the one a DECREASING origin hurts. `x.hi` carries the near edge, where
  // the reachable adverse direction is positive and bounded by 0.5 + 0.75 =
  // 1.25, because the even snap never adds. A single symmetric reserve has to
  // cover the larger of the two.
  const two = feasibleCropCentre({ ...base, faceBox, mouth, mouthReservePx: 2 });
  assert(two.ok);
  assert(two.x.lo > faceBox[2] + base.facePad - half, "the mouth is the binding bound");
  const cropTwo = { x: two.x.lo + worst - half, y: two.y.lo - half, size: base.size };
  assertEquals(
    roiFullyInside(mouthRoiInCrop(base.faceShare, mouth, cropTwo)),
    false,
    "2 px cannot absorb 2.25 px of adverse shift",
  );

  // With the shipped reserve the same worst case holds.
  const three = feasibleCropCentre({ ...base, faceBox, mouth, mouthReservePx: MOUTH_RESERVE_PX });
  assert(three.ok);
  const cropThree = { x: three.x.lo + worst - half, y: three.y.lo - half, size: base.size };
  assert(
    roiFullyInside(mouthRoiInCrop(base.faceShare, mouth, cropThree)),
    "3 px absorbs the proven worst case",
  );
});

Deno.test("K3 — the whole permitted displacement range is covered", () => {
  const mouth = { x: 1460, y: 1305 };
  const faceBox: Box = [1000, 1000, 1480, 1480];
  const half = base.size / 2;
  const feas = feasibleCropCentre({ ...base, faceBox, mouth, mouthReservePx: MOUTH_RESERVE_PX });
  assert(feas.ok);
  // Every reachable origin: round in [-0.5, +0.5), snap in {0, -1},
  // decimation in [-0.75, +0.75].
  for (const r of [-0.5, -0.25, 0, 0.25, 0.499]) {
    for (const snap of [0, -1]) {
      for (const dec of [-0.75, -0.3, 0, 0.3, 0.75]) {
        const shift = r + snap + dec;
        for (const edge of [feas.x.lo, feas.x.hi]) {
          const crop = { x: edge + shift - half, y: feas.y.hi - half, size: base.size };
          assert(
            roiFullyInside(mouthRoiInCrop(base.faceShare, mouth, crop)),
            `shift ${shift.toFixed(3)} at edge ${edge} escaped`,
          );
        }
      }
    }
  }
});
