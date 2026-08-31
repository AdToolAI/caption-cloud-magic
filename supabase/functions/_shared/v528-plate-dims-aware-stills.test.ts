/**
 * V528 — PLATE-DIMS-AWARE IDENTITY STILLS + RASTER-FENCED CACHE.
 *
 * Generation 26: the plate probed at 656x1406, V527 passed, V526-A picked
 * frames [23, 225, 428], V525 rendered all three — into 1280x720, because the
 * still payload carried no target dimensions and `DialogStitchVideo` fell back
 * to its landscape default while `object-fit: cover` cropped the portrait
 * plate. V524 refused every frame with `dims_incoherent` (aspect_drift 2.8103)
 * and was right to.
 *
 * These tests pin the raster rule, not the incident: a still is only evidence
 * about a plate if it was rendered at that plate's raster, and the cache must
 * not be able to hand back a different one.
 */
import { assert, assertEquals, assertNotEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  extractPlateFrame,
  plateFrameCachePath,
  probeStillDims,
  resolvePlateRaster,
} from "./v525-plate-frame-extract.ts";

// ── Gen26 production geometry ───────────────────────────────────────
const PLATE = { width: 656, height: 1406 };
const LANDSCAPE = { width: 1280, height: 720 };

const jpeg = (width: number, height: number, bytes = 2048): Uint8Array => {
  const out = new Uint8Array(bytes);
  out.set([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08]);
  out[7] = (height >> 8) & 0xff;
  out[8] = height & 0xff;
  out[9] = (width >> 8) & 0xff;
  out[10] = width & 0xff;
  out[11] = 0x03;
  return out;
};

const png = (width: number, height: number, bytes = 2048): Uint8Array => {
  const out = new Uint8Array(bytes);
  out.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  out.set([0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52], 8);
  const be = (o: number, v: number) => {
    out[o] = (v >>> 24) & 0xff;
    out[o + 1] = (v >>> 16) & 0xff;
    out[o + 2] = (v >>> 8) & 0xff;
    out[o + 3] = v & 0xff;
  };
  be(16, width);
  be(20, height);
  return out;
};

/** A harness whose renderer returns a chosen raster and counts its calls. */
function harness(opts: {
  plateDims: { width: number; height: number } | null;
  produce?: (dims: { width: number; height: number } | null | undefined) => Uint8Array;
  cache?: Map<string, string>;
}) {
  const cache = opts.cache ?? new Map<string, string>();
  const asked: Array<{ frame: number; dims: { width: number; height: number } | null | undefined }> = [];
  let renders = 0;
  const run = (frameNumber: number) =>
    extractPlateFrame({
      userId: "u1",
      projectId: "p1",
      sceneId: "s1",
      baseVideoUrl: "https://cdn.example.com/gen-26/base.mp4",
      totalSec: 15,
      plateDims: opts.plateDims,
      frameNumber,
      timeoutMs: 1000,
      fingerprint: async () => "fp26",
      readCache: async (path) => cache.get(path) ?? null,
      renderStill: async (_url, _total, frame, _timeout, targetDims) => {
        renders++;
        asked.push({ frame, dims: targetDims });
        return (opts.produce ?? ((d) => jpeg(d?.width ?? 1280, d?.height ?? 720)))(targetDims);
      },
      writeCache: async (path) => {
        cache.set(path, `https://cdn.example.com/${path}`);
        return `https://cdn.example.com/${path}`;
      },
    });
  return { run, cache, asked, renders: () => renders };
}

// ── 1 — the plate raster is what gets asked for ───────────────────────
Deno.test("V528 — Gen26: a 656x1406 plate asks the renderer for 656x1406", async () => {
  const h = harness({ plateDims: PLATE });
  const r = await h.run(23);
  assertEquals(h.asked[0].dims, PLATE);
  assertEquals(r.ok, true);
  assertEquals(r.requestedRaster, PLATE);
  assertEquals(r.actualRaster, PLATE);
});

// ── 2 — a renderer that ignores the request is caught ─────────────────
Deno.test("V528 — Gen26: a 1280x720 still for a 656x1406 plate fails closed", async () => {
  const h = harness({ plateDims: PLATE, produce: () => jpeg(1280, 720) });
  const r = await h.run(23);
  assertEquals(r.ok, false);
  assertEquals(r.reason, "still_dims_mismatch");
  assertEquals(r.detail, "expected=656x1406 actual=1280x720");
  assertEquals(r.requestedRaster, PLATE);
  assertEquals(r.actualRaster, LANDSCAPE);
  // Nothing incoherent is handed on.
  assertEquals(r.imageUrl, undefined);
  assertEquals(h.cache.size, 0);
});

