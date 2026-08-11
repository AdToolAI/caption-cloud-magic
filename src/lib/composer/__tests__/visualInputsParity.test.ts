import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * v417 parity guard.
 *
 * Every provider branch in `compose-video-clips` must take its image / video
 * inputs from the visual-input resolver (`planImageUrl`, `planEndImageUrl`,
 * `planReferenceUrls`, `planReferenceVideoUrls`). A branch that goes back to
 * `scene.referenceImageUrl` directly silently bypasses continuity AND the
 * lip-sync anchor protection, which is exactly the regression this test
 * exists to prevent.
 */
const SOURCE = readFileSync(
  resolve(process.cwd(), "supabase/functions/compose-video-clips/index.ts"),
  "utf8",
);

/** Provider payload fields that carry an image/video input. */
const INPUT_FIELDS = [
  "first_frame_image",
  "last_frame_image",
  "start_image",
  "end_image",
  "image_url",
  "input_image",
  "reference_images",
  "startImageUrl",
  "endImageUrl",
  "firstFrameUrl",
  "lastFrameUrl",
  "referenceImageUrls",
];

describe("compose-video-clips visual-input parity", () => {
  it("never assigns scene.referenceImageUrl to a provider input field", () => {
    const offenders: string[] = [];
    SOURCE.split("\n").forEach((line, idx) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("*") || trimmed.startsWith("//")) return;
      if (!/scene\.referenceImageUrl/.test(trimmed)) return;
      const hitsField = INPUT_FIELDS.some((f) =>
        new RegExp(`\\b${f}\\b\\s*[:=]`).test(trimmed),
      );
      if (hitsField) offenders.push(`${idx + 1}: ${trimmed}`);
    });
    expect(offenders).toEqual([]);
  });

  it("keeps the resolver as the single source for the start frame", () => {
    expect(SOURCE).toContain("const planImageUrl = visualPlan.firstFrameUrl;");
    expect(SOURCE).toContain("planSceneVisualInputs(");
  });

  it("passes the anchor into the resolver read-only", () => {
    expect(SOURCE).toContain("anchorImageUrl: scene.referenceImageUrl ?? null");
  });

  it("backfills the continuity frame server-side", () => {
    expect(SOURCE).toContain("ensureTransitionFrame(");
    expect(SOURCE).toContain("previousFrameUrl: continuityFrameUrl");
    expect(SOURCE).toContain("previousClipUrl: continuityClipUrl");
  });

  it("never asks the server extractor for a frame on a match-cut scene", () => {
    expect(SOURCE).toContain('continuityPref !== "match-cut"');
  });
});

describe("server-side transition frame helper", () => {
  const HELPER = readFileSync(
    resolve(process.cwd(), "supabase/functions/_shared/transition-frame.ts"),
    "utf8",
  );

  it("is AWS-only — no Replicate / lucataco frame grabs", () => {
    expect(HELPER).not.toMatch(/replicate/i);
    expect(HELPER).not.toMatch(/lucataco/i);
  });

  it("writes the user id as the first storage path segment", () => {
    expect(HELPER).toContain("`${userId}/${projectId}/transition-frames/");
  });

  it("never writes reference_image_url or lock_reference_url", () => {
    expect(HELPER).not.toContain("reference_image_url");
    expect(HELPER).not.toContain("lock_reference_url");
  });
});
