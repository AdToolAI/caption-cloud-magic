// Deno tests for asd-strategy.ts
// Run: deno test supabase/functions/_shared/asd-strategy.test.ts
import { assertEquals, assert } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildAsdStrategy,
  type BuildAsdInput,
  type PassGeometry,
} from "./asd-strategy.ts";

const baseGeometry: PassGeometry = {
  preclipFaceCount: 1,
  preclipAmbiguityRisk: "clean",
  plateCoord: [400, 300],
  preclipCrop: { x: 280, y: 180, size: 220, outputSize: 720 },
  asdFrameNumber: 5,
};

function input(overrides: Partial<BuildAsdInput> = {}): BuildAsdInput {
  return {
    preflight: null,
    geometry: baseGeometry,
    retryVariant: null,
    isMultiSpeaker: false,
    usePreclip: true,
    ...overrides,
  };
}

Deno.test("Rule 0 (v131) — verified single-face preclip → auto_detect even when preflight has coord", () => {
  const r = buildAsdStrategy(
    input({
      preflight: {
        faceFound: true,
        coord: [360, 360],
        frame: 5,
      },
      // first attempt, no retry variant
    }),
  );
  assertEquals(r.mode, "single_face_auto");
  assertEquals(r.asd.auto_detect, true);
  assertEquals(r.diagnostics.rule, "rule_0_preclip_single_face_verified");
  assertEquals(r.diagnostics.had_preflight_coord, true);

});

Deno.test("Rule 0 (v131) — multi-speaker scene with verified single-face crop → auto_detect", () => {
  const r = buildAsdStrategy(input({ isMultiSpeaker: true }));
  assertEquals(r.mode, "single_face_auto");
  assertEquals(r.diagnostics.rule, "rule_0_preclip_single_face_verified");
});

Deno.test("Rule 0 (v131.3) — coords-pro is the fresh-default label and NO LONGER forces strict coords; preflight still wins (Rule 1 below Rule 0 only fires when Rule 0 ineligible)", () => {
  // With v131.3, coords-pro on the preclip path flows through Rule 0
  // → auto_detect:true (even when preflight has a coord, because Rule 0
  // comes before Rule 1 in the strategy order). This is the entire
  // point of the fix: stop sending `[x,y]+frame_number` payloads that
  // Sync.so reproducibly rejects with generation_unknown_error.
  const r = buildAsdStrategy(
    input({
      retryVariant: "coords-pro",
      preflight: {
        faceFound: true,
        coord: [360, 360],
        frame: 7,
      },
    }),
  );
  assertEquals(r.mode, "single_face_auto");
  assertEquals(r.asd.auto_detect, true);
});

Deno.test("Rule 0 (v131.3) — explicit sync3-coords retry STILL bypasses Rule 0 → preflight (Rule 1) fires", () => {
  const r = buildAsdStrategy(
    input({
      retryVariant: "sync3-coords",
      preflight: {
        faceFound: true,
        coord: [360, 360],
        frame: 7,
      },
    }),
  );
  assertEquals(r.mode, "preflight_coord");
});

Deno.test("Rule 0 (v131.1) — face count null now fires Rule 0 as probe_unavailable", () => {
  const r = buildAsdStrategy(
    input({
      geometry: { ...baseGeometry, preclipFaceCount: null, preclipAmbiguityRisk: null },
    }),
  );
  assertEquals(r.mode, "single_face_auto");
  assertEquals(r.diagnostics.rule, "rule_0_preclip_probe_unavailable");
});


Deno.test("Rule 1 — preflight face coord wins over everything", () => {
  const r = buildAsdStrategy(
    input({
      preflight: {
        faceFound: true,
        coord: [360, 360],
        frame: 7,
        snapped: true,
        originalCoord: [120, 120],
        snapDistancePx: 120,
      },
      isMultiSpeaker: true,
      retryVariant: "coords-pro",
    }),
  );
  assertEquals(r.mode, "preflight_coord");
  assertEquals(r.source, "preflight");
  assertEquals(r.coordSpace, "preclip");
  assert(r.asd.auto_detect === false && "coordinates" in r.asd);
  // @ts-ignore narrowed above
  assertEquals(r.asd.coordinates, [360, 360]);
  // @ts-ignore narrowed above
  assertEquals(r.asd.frame_number, 7);
  assertEquals(r.diagnostics.snapped, true);
});

