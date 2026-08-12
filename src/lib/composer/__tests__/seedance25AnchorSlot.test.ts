import { describe, it, expect } from "vitest";
import { planSceneVisualInputs } from "../../../../supabase/functions/_shared/visual-inputs.ts";

/**
 * v422 — Seedance 2.5 has ONE exclusive visual-input slot. On an identity
 * protected (lip-sync) scene the composed scene anchor must own that slot;
 * raw cast portraits must never travel to ModelArk, whose privacy filter
 * rejects clear photos of real people with
 * `InputImageSensitiveContentDetected.PrivacyInformation`.
 */

const ANCHOR = "https://cdn.test/scene-anchors/anchor.png";
const PORTRAITS = [1, 2, 3, 4].map((i) => ({
  url: `https://cdn.test/cast/p${i}.png`,
  kind: "image" as const,
  role: "character" as const,
  weight: 0.9,
}));

const LIPSYNC_ROW = {
  lip_sync_with_voiceover: true,
  engine_override: "cinematic-sync",
  dialog_mode: "multi",
  character_shots: [
    { characterId: "a", shotType: "medium" },
    { characterId: "b", shotType: "medium" },
  ],
  lock_reference_url: null,
} as any;

describe("Seedance 2.5 exclusive slot arbitration", () => {
  it("gives the anchor the exclusive slot and sends no portraits", () => {
    const plan = planSceneVisualInputs(LIPSYNC_ROW, {
      clipSource: "ai-seedance25",
      anchorImageUrl: ANCHOR,
      references: PORTRAITS as any,
    });

    expect(plan.inputMode).toBe("first-frame");
    expect(plan.firstFrameUrl).toBe(ANCHOR);
    expect(plan.references).toEqual([]);
    expect(plan.warnings).toContain("anchor_takes_exclusive_slot");
  });

  it("keeps references when there is no anchor to protect", () => {
    const plan = planSceneVisualInputs(
      { ...LIPSYNC_ROW, lip_sync_with_voiceover: false, engine_override: null },
      {
        clipSource: "ai-seedance25",
        anchorImageUrl: null,
        references: PORTRAITS as any,
      },
    );

    expect(plan.inputMode).toBe("references");
    expect(plan.references.length).toBeGreaterThan(0);
    expect(plan.firstFrameUrl).toBeUndefined();
  });

  for (const source of ["ai-happyhorse", "ai-hailuo"]) {
    it(`leaves ${source} unchanged: anchor as start frame, no references`, () => {
      const plan = planSceneVisualInputs(LIPSYNC_ROW, {
        clipSource: source,
        anchorImageUrl: ANCHOR,
        references: PORTRAITS as any,
      });

      expect(plan.firstFrameUrl).toBe(ANCHOR);
      expect(plan.references).toEqual([]);
      expect(plan.transition.mode).toBe("match-cut");
    });
  }
});
