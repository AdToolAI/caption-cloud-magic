/**
 * V532-A — UNASSIGNED FACE VISIBILITY (OBSERVABILITY ONLY)
 *
 * `unassignedFaceBoxes` reports the DetectFaces candidates that were NOT
 * assigned to any requested character under the current V524 evidence. It is
 * NOT a biometric negation and nothing in the pipeline may branch on it.
 *
 * This suite proves three things and nothing else:
 *   1. the field appears on the `incomplete_registration` return,
 *   2. it is absent on success and on other failures,
 *   3. its boxes carry the SAME sx/sy detector→plate scaling that accepted
 *      records carry, and `ok` / `records` / `partialRecords` are untouched.
 */

import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  type PlateIdentityRegistration,
  registerPlateNativeIdentities,
} from "./v524-plate-identity-registration.ts";

const FENCE = {
  sceneId: "scene-v532a",
  runId: "run-v532a",
  plateGeneration: 3,
  baseVideoUrl: "https://example.test/plate-v532a.mp4",
  registeredAt: "2026-09-01T00:00:00.000Z",
};

const chars = (ids: string[]) =>
  ids.map((id) => ({ characterId: id, portraitUrl: `https://example.test/${id}.jpg` }));

function run(opts: {
  requested: string[];
  faces: Array<{ characterId: string | null; bbox: number[]; similarity?: number }>;
  detectorDims: { width: number; height: number };
  plateDims: { width: number; height: number };
}): Promise<PlateIdentityRegistration> {
  return registerPlateNativeIdentities({
    ...FENCE,
    plateDims: opts.plateDims,
    frameNumber: 42,
    characters: chars(opts.requested),
    extractFrame: async () => ({ ok: true, frameUrl: "https://example.test/still.jpg", reason: null }),
    detectIdentities: async () => ({
      ok: true,
      dims: opts.detectorDims,
      faces: opts.faces.map((f) => ({
        characterId: f.characterId,
        bbox: f.bbox,
        similarity: f.similarity ?? 95,
      })),
      resolvedCount: opts.faces.filter((f) => !!f.characterId).length,
      reason: null,
    }),
  } as any);
}

Deno.test("V532-A PURE — incomplete registration exposes unassigned boxes, scaled like records", async () => {
  const reg = await run({
    requested: ["sarah", "matthew"],
    faces: [
      { characterId: "sarah", bbox: [10, 20, 50, 80] },
      { characterId: null, bbox: [100, 40, 140, 100] },
    ],
    detectorDims: { width: 320, height: 180 },
    plateDims: { width: 640, height: 360 },
  });

  // Business surface untouched.
  assertEquals(reg.ok, false);
  assertEquals(reg.reason, "incomplete_registration");
  assertEquals(reg.records.length, 0);
  assertEquals(reg.partialRecords?.length, 1);
  assertEquals(reg.partialRecords?.[0].characterId, "sarah");
  assertEquals(reg.partialRecords?.[0].bbox, [20, 40, 100, 160]);

  // Observability surface: same sx=2 / sy=2 transformation.
  assertEquals(reg.unassignedFaceBoxes, [[200, 80, 280, 200]]);
});

Deno.test("V532-A PURE — malformed or degenerate unassigned boxes are dropped", async () => {
  const reg = await run({
    requested: ["sarah", "matthew"],
    faces: [
      { characterId: "sarah", bbox: [10, 20, 50, 80] },
      { characterId: null, bbox: [1, 2, 3] },
      { characterId: null, bbox: [10, 10, 10, 40] },
      { characterId: null, bbox: [Number.NaN, 1, 2, 3] },
      { characterId: null, bbox: [5, 5, 25, 45] },
    ],
    detectorDims: { width: 640, height: 360 },
    plateDims: { width: 640, height: 360 },
  });

  assertEquals(reg.reason, "incomplete_registration");
  assertEquals(reg.unassignedFaceBoxes, [[5, 5, 25, 45]]);
});

Deno.test("V532-A PURE — unassigned faces do not change resolution or thresholds", async () => {
  const complete = await run({
    requested: ["sarah"],
    faces: [
      { characterId: "sarah", bbox: [10, 20, 50, 80] },
      { characterId: null, bbox: [100, 40, 140, 100] },
    ],
    detectorDims: { width: 640, height: 360 },
    plateDims: { width: 640, height: 360 },
  });

  assertEquals(complete.ok, true);
  assertEquals(complete.records.length, 1);
  // Success carries no observability field: it is scoped to the incomplete return.
  assertEquals(complete.unassignedFaceBoxes, undefined);
});