Deno.test("Rule 2 — bbox-url retry uses caller-prepared URL", () => {
  const r = buildAsdStrategy(
    input({
      retryVariant: "bbox-url-pro",
      isMultiSpeaker: true,
      geometry: {
        ...baseGeometry,
        prebuiltBoundingBoxesUrl:
          "https://example.com/path/to/bboxes.json?token=abc",
      },
    }),
  );
  assertEquals(r.mode, "bbox_url");
  assertEquals(r.source, "retry");
  assert(r.asd.auto_detect === false && "bounding_boxes_url" in r.asd);
});

Deno.test("Rule 2 fallback — inline bounding_boxes when no URL", () => {
  const r = buildAsdStrategy(
    input({
      retryVariant: "coords-pro-box",
      isMultiSpeaker: true,
      geometry: {
        ...baseGeometry,
        prebuiltBoundingBoxes: [[10, 10, 50, 50], null, [10, 10, 50, 50]],
      },
    }),
  );
  assertEquals(r.mode, "bbox_url");
  assertEquals(r.diagnostics.bbox_source, "inline");
  assertEquals(r.diagnostics.non_null_frames, 2);
});

Deno.test("Rule 3 — multi-speaker with sibling inside crop → doc-strict", () => {
  const r = buildAsdStrategy(
    input({
      isMultiSpeaker: true,
      geometry: {
        ...baseGeometry,
        preclipFaceCount: 2,
        preclipAmbiguityRisk: "neighbor_inside_crop",
      },
    }),
  );
  assertEquals(r.mode, "preclip_coord_strict");
  assertEquals(r.coordSpace, "preclip");
  assert(r.asd.auto_detect === false && "coordinates" in r.asd);
  // plate (400,300) → preclip with crop (280,180,220) scale=720/220
  // x = (400-280)*720/220 ≈ 392.7 → 393; y = (300-180)*720/220 ≈ 392.7 → 393
  // @ts-ignore narrowed
  assertEquals(r.asd.coordinates, [393, 393]);
});

Deno.test("Rule 3 — sync3-coords retry forces strict even without sibling (v131.3: was coords-pro)", () => {
  const r = buildAsdStrategy(
    input({
      retryVariant: "sync3-coords",
      isMultiSpeaker: true,
    }),
  );
  assertEquals(r.mode, "preclip_coord_strict");
  assertEquals(r.source, "retry");
});

Deno.test("Rule 3 OOB → falls through to last_resort_auto (v131.3: use sync3-coords)", () => {
  const r = buildAsdStrategy(
    input({
      retryVariant: "sync3-coords",
      isMultiSpeaker: true,
      geometry: {
        ...baseGeometry,
        plateCoord: [0, 0], // far outside crop
        preclipAmbiguityRisk: "neighbor_inside_crop",
      },
    }),
  );
  assertEquals(r.mode, "last_resort_auto");
  assertEquals(r.diagnostics.reason, "preclip_coord_out_of_bounds");
});

Deno.test("Rule 4 — clean single-face preclip → auto_detect", () => {
  const r = buildAsdStrategy(input({ isMultiSpeaker: false }));
  assertEquals(r.mode, "single_face_auto");
  assertEquals(r.asd.auto_detect, true);
  assertEquals(r.source, "default");
});

Deno.test("Rule 4 — multi-speaker scene with unambiguous crop → auto_detect", () => {
  const r = buildAsdStrategy(
    input({
      isMultiSpeaker: true,
      geometry: {
        ...baseGeometry,
        preclipFaceCount: 1,
        preclipAmbiguityRisk: "clean",
      },
    }),
  );
  assertEquals(r.mode, "single_face_auto");
});

Deno.test("Rule 5 — zero-face preclip → last_resort_auto", () => {
  const r = buildAsdStrategy(
    input({
      geometry: {
        ...baseGeometry,
        preclipFaceCount: 0,
      },
    }),
  );
  assertEquals(r.mode, "last_resort_auto");
  assertEquals(r.diagnostics.last_resort, true);
});

Deno.test("Rule 5 — multi-speaker plate without coords → last_resort_auto", () => {
  const r = buildAsdStrategy(
    input({
      usePreclip: false,
      isMultiSpeaker: true,
      geometry: { ...baseGeometry, plateCoord: null, preclipCrop: null },
    }),
  );
  assertEquals(r.mode, "last_resort_auto");
  assertEquals(r.diagnostics.has_plate_coord, false);
});