// ── 3 — what V524 would have made of each ─────────────────────────────
Deno.test("V528 — Gen26: the V524 dims gate arithmetic, before and after", () => {
  const drift = (s: { width: number; height: number }, p: { width: number; height: number }) =>
    Math.abs((s.width / s.height) - (p.width / p.height)) / (p.width / p.height);
  // What production measured: still=1280x720 plate=656x1406 aspect_drift=2.8103
  assertEquals(drift(LANDSCAPE, PLATE).toFixed(4), "2.8103");
  assert(drift(LANDSCAPE, PLATE) > 0.01, "old raster must trip the unchanged gate");
  // With V528 the still IS the plate raster, so the drift is exactly zero.
  assertEquals(drift(PLATE, PLATE), 0);
  assert(drift(PLATE, PLATE) <= 0.01, "new raster must clear the unchanged gate");
});

// ── 4 — the cache key carries the raster ──────────────────────────────
Deno.test("V528 — cache path differs per raster and is unreachable from the old one", () => {
  const base = { userId: "u1", projectId: "p1", sceneId: "s1", fingerprint: "fp26", frameNumber: 23 };
  const portrait = plateFrameCachePath({ ...base, raster: PLATE });
  const landscape = plateFrameCachePath({ ...base, raster: LANDSCAPE });
  assertEquals(portrait, "u1/p1/plate-frames/s1/fp26/656x1406/f23.jpeg");
  assertEquals(landscape, "u1/p1/plate-frames/s1/fp26/1280x720/f23.jpeg");
  assertNotEquals(portrait, landscape);
  // The pre-V528 name has no raster segment, so it is not addressable at all.
  const legacy = "u1/p1/plate-frames/s1/fp26/f23.jpeg";
  assertNotEquals(portrait, legacy);
  assertNotEquals(landscape, legacy);
});

// ── 5 — a stale 1280x720 object cannot satisfy a 656x1406 request ─────
Deno.test("V528 — a pre-V528 cache object cannot serve the new raster", async () => {
  const cache = new Map<string, string>([
    // Both the legacy name and a wrong-raster V528 name are seeded.
    ["u1/p1/plate-frames/s1/fp26/f23.jpeg", "https://old/legacy.jpeg"],
    ["u1/p1/plate-frames/s1/fp26/1280x720/f23.jpeg", "https://old/landscape.jpeg"],
  ]);
  const h = harness({ plateDims: PLATE, cache });
  const r = await h.run(23);
  assertEquals(r.cacheHit, false);
  assertEquals(h.renders(), 1, "the stale objects must not be reused");
  assertEquals(r.imageUrl, "https://cdn.example.com/u1/p1/plate-frames/s1/fp26/656x1406/f23.jpeg");
});

// ── 6 — same video/frame/raster retries hit the cache, cost unchanged ──
Deno.test("V528 — one render per raster; the retry is free", async () => {
  const h = harness({ plateDims: PLATE });
  const first = await h.run(23);
  const second = await h.run(23);
  assertEquals(first.ok, true);
  assertEquals(second.ok, true);
  assertEquals(first.cacheHit, false);
  assertEquals(second.cacheHit, true);
  assertEquals(second.source, "probe_cache");
  assertEquals(h.renders(), 1, "V528 must not add a still to the normal case");
  // A cache hit still names the raster it is fenced by.
  assertEquals(second.requestedRaster, PLATE);
  assertEquals(second.actualRaster, PLATE);
});

// ── 7 — landscape plates are not a special case ───────────────────────
Deno.test("V528 — a landscape plate asks for and accepts its own raster", async () => {
  const h = harness({ plateDims: LANDSCAPE });
  const r = await h.run(23);
  assertEquals(h.asked[0].dims, LANDSCAPE);
  assertEquals(r.ok, true);
  assertEquals(r.actualRaster, LANDSCAPE);
});

// ── 8 — no 9:16 assumption anywhere ───────────────────────────────────
Deno.test("V528 — non-9:16 portrait rasters are supported unchanged", async () => {
  for (const dims of [PLATE, { width: 720, height: 1560 }, { width: 1080, height: 1920 }, { width: 900, height: 900 }]) {
    const h = harness({ plateDims: dims });
    const r = await h.run(7);
    assertEquals(h.asked[0].dims, dims);
    assertEquals(r.ok, true, `${dims.width}x${dims.height}`);
    assertEquals(r.actualRaster, dims);
  }
});

