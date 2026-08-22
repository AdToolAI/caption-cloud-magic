import { describe, it, expect } from "vitest";
import {
  isGeneratedAnchorUrl,
  isResetOwnedGeneratedAnchor,
  parseSupabaseStorageUrl,
  verifyAnchorObject,
  blocksProviderDispatch,
  resetOwnedAnchorPatch,
} from "../../../supabase/functions/_shared/generated-anchor.ts";

const SCENE = "e658509d-1111-2222-3333-444455556666";
const OTHER = "aaaaaaaa-1111-2222-3333-444455556666";
const anchorUrl = (scene: string) =>
  `https://x.supabase.co/storage/v1/object/public/composer-assets/scene-anchors/${scene}-abc123.png`;

const storage = (present: string[]) => ({
  storage: {
    from: () => ({
      list: async (dir: string, opts?: any) => ({
        data: present
          .filter((p) => p.startsWith(dir))
          .map((p) => ({ name: p.slice(dir.length + 1) }))
          .filter((o) => !opts?.search || o.name === opts.search),
        error: null,
      }),
    }),
  },
});

describe("v440 — generated anchor lifecycle", () => {
  it("recognizes generated anchors only", () => {
    expect(isGeneratedAnchorUrl(anchorUrl(SCENE))).toBe(true);
    expect(isGeneratedAnchorUrl("https://cdn/brand/portrait.png")).toBe(false);
    expect(isGeneratedAnchorUrl(null)).toBe(false);
  });

  it("only claims ownership of anchors of the same scene", () => {
    expect(isResetOwnedGeneratedAnchor(anchorUrl(SCENE), SCENE)).toBe(true);
    expect(isResetOwnedGeneratedAnchor(anchorUrl(OTHER), SCENE)).toBe(false);
    expect(isResetOwnedGeneratedAnchor("https://cdn/portrait.png", SCENE)).toBe(false);
  });

  it("parses supabase storage urls", () => {
    const ref = parseSupabaseStorageUrl(anchorUrl(SCENE));
    expect(ref?.bucket).toBe("composer-assets");
    expect(ref?.dir).toBe("scene-anchors");
    expect(ref?.file).toBe(`${SCENE}-abc123.png`);
    expect(parseSupabaseStorageUrl("https://cdn/x.png")).toBeNull();
  });

  it("verifies existing objects and detects purged ones", async () => {
    const path = `scene-anchors/${SCENE}-abc123.png`;
    expect(await verifyAnchorObject(storage([path]) as any, anchorUrl(SCENE)))
      .toBe("anchor_verified");
    expect(await verifyAnchorObject(storage([]) as any, anchorUrl(SCENE)))
      .toBe("anchor_object_missing");
    expect(await verifyAnchorObject(storage([]) as any, null))
      .toBe("anchor_pointer_missing");
    expect(await verifyAnchorObject(storage([]) as any, "https://cdn/x.png"))
      .toBe("anchor_not_storage_backed");
  });

  it("blocks dispatch exactly for missing pointer or missing object", () => {
    expect(blocksProviderDispatch("anchor_pointer_missing")).toBe(true);
    expect(blocksProviderDispatch("anchor_object_missing")).toBe(true);
    expect(blocksProviderDispatch("anchor_verified")).toBe(false);
    expect(blocksProviderDispatch("anchor_not_storage_backed")).toBe(false);
    expect(blocksProviderDispatch("anchor_unverifiable")).toBe(false);
  });

  it("reset patch nulls only reset-owned pointers", () => {
    expect(
      resetOwnedAnchorPatch(
        { reference_image_url: anchorUrl(SCENE), lock_reference_url: anchorUrl(SCENE) },
        SCENE,
      ),
    ).toEqual({ reference_image_url: null, lock_reference_url: null });

    expect(
      resetOwnedAnchorPatch(
        { reference_image_url: "https://cdn/brand/portrait.png", lock_reference_url: anchorUrl(OTHER) },
        SCENE,
      ),
    ).toEqual({});
  });
});
