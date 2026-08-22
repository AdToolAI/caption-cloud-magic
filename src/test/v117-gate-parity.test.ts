import { describe, it, expect } from "vitest";
import {
  evaluateV117Gate,
  classifyIdentityNullReason,
} from "../../supabase/functions/_shared/v436-plate-gate";

/**
 * V436 — v117 plate-gate decision table + reason/message parity.
 * Frozen FA-4 behavior is untouched; only the identity-null branch changed.
 */
describe("v436 — v117 gate decision table", () => {
  it("1. boxes < speakers → BLOCK with real detected count", () => {
    const d = evaluateV117Gate({
      speakers: 4,
      detectedFaces: 3,
      resolvedFaces: 3,
      hydratedBoxes: 3,
      identityMapPresent: true,
      splitScreenReason: null,
    });
    expect(d.block).toBe(true);
    expect(d.messageBranch).toBe("faces_missing");
    expect(d.detectedForMessage).toBe(3);
    expect(d.reason).toBe("plate_faces_missing(detected=3, expected=4)");
  });

  it("2. split-screen → BLOCK with split-screen branch", () => {
    const d = evaluateV117Gate({
      speakers: 4,
      detectedFaces: 4,
      resolvedFaces: 4,
      hydratedBoxes: 4,
      identityMapPresent: true,
      splitScreenReason: "split_screen_layout(faces=4, y_spread=1.0%)",
    });
    expect(d.block).toBe(true);
    expect(d.messageBranch).toBe("split_screen");
    expect(d.reason).toContain("split_screen_layout");
  });

  it("3. identityMap = null + boxes == speakers → PASS (soft)", () => {
    const d = evaluateV117Gate({
      speakers: 4,
      detectedFaces: 0,
      resolvedFaces: 0,
      hydratedBoxes: 4,
      identityMapPresent: false,
      splitScreenReason: null,
      identityNullReason: "no_faces(aws=zero_faces)",
    });
    expect(d.block).toBe(false);
    expect(d.softPass).toBe(true);
    expect(d.messageBranch).toBe("none");
    expect(d.reason).toBe(
      "v117_soft_pass_identity_unavailable(no_faces(aws=zero_faces))",
    );
  });

  it("4. identityMap present, resolved < speakers, boxes == speakers → PASS (fallback)", () => {
    const d = evaluateV117Gate({
      speakers: 4,
      detectedFaces: 4,
      resolvedFaces: 2,
      hydratedBoxes: 4,
      identityMapPresent: true,
      splitScreenReason: null,
    });
    expect(d.block).toBe(false);
    expect(d.softPass).toBe(true);
    expect(d.reason).toBe("v117_soft_pass_identity_partial(resolved=2/4)");
  });

  it("4b. fully resolved → plain PASS", () => {
    const d = evaluateV117Gate({
      speakers: 4,
      detectedFaces: 4,
      resolvedFaces: 4,
      hydratedBoxes: 4,
      identityMapPresent: true,
      splitScreenReason: null,
    });
    expect(d.block).toBe(false);
    expect(d.softPass).toBe(false);
    expect(d.reason).toBe("ok");
  });

  it("4c. pre-existing blocker preserved: identityMap present but detected < speakers", () => {
    const d = evaluateV117Gate({
      speakers: 3,
      detectedFaces: 2,
      resolvedFaces: 2,
      hydratedBoxes: 3,
      identityMapPresent: true,
      splitScreenReason: null,
    });
    expect(d.block).toBe(true);
    expect(d.detectedForMessage).toBe(2);
  });

  it("5. message branch corresponds to the actual reason (no fabricated 0-of-N)", () => {
    // The exact Samuel-T2 failure shape: 4 speakers, 4 hydrated boxes,
    // identity map unavailable. Must NOT produce a faces_missing message.
    const samuel = evaluateV117Gate({
      speakers: 4,
      detectedFaces: 0,
      resolvedFaces: 0,
      hydratedBoxes: 4,
      identityMapPresent: false,
      splitScreenReason: null,
      identityNullReason: "expected_count_mismatch(detected=2,expected=4)",
    });
    expect(samuel.messageBranch).toBe("none");
    expect(samuel.block).toBe(false);

    // A genuine coverage failure quotes the real count, never a fabricated one.
    const genuine = evaluateV117Gate({
      speakers: 4,
      detectedFaces: 0,
      resolvedFaces: 0,
      hydratedBoxes: 1,
      identityMapPresent: false,
      splitScreenReason: null,
      identityNullReason: "no_faces(aws=zero_faces)",
    });
    expect(genuine.messageBranch).toBe("faces_missing");
    expect(genuine.detectedForMessage).toBe(1);
  });
});

describe("v436 — identity-null reason classification", () => {
  const nullPaths = [
    "expected_count_mismatch(detected=2,expected=4)",
    "provider_empty(gemini_zero_faces,aws=zero_faces)",
    "invalid_result(geometry_gate:torso_bbox)",
    "expected_count_mismatch(rescue_got=3,expected=4)",
    "no_faces(aws=anchor_missing_no_mp4_fallback)",
    "invalid_result(geometry_tighten_failed)",
  ];

  it("6a. every detector null path is attributable", () => {
    for (const r of nullPaths) {
      const reason = classifyIdentityNullReason({
        detectReason: r,
        plateMapPresent: false,
        faceCount: 0,
      });
      expect(reason).toBe(r);
      expect(reason.length).toBeGreaterThan(0);
    }
  });

  it("6b. detector returned a map with zero faces → detector_zero_faces", () => {
    expect(
      classifyIdentityNullReason({
        detectReason: null,
        plateMapPresent: true,
        faceCount: 0,
      }),
    ).toBe("detector_zero_faces");
  });

  it("6c. missing anchor without detector reason → no_anchor", () => {
    expect(
      classifyIdentityNullReason({
        detectReason: "",
        plateMapPresent: false,
        faceCount: 0,
        anchorPresent: false,
      }),
    ).toBe("no_anchor");
  });

  it("6d. never returns an empty reason", () => {
    expect(
      classifyIdentityNullReason({ plateMapPresent: false, faceCount: 0 }),
    ).toBe("unknown");
  });
});
