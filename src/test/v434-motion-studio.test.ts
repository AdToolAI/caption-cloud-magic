import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildImmutableArtifactKey,
  isImmutableArtifactKey,
  sha256Hex,
} from "../../supabase/functions/_shared/v434-immutable-artifact";
import {
  buildMadRatioTelemetry,
  computeMadSummary,
  median,
  V434_MAD_STATUS,
  type MadFrame,
} from "../../supabase/functions/_shared/v434-mad-ratio";
import {
  deriveMouthRoi,
  V434_LEGACY_ROI,
} from "../../supabase/functions/_shared/v434-motion-roi";
import {
  deriveMadRatioThreshold,
  validateManifest,
} from "../../supabase/functions/_shared/v434-calibration-manifest";

const root = resolve(__dirname, "../..");

/** Flat grey RGBA frame with an optional bright block inside the ROI. */
function frame(width: number, height: number, base: number, block?: { x: number; y: number; w: number; h: number; value: number }): MadFrame {
  const data = new Uint8Array(width * height * 4).fill(base);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  if (block) {
    for (let y = block.y; y < block.y + block.h; y++) {
      for (let x = block.x; x < block.x + block.w; x++) {
        const off = (y * width + x) * 4;
        data[off] = block.value;
        data[off + 1] = block.value;
        data[off + 2] = block.value;
      }
    }
  }
  return { width, height, data };
}