Deno.test("V532-A PURE — other failures stay unchanged (no evidence at all)", async () => {
  const none = await run({
    requested: ["sarah"],
    faces: [{ characterId: null, bbox: [10, 20, 50, 80] }],
    detectorDims: { width: 640, height: 360 },
    plateDims: { width: 640, height: 360 },
  });

  assertEquals(none.ok, false);
  assertEquals(none.reason, "no_identity_evidence");
  assertEquals(none.records.length, 0);
  assertEquals(none.unassignedFaceBoxes, undefined);
});

Deno.test("V532-A CONTRACT — unassignedFaceBoxes is never read by a business branch", async () => {
  const src = await Deno.readTextFile(
    new URL("./v524-plate-identity-registration.ts", import.meta.url),
  );
  // Written exactly once (the incomplete return) plus the declaration and type.
  const writes = src.match(/unassignedFaceBoxes/g) ?? [];
  assert(writes.length <= 4, `unexpected extra uses: ${writes.length}`);
  // No conditional ever tests it.
  assert(!/if\s*\([^)]*unassignedFaceBoxes/.test(src));

  const shared = ["./v523-identity-repair.ts", "./plate-face-track.ts", "./plateFaceSlotRouter.ts"];
  for (const f of shared) {
    const text = await Deno.readTextFile(new URL(f, import.meta.url));
    assert(!text.includes("unassignedFaceBoxes"), `${f} must not consume V532-A telemetry`);
  }

  const caller = await Deno.readTextFile(
    new URL("../compose-dialog-segments/index.ts", import.meta.url),
  );
  // Only telemetry rows may mention it, and never inside a condition.
  assert(!/if\s*\([^)]*unassignedFaceBoxes/.test(caller));
  assert(!/if\s*\([^)]*unassigned_face_/.test(caller));
  assert(!/if\s*\([^)]*v532a_target_partial/.test(caller));
  assert(caller.includes("unassigned_face_count"));
  assert(caller.includes("partial_character_ids"));
  assert(caller.includes("v532a_target_partial"));
});

/* ------------------------------------------------------------------ *
 * V532-A — TARGET TELEMETRY REGRESSIONS (Gen30 shape)
 *
 * `v532aTargetPartial` lives inline in compose-dialog-segments (it closes
 * over `v526bEvidence`). To exercise the REAL implementation without
 * touching the production file, the arrow function is extracted verbatim
 * from source, de-typed, and evaluated against synthetic evidence.
 * ------------------------------------------------------------------ */

const CALLER_URL = new URL("../compose-dialog-segments/index.ts", import.meta.url);

async function loadTargetPartial(evidence: unknown[]) {
  const src = await Deno.readTextFile(CALLER_URL);
  const start = src.indexOf("const v532aTargetPartial = (");
  assert(start >= 0, "v532aTargetPartial must exist in compose-dialog-segments");
  const open = src.indexOf("{", src.indexOf("=>", start));
  let depth = 0;
  let end = -1;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  assert(end > 0, "unbalanced v532aTargetPartial body");
  const fnSrc = src
    .slice(src.indexOf("(", start), end)
    .replace(/characterId\?:\s*string\s*\|\s*null/, "characterId")
    .replace(/\s+as\s+any/g, "");
  const factory = new Function("v526bEvidence", `return (${fnSrc});`);
  return factory(evidence) as (
    id?: string | null,
  ) => { target_partial_present: boolean; target_partial_similarity: number | null; target_partial_frame: number | null };
}

Deno.test("V532-A TARGET — Gen30 shape: Sarah accepted on the FIRST attempt only", async () => {
  const evidence = [
    { frame: 12, records: [{ characterId: "sarah", similarity: 94.0363 }] },
    { frame: 48, records: [{ characterId: "matthew", similarity: 91.2 }] },
    { frame: 96, records: [] },
  ];
  const targetPartial = await loadTargetPartial(evidence);
  assertEquals(targetPartial("sarah"), {
    target_partial_present: true,
    target_partial_similarity: 94.0363,
    target_partial_frame: 12,
  });
});

Deno.test("V532-A TARGET — scans ALL V526-B attempts, not only the last one", async () => {
  const evidence = [
    { frame: 10, records: [] },
    { frame: 20, records: [{ characterId: "outfit:sarah", similarity: 88.5 }] },
    { frame: 30, records: [{ characterId: "matthew", similarity: 99 }] },
  ];
  const targetPartial = await loadTargetPartial(evidence);
  // Present on a MIDDLE attempt — a last-attempt-only reader would say false.
  assertEquals(targetPartial("sarah"), {
    target_partial_present: true,
    target_partial_similarity: 88.5,
    target_partial_frame: 20,
  });
  // Absent everywhere → honest false.
  assertEquals(targetPartial("kay"), {
    target_partial_present: false,
    target_partial_similarity: null,
    target_partial_frame: null,
  });
  // No evidence at all → honest false.
  const empty = await loadTargetPartial([]);
  assertEquals(empty("sarah").target_partial_present, false);
});