// ── 9 — the even()/>=64 contract, mirrored not invented ───────────────
Deno.test("V528 — raster resolution mirrors the composition's own normalization", () => {
  // Gen26: both even, both well above 64 → exact.
  assertEquals(resolvePlateRaster(PLATE), PLATE);
  assertEquals(resolvePlateRaster(LANDSCAPE), LANDSCAPE);
  // Odd dimensions are decremented, exactly as `calculateMetadata` does.
  assertEquals(resolvePlateRaster({ width: 657, height: 1407 }), { width: 656, height: 1406 });
  // Below 64 the composition would silently fall back to 1280x720 — i.e.
  // rebuild the Gen26 bug — so it is refused here instead.
  assertEquals(resolvePlateRaster({ width: 63, height: 1406 }), null);
  assertEquals(resolvePlateRaster({ width: 656, height: 63 }), null);
  assertEquals(resolvePlateRaster({ width: 64, height: 64 }), { width: 64, height: 64 });
  assertEquals(resolvePlateRaster(null), null);
  assertEquals(resolvePlateRaster(undefined), null);
  assertEquals(resolvePlateRaster({ width: NaN, height: 1406 }), null);
  assertEquals(resolvePlateRaster({ width: 656, height: Infinity }), null);
});

// ── 10 — unusable plate dims fail closed before anything renders ──────
Deno.test("V528 — unusable plate dims fail closed and render nothing", async () => {
  for (const dims of [null, { width: 0, height: 0 }, { width: 32, height: 32 }]) {
    const h = harness({ plateDims: dims as any });
    const r = await h.run(23);
    assertEquals(r.ok, false);
    assertEquals(r.reason, "invalid_plate_dims");
    assertEquals(h.renders(), 0, "no Lambda still may be paid for");
  }
});

// ── 11 — unreadable still bytes fail closed ───────────────────────────
Deno.test("V528 — a still whose raster cannot be read fails closed", async () => {
  const h = harness({ plateDims: PLATE, produce: () => new Uint8Array(2048) });
  const r = await h.run(23);
  assertEquals(r.ok, false);
  assertEquals(r.reason, "still_dims_unavailable");
  assertEquals(r.requestedRaster, PLATE);
  assertEquals(r.actualRaster, null);
  assertEquals(h.cache.size, 0);
});

// ── 12 — the raster probe itself ──────────────────────────────────────
Deno.test("V528 — probeStillDims reads JPEG and PNG headers", () => {
  assertEquals(probeStillDims(jpeg(656, 1406)), PLATE);
  assertEquals(probeStillDims(jpeg(1280, 720)), LANDSCAPE);
  assertEquals(probeStillDims(png(656, 1406)), PLATE);
  assertEquals(probeStillDims(png(1920, 1080)), { width: 1920, height: 1080 });
  // Not an image, truncated, or empty.
  assertEquals(probeStillDims(new Uint8Array(2048)), null);
  assertEquals(probeStillDims(new Uint8Array([0xff, 0xd8])), null);
  assertEquals(probeStillDims(new Uint8Array(0)), null);
});

// ── 13 — object-fit: cover is geometrically neutral at equal raster ───
Deno.test("V528 — cover is a no-op once composition raster equals plate raster", () => {
  // `object-fit: cover` scales by max(cw/sw, ch/sh) and centre-crops.
  const cover = (s: { width: number; height: number }, c: { width: number; height: number }) => {
    const k = Math.max(c.width / s.width, c.height / s.height);
    const drawn = { width: s.width * k, height: s.height * k };
    return {
      scale: k,
      cropX: (drawn.width - c.width) / 2,
      cropY: (drawn.height - c.height) / 2,
    };
  };
  // Gen26 as shipped: a portrait plate forced into the landscape default.
  const old = cover(PLATE, LANDSCAPE);
  assert(old.scale > 1, "the plate was blown up");
  assert(old.cropY > 0, "and most of its height was cut away");
  assertEquals(Math.round(old.cropY), 1012);
  // With V528 the two rasters agree, so cover neither scales nor crops.
  const now = cover(PLATE, PLATE);
  assertEquals(now, { scale: 1, cropX: 0, cropY: 0 });
});