describe("V434 Step 1 — immutable artifact paths", () => {
  const base = {
    userId: "user-1",
    sceneId: "scene-1",
    runId: "run-A",
    generation: 3,
    passIdx: 2,
    kind: "provider-output" as const,
  };

  it("is deterministic for the same run/generation/pass/attempt", () => {
    expect(buildImmutableArtifactKey(base)).toBe(buildImmutableArtifactKey(base));
  });

  it("never collides across runs, generations, passes or attempts", () => {
    const keys = new Set([
      buildImmutableArtifactKey(base),
      buildImmutableArtifactKey({ ...base, runId: "run-B" }),
      buildImmutableArtifactKey({ ...base, generation: 4 }),
      buildImmutableArtifactKey({ ...base, passIdx: 3 }),
      buildImmutableArtifactKey({ ...base, attempt: 1 }),
      buildImmutableArtifactKey({ ...base, kind: "preclip" }),
    ]);
    expect(keys.size).toBe(6);
  });

  it("regression: the retired mutable scheme is NOT accepted as immutable", () => {
    expect(isImmutableArtifactKey("composer/uid/scene-lipsync-pass-1.mp4")).toBe(false);
    expect(isImmutableArtifactKey(buildImmutableArtifactKey(base))).toBe(true);
  });

  it("carries run, generation and pass qualifiers in the path", () => {
    const key = buildImmutableArtifactKey(base);
    expect(key).toContain("/run-run-a/");
    expect(key).toContain("/gen-3/");
    expect(key).toContain("/pass-2/");
    expect(key.endsWith("provider-output-a0.mp4")).toBe(true);
  });

  it("hashes bytes reproducibly", async () => {
    const a = await sha256Hex(new Uint8Array([1, 2, 3]));
    const b = await sha256Hex(new Uint8Array([1, 2, 3]));
    const c = await sha256Hex(new Uint8Array([1, 2, 4]));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("V434 Step 3 — scale-free MAD telemetry", () => {
  const roi = { bx: 0, by: 0, bw: 8, bh: 8 };

  it("returns zero MAD for a static sequence", () => {
    const s = computeMadSummary([frame(8, 8, 100), frame(8, 8, 100), frame(8, 8, 100)], roi);
    expect(s.series).toHaveLength(2);
    expect(s.mean).toBeCloseTo(0, 10);
  });

  it("is scale-free: a uniform brightness/contrast change does not change the ratio", () => {
    const mk = (gain: number) => [
      frame(8, 8, Math.round(50 * gain)),
      frame(8, 8, Math.round(60 * gain)),
      frame(8, 8, Math.round(50 * gain)),
    ];
    const preclip = computeMadSummary(mk(1), roi);
    const provider = computeMadSummary(mk(1).map((f, i) => (i === 1 ? frame(8, 8, 80) : f)), roi);
    const preclipScaled = computeMadSummary(mk(2), roi);
    const providerScaled = computeMadSummary(
      mk(2).map((f, i) => (i === 1 ? frame(8, 8, 160) : f)),
      roi,
    );
    const r1 = buildMadRatioTelemetry(preclip, provider).mad_ratio!;
    const r2 = buildMadRatioTelemetry(preclipScaled, providerScaled).mad_ratio!;
    expect(r1).toBeCloseTo(r2, 6);
  });

  it("separates the v433 golden failure from genuine motion", () => {
    // Verbatim mouth-band MAD series from docs/v433-motion-studio-rca.md.
    const noopProvider = [3.31, 2.5, 4.96, 2.41, 2.07, 3.42, 2.92];
    const noopPreclip = [2.69, 2.46, 3.57, 2.85, 1.53, 2.32, 2.54];
    const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
    const ratio = mean(noopProvider) / mean(noopPreclip);
    expect(ratio).toBeLessThan(1.5);
    // Lowest genuine motion in the same set is 1.68 → separated.
    expect(ratio).toBeLessThan(1.68);
  });

  it("reports an unknown ratio as null, never as 0", () => {
    const t = buildMadRatioTelemetry(null, null);
    expect(t.mad_ratio).toBeNull();
    expect(t.status).toBe(V434_MAD_STATUS);
  });

  it("median helper is exact", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBe(0);
  });
});

describe("V434 Step 4 — geometry-coupled mouth ROI", () => {
  it("falls back to the frozen v404 ROI when geometry is missing", () => {
    const d = deriveMouthRoi(null);
    expect(d.source).toBe("legacy_frozen");
    expect(d.roi).toEqual(V434_LEGACY_ROI);
  });

  it("falls back when the crop is not mouth-anchored", () => {
    expect(deriveMouthRoi({ anchor: "face_center", faceShareInCrop: 0.42, cropSize: 400 }).source)
      .toBe("legacy_frozen");
  });

  it("centres the band on the mouth for an unclamped mouth-anchored crop", () => {
    const d = deriveMouthRoi({
      anchor: "mouth",
      faceShareInCrop: 0.42,
      cropSize: 400,
      mouthOffsetPx: 0,
    });
    expect(d.source).toBe("geometry");
    expect(d.roi.centerY).toBeCloseTo(0.5, 6);
    // The retired fixed band sat 10 points lower — on the nose / upper lip.
    expect(d.roi.centerY).not.toBeCloseTo(V434_LEGACY_ROI.centerY, 3);
    expect(d.roi.width).toBeGreaterThan(0);
    expect(d.roi.height).toBeGreaterThan(0);
  });

  it("scales the band with the measured face share", () => {
    const small = deriveMouthRoi({ anchor: "mouth", faceShareInCrop: 0.16, cropSize: 400, mouthOffsetPx: 0 });
    const large = deriveMouthRoi({ anchor: "mouth", faceShareInCrop: 0.64, cropSize: 400, mouthOffsetPx: 0 });
    expect(large.roi.width).toBeGreaterThan(small.roi.width);
    expect(large.roi.height).toBeGreaterThan(small.roi.height);
  });

  it("refuses to guess when only an unsigned mouth offset is known", () => {
    const d = deriveMouthRoi({ anchor: "mouth", faceShareInCrop: 0.42, cropSize: 400, mouthOffsetPx: 37 });
    expect(d.source).toBe("legacy_frozen");
    expect(d.reason).toContain("direction_unknown");
  });

  it("uses a signed offset when available and keeps the band inside the frame", () => {
    const d = deriveMouthRoi({
      anchor: "mouth",
      faceShareInCrop: 0.42,
      cropSize: 400,
      mouthOffset: { dx: 0, dy: 1000 },
    });
    expect(d.source).toBe("geometry");
    expect(d.roi.centerY + d.roi.height / 2).toBeLessThanOrEqual(1);
    expect(d.roi.centerX - d.roi.width / 2).toBeGreaterThanOrEqual(0);
  });
});

describe("V434 — measurement helper stays backwards compatible", () => {
  // The Deno edge module cannot be imported into vitest (npm: specifiers), so
  // the invariant is guarded at source level: the ROI parameter must DEFAULT to
  // the frozen v404 band, and the geometry ROI must not drive the verdict
  // unless explicitly opted in.
  const src = readFileSync(
    resolve(root, "supabase/functions/_shared/measure-provider-motion-sync.ts"),
    "utf8",
  );

  it("stillRoiForSource defaults to the frozen v404 ROI", () => {
    expect(src).toContain("roi: MouthRoiNormalized = MOTION_ROI");
    expect(src).toContain("export const MOTION_ROI = { centerX: 0.5, centerY: 0.6, width: 0.28, height: 0.12 }");
  });

  it("the geometry ROI is opt-in only and never silently authoritative", () => {
    expect(src).toContain("args.useGeometryRoiForVerdict === true");
    expect(src).toContain("const verdictRoi: MouthRoiNormalized = applyGeometryRoi ? derivedRoi.roi : MOTION_ROI");
  });

  it("the MAD telemetry reuses the already decoded stills (no extra Lambda invokes)", () => {
    expect(src).toContain("computeMadSummary(decoded, madRoi)");
    expect(src.match(/renderStill\(url, duration, f, budget\(\)\)/g) ?? []).toHaveLength(1);
  });
});

describe("V434 Step 2 — calibration manifest", () => {
  const manifest = JSON.parse(
    readFileSync(resolve(root, "scripts/calibration/v434/manifest.json"), "utf8"),
  );

  it("is structurally valid", () => {
    const v = validateManifest(manifest);
    expect(v.errors).toEqual([]);
    expect(v.ok).toBe(true);
  });

  it("treats every v404-era sample as non-reproducible ground truth", () => {
    const v = validateManifest(manifest);
    expect(v.reproducible).toBe(0);
    expect(v.legacy).toBeGreaterThan(0);
  });

  it("derives NO threshold while reproducible samples are missing", () => {
    const d = deriveMadRatioThreshold(manifest);
    expect(d.status).toBe("insufficient_samples");
    expect(d.threshold).toBeNull();
  });

  it("refuses to fit a threshold on overlapping classes", () => {
    const overlapping = {
      version: 1,
      created_at: "2026-01-01T00:00:00.000Z",
      metric: "mad_ratio",
      authority: "telemetry_only",
      samples: [1.2, 1.4, 1.9].concat([1.5, 2.2, 2.4]).map((r, i) => ({
        id: `s${i}`,
        label: i < 3 ? "noop" : "motion",
        status: "reproducible",
        scene_id: "s",
        run_id: "r",
        generation: 1,
        pass_idx: i,
        preclip: { key: "k", sha256: "h" },
        provider: { key: "k", sha256: "h" },
        mad_ratio: r,
        legacy_delta_mean: null,
      })),
    };
    expect(deriveMadRatioThreshold(overlapping).status).toBe("not_separable");
  });

  it("derives a midpoint threshold once classes are reproducible and separable", () => {
    const separable = {
      version: 1,
      created_at: "2026-01-01T00:00:00.000Z",
      metric: "mad_ratio",
      authority: "telemetry_only",
      samples: [1.2, 1.3, 1.35].concat([1.7, 2.0, 2.5]).map((r, i) => ({
        id: `s${i}`,
        label: i < 3 ? "noop" : "motion",
        status: "reproducible",
        scene_id: "s",
        run_id: "r",
        generation: 1,
        pass_idx: i,
        preclip: { key: "k", sha256: "h" },
        provider: { key: "k", sha256: "h" },
        mad_ratio: r,
        legacy_delta_mean: null,
      })),
    };
    const d = deriveMadRatioThreshold(separable);
    expect(d.status).toBe("derived");
    expect(d.threshold).toBeCloseTo(1.525, 6);
  });

  it("rejects a 'reproducible' sample that is not pinned to immutable artifacts", () => {
    const unpinned = {
      version: 1,
      created_at: "2026-01-01T00:00:00.000Z",
      metric: "mad_ratio",
      authority: "telemetry_only",
      samples: [
        {
          id: "x",
          label: "noop",
          status: "reproducible",
          scene_id: "s",
          run_id: null,
          generation: 1,
          pass_idx: 0,
          preclip: { key: null, sha256: null },
          provider: { key: null, sha256: null },
          mad_ratio: null,
          legacy_delta_mean: null,
        },
      ],
    };
    const v = validateManifest(unpinned);
    expect(v.ok).toBe(false);
    expect(v.errors.join(",")).toContain("unpinned_preclip");
  });
});