Deno.test("V532-A PURE — ambiguous_identity is unchanged and carries no unassigned field", async () => {
  const reg = await run({
    requested: ["sarah", "matthew"],
    faces: [
      { characterId: "sarah", bbox: [10, 20, 50, 80] },
      { characterId: "sarah", bbox: [100, 40, 140, 100] },
      { characterId: null, bbox: [200, 40, 240, 100] },
    ],
    detectorDims: { width: 640, height: 360 },
    plateDims: { width: 640, height: 360 },
  });

  assertEquals(reg.ok, false);
  assertEquals(reg.reason, "ambiguous_identity");
  assertEquals(reg.records.length, 0);
  assertEquals(reg.unassignedFaceBoxes, undefined);
  assert(!Object.prototype.hasOwnProperty.call(reg, "unassignedFaceBoxes"));
});

Deno.test("V532-A PURE — incomplete registration with zero VALID unassigned boxes → []", async () => {
  const reg = await run({
    requested: ["sarah", "matthew"],
    faces: [
      { characterId: "sarah", bbox: [10, 20, 50, 80] },
      { characterId: null, bbox: [7, 7, 7, 7] },
      { characterId: null, bbox: [Number.NaN, Number.NaN, 10, 10] },
    ],
    detectorDims: { width: 640, height: 360 },
    plateDims: { width: 640, height: 360 },
  });

  assertEquals(reg.reason, "incomplete_registration");
  assertEquals(reg.unassignedFaceBoxes, []);
  assertEquals(reg.partialRecords?.length, 1);
});

Deno.test("V532-A PURE — accepted/assigned boxes never leak into unassignedFaceBoxes", async () => {
  const reg = await run({
    requested: ["sarah", "matthew", "kay"],
    faces: [
      { characterId: "sarah", bbox: [10, 20, 50, 80] },
      { characterId: "matthew", bbox: [60, 20, 100, 80] },
      { characterId: null, bbox: [120, 20, 160, 80] },
      { characterId: null, bbox: [180, 20, 220, 80] },
    ],
    detectorDims: { width: 320, height: 180 },
    plateDims: { width: 640, height: 360 },
  });

  assertEquals(reg.reason, "incomplete_registration");
  const accepted = (reg.partialRecords ?? []).map((r) => JSON.stringify(r.bbox));
  assertEquals(accepted.length, 2);
  const unassigned = (reg.unassignedFaceBoxes ?? []).map((b) => JSON.stringify(b));
  assertEquals(unassigned.length, 2);
  for (const box of unassigned) {
    assert(!accepted.includes(box), `assigned box leaked into unassignedFaceBoxes: ${box}`);
  }
  assertEquals(reg.unassignedFaceBoxes, [
    [240, 40, 320, 160],
    [360, 40, 440, 160],
  ]);
});

Deno.test("V532-A CONTRACT — telemetry surface carries no URLs, bytes or provider bodies", async () => {
  const reg = await run({
    requested: ["sarah", "matthew"],
    faces: [
      { characterId: "sarah", bbox: [10, 20, 50, 80] },
      { characterId: null, bbox: [100, 40, 140, 100] },
    ],
    detectorDims: { width: 640, height: 360 },
    plateDims: { width: 640, height: 360 },
  });

  // Only numeric quadruples — no objects, strings, urls, base64 or buffers.
  for (const box of reg.unassignedFaceBoxes ?? []) {
    assert(Array.isArray(box));
    assertEquals(box.length, 4);
    for (const n of box) assert(typeof n === "number" && Number.isFinite(n));
  }

  const telemetry = JSON.stringify({
    unassigned_face_count: reg.unassignedFaceBoxes?.length ?? 0,
    unassigned_face_boxes: reg.unassignedFaceBoxes ?? [],
    partial_record_count: reg.partialRecords?.length ?? 0,
    partial_character_ids: (reg.partialRecords ?? []).map((r) => r.characterId),
    v532a_target_partial: {
      target_partial_present: true,
      target_partial_similarity: 94.0363,
      target_partial_frame: 12,
    },
  });
  for (const forbidden of ["http://", "https://", "data:", "base64", "portrait", "s3://", ".jpg", ".png", ".mp4"]) {
    assert(!telemetry.toLowerCase().includes(forbidden), `telemetry leaked ${forbidden}`);
  }
});
