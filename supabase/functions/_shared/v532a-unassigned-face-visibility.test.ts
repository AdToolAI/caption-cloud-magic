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