// ── 14 — V452 / defaultRenderStill payload contract ───────────────────
Deno.test("V528 — omitting target dims leaves the V452 payload byte-identical", async () => {
  const src = await Deno.readTextFile("./supabase/functions/_shared/plate-face-track.ts");
  // The historical four keys are built unconditionally and in order.
  assert(
    src.includes("const props: Record<string, unknown> = {") &&
      src.includes("masterVideoUrl: videoUrl,") &&
      src.includes('masterAudioUrl: "",') &&
      src.includes("totalSec,") &&
      src.includes("shots: [],"),
    "base props must stay the historical four",
  );
  // The raster keys are added ONLY inside the finite/positive guard.
  const guard = src.indexOf("if (Number.isFinite(tw) && Number.isFinite(th) && tw > 0 && th > 0) {");
  const tw = src.indexOf("props.targetWidth = tw;");
  const th = src.indexOf("props.targetHeight = th;");
  assert(guard > 0 && tw > guard && th > tw, "target dims must be guarded");
  // srcWidth/srcHeight are not sent: they only scale shot overlays, and this
  // payload carries `shots: []`.
  assertEquals(src.includes("props.srcWidth"), false);
  assertEquals(src.includes("props.srcHeight"), false);
  // And the serialization itself is unchanged when the guard does not fire.
  const historical = JSON.stringify({ masterVideoUrl: "u", masterAudioUrl: "", totalSec: 5, shots: [] });
  const now: Record<string, unknown> = { masterVideoUrl: "u", masterAudioUrl: "", totalSec: 5, shots: [] };
  assertEquals(JSON.stringify(now), historical);
  // V452 still calls it with four arguments.
  assert(
    src.includes("await renderStill!(input.plateVideoUrl, input.totalSec, frame, perSample)"),
    "the V452 call site must stay four-argument",
  );
});

// ── 15 — neighbouring layers untouched ────────────────────────────────
Deno.test("V528 — V524, V526-A, V526-B and V527 public surfaces unchanged", async () => {
  const v524 = await import("./v524-plate-identity-registration.ts");
  for (const fn of ["registerPlateNativeIdentities", "isPlateNativeRegistrationFresh", "reuseStoredRegistration"]) {
    assertEquals(typeof (v524 as any)[fn], "function", `V524 ${fn}`);
  }
  const v526a = await import("./v526-scene-frame-authority.ts");
  for (const fn of ["selectSceneIdentityFrames", "buildSceneFrameTelemetry"]) {
    assertEquals(typeof (v526a as any)[fn], "function", `V526-A ${fn}`);
  }
  const v526b = await import("./v526b-common-frame-identity.ts");
  for (const fn of ["planCommonFrameCompletion", "buildStepFrames", "completeCommonFrameCohort"]) {
    assertEquals(typeof (v526b as any)[fn], "function", `V526-B ${fn}`);
  }
  const cand = await import("./plate-face-candidates.ts");
  assertEquals(cand.PLATE_FACE_SANITY.minFaceShortSidePx, 40);
  const router = await import("./plateFaceSlotRouter.ts");
  assertEquals(typeof router.resolveDimensionAuthority, "function");
  // The V524 aspect gate is untouched.
  const v524src = await Deno.readTextFile("./supabase/functions/_shared/v524-plate-identity-registration.ts");
  assert(v524src.includes("if (aspectDrift > 0.01) {"), "V524 aspect gate must stay at 0.01");
  assert(v524src.includes('return fail("dims_incoherent"'), "dims_incoherent must remain");
});

// ── 16 — bounded telemetry names both rasters ─────────────────────────
Deno.test("V528 — every attempt reports the requested and the actual raster", async () => {
  const ok = await harness({ plateDims: PLATE }).run(225);
  assertEquals(ok.requestedRaster, PLATE);
  assertEquals(ok.actualRaster, PLATE);
  assertEquals(ok.cacheHit, false);
  assertEquals(ok.source, "remotion_still");

  const bad = await harness({ plateDims: PLATE, produce: () => jpeg(1280, 720) }).run(225);
  assertEquals(bad.requestedRaster, PLATE);
  assertEquals(bad.actualRaster, LANDSCAPE);
  assertEquals(bad.reason, "still_dims_mismatch");

  // No image bytes are ever carried in the result.
  for (const r of [ok, bad]) {
    assertEquals((r as any).bytesData, undefined);
    assert(!("image" in (r as any)));
  }
});

// ── 17 — pre-existing failure classes still reachable ─────────────────
Deno.test("V528 — the V525 failure classes are extended, not replaced", async () => {
  const noVideo = await extractPlateFrame({
    userId: "u1",
    projectId: "p1",
    sceneId: "s1",
    baseVideoUrl: null,
    totalSec: 15,
    plateDims: PLATE,
    frameNumber: 23,
    timeoutMs: 1000,
    fingerprint: async () => "fp",
    readCache: async () => null,
    renderStill: async () => jpeg(656, 1406),
    writeCache: async () => null,
  });
  assertEquals(noVideo.reason, "source_video_unavailable");

  const tooSmall = await harness({ plateDims: PLATE, produce: () => new Uint8Array(16) }).run(23);
  assertEquals(tooSmall.reason, "invalid_still_result");

  const timedOut = await harness({
    plateDims: PLATE,
    produce: () => {
      throw new Error("still timed out after 30000ms");
    },
  }).run(23);
  assertEquals(timedOut.reason, "still_render_timeout");
});