Deno.test("ASD output never has both auto_detect:true and coords", () => {
  // exhaustive: try every interesting combination
  for (const usePreclip of [true, false]) {
    for (const isMultiSpeaker of [true, false]) {
      for (const variant of [null, "coords-pro", "bbox-url-pro", "preflight-snap"]) {
        const r = buildAsdStrategy(
          input({ usePreclip, isMultiSpeaker, retryVariant: variant }),
        );
        if (r.asd.auto_detect === true) {
          assert(
            !("coordinates" in r.asd) &&
              !("bounding_boxes" in r.asd) &&
              !("bounding_boxes_url" in r.asd),
            `mode=${r.mode} variant=${variant} leaked coords with auto_detect:true`,
          );
        }
      }
    }
  }
});

Deno.test("preflight-snap retry variant routes through preflight_coord", () => {
  const r = buildAsdStrategy(
    input({
      retryVariant: "preflight-snap",
      preflight: {
        faceFound: true,
        coord: [400, 400],
        frame: 3,
        snapped: true,
      },
    }),
  );
  assertEquals(r.mode, "preflight_coord");
  // @ts-ignore narrowed
  assertEquals(r.asd.frame_number, 3);
});

// ── v131.1 — Rule 0 trust extension ────────────────────────────────────────

Deno.test("v131.1 — face probe unavailable + no ambiguity → Rule 0 fires (probe_unavailable)", () => {
  const r = buildAsdStrategy(
    input({
      geometry: {
        ...baseGeometry,
        preclipFaceCount: null,
        preclipAmbiguityRisk: null,
      },
    }),
  );
  assertEquals(r.mode, "single_face_auto");
  assertEquals(r.asd.auto_detect, true);
  assertEquals(r.diagnostics.rule, "rule_0_preclip_probe_unavailable");
  assertEquals(r.diagnostics.preclip_trust, "unknown");
});

Deno.test("v131.1 — probe unavailable but preclipTrust='verified' → rule_0_preclip_verified", () => {
  const r = buildAsdStrategy(
    input({
      geometry: {
        ...baseGeometry,
        preclipFaceCount: null,
        preclipAmbiguityRisk: null,
        preclipTrust: "verified",
      },
    }),
  );
  assertEquals(r.mode, "single_face_auto");
  assertEquals(r.diagnostics.rule, "rule_0_preclip_verified");
});

Deno.test("v131.1 — probe unavailable + ambiguity neighbor_inside_crop → Rule 0 blocked", () => {
  const r = buildAsdStrategy(
    input({
      geometry: {
        ...baseGeometry,
        preclipFaceCount: null,
        preclipAmbiguityRisk: "neighbor_inside_crop",
      },
    }),
  );
  // Falls through to Rule 1/3, not Rule 0
  assert(r.diagnostics.rule !== "rule_0_preclip_probe_unavailable");
  assert(r.diagnostics.rule !== "rule_0_preclip_verified");
});

Deno.test("v131.1 — preclipTrust='verified' but faceCount=2 → Rule 0 blocked (multi-face beats trust)", () => {
  const r = buildAsdStrategy(
    input({
      geometry: {
        ...baseGeometry,
        preclipFaceCount: 2,
        preclipAmbiguityRisk: "clean",
        preclipTrust: "verified",
      },
    }),
  );
  assert(r.diagnostics.rule !== "rule_0_preclip_verified");
  assert(r.diagnostics.rule !== "rule_0_preclip_probe_unavailable");
});

// ── v131.2 — Rule 0 unconditional on preclip (drop trust gate) ─────────────



Deno.test("v131.2 — multi-speaker + face probe unavailable + clean ambiguity → Rule 0 fires (no trust required)", () => {
  // Reproduces prod scene 793aef02-…: 4-speaker hook, server face probe
  // returned FACE_GATE_PROBE_UNAVAILABLE, preclipTrust='unknown', and
  // v131.1 incorrectly fell through to Rule 3 strict-coords.
  const r = buildAsdStrategy(
    input({
      isMultiSpeaker: true,
      geometry: {
        ...baseGeometry,
        preclipFaceCount: 0,
        preclipAmbiguityRisk: "clean",
        preclipTrust: "unknown",
      },
    }),
  );
  assertEquals(r.mode, "single_face_auto");
  assertEquals(r.asd.auto_detect, true);
  assert(String(r.diagnostics.rule).startsWith("rule_0_"));
});

Deno.test("v131.2 — multi-speaker + neighbor_inside_crop still blocks Rule 0", () => {
  const r = buildAsdStrategy(
    input({
      isMultiSpeaker: true,
      geometry: {
        ...baseGeometry,
        preclipFaceCount: 1,
        preclipAmbiguityRisk: "neighbor_inside_crop",
      },
    }),
  );
  assert(!String(r.diagnostics.rule ?? "").startsWith("rule_0_"));
});


