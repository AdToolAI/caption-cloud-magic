/**
 * V525 — SERVER-SIDE PLATE FRAME EXTRACTION
 *
 * Scene 67b392b1, generation 21, Sarah pass 0. V524 registration failed with
 * `frame_extract_failed` on frame 30; V523 then correctly refused the
 * anchor-native geometry with `reference_space_mismatch`. Sync.so was never
 * called. Both gates were right.
 *
 * The cause was that V524 had been wired to something that cannot extract a
 * frame. `extractFrameForFaceProbe` says so in its own header — "No Replicate.
 * No lucataco. No ffmpeg calls. Ever." — and its body only looks for a
 * previously cached PNG. Storage held scene-anchor PNGs for this scene and
 * zero probe frames, so all three bounded attempts failed deterministically
 * before identity detection ran.
 *
 * The renderer that can do this already ships: `plate-face-track` has rendered
 * Remotion Lambda `type:"still"` against the plate video for every V452 track
 * sample. V525 reuses it and adds the two missing pieces — somewhere to put
 * the result, and a cache key that cannot hand generation 20's frame to
 * generation 21.
 *
 *   PURE     — executes the extraction decision.
 *   CONTRACT — asserts wiring no unit test can reach.
 */

import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  extractPlateFrame,
  MIN_STILL_BYTES,
  plateFrameCachePath,
  type PlateFrameExtractResult,
} from "./v525-plate-frame-extract.ts";

const USER = "11111111-2222-3333-4444-555555555555";
const PROJECT = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const SCENE = "67b392b1-aca1-489d-b773-d604deb22623";
const GEN21 = "https://example.test/composer/67b392b1/gen-21/base.mp4";
const GEN20 = "https://example.test/composer/67b392b1/gen-20/base.mp4";
const TOTAL_SEC = 8.4;

/** A deterministic stand-in for SHA-256 over the URL. */
const fingerprint = async (v: string) => {
  const d = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(v) as unknown as BufferSource,
  );
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
};

const still = (n = 4096) => new Uint8Array(n).fill(0x42);

/** A storage double: an object map plus call counters. */
const storage = (seed: Record<string, Uint8Array> = {}) => {
  const objects = { ...seed };
  const calls = { read: 0, render: 0, write: 0 };
  return {
    objects,
    calls,
    readCache: async (path: string) => {
      calls.read++;
      return objects[path] ? `https://cdn.test/${path}?signed` : null;
    },
    writeCache: async (path: string, bytes: Uint8Array) => {
      calls.write++;
      objects[path] = bytes;
      return `https://cdn.test/${path}?signed`;
    },
    renderStill: async (_v: string, _t: number, _f: number, _ms: number) => {
      calls.render++;
      return still();
    },
  };
};

const run = (over: Record<string, unknown> = {}, s = storage()) =>
  extractPlateFrame({
    userId: USER,
    projectId: PROJECT,
    sceneId: SCENE,
    baseVideoUrl: GEN21,
    totalSec: TOTAL_SEC,
    frameNumber: 30,
    timeoutMs: 30_000,
    fingerprint,
    readCache: s.readCache,
    renderStill: s.renderStill,
    writeCache: s.writeCache,
    ...over,
  } as never);

// ═══ 1/2/3. the generation-21 control ════════════════════════════════════
Deno.test("PURE — 1/2. an empty cache renders the still and persists it", async () => {
  const s = storage();
  const r = await run({}, s);
  assertEquals(r.ok, true, `${r.reason} ${r.detail ?? ""}`);
  assertEquals(r.frameNumber, 30, "the exact requested frame, not a substitute");
  assertEquals(r.cacheHit, false);
  assertEquals(r.source, "remotion_still");
  assertEquals(r.sourceVideoUrl, GEN21);
  assertEquals(r.bytes, 4096);
  // Cache read first, then exactly one render, then exactly one upload.
  assertEquals(s.calls, { read: 1, render: 1, write: 1 });
  assertEquals(Object.keys(s.objects).length, 1, "persisted for the next attempt");
});

Deno.test("PURE — 3. the returned URL is what feeds the identity resolver", async () => {
  const s = storage();
  const r = await run({}, s);
  assert(typeof r.imageUrl === "string" && r.imageUrl.length > 0);
  assert(r.imageUrl!.includes("plate-frames"), r.imageUrl!);
  assert(r.imageUrl!.includes(SCENE));
  assert(r.imageUrl!.endsWith("f30.jpeg?signed"), r.imageUrl!);
});

// ═══ 4. the cache-hit control ════════════════════════════════════════════
Deno.test("PURE — 4. the same fenced frame is reused, with no render", async () => {
  const s = storage();
  const first = await run({}, s);
  assertEquals(first.ok, true);
  const second = await run({}, s);
  assertEquals(second.ok, true);
  assertEquals(second.cacheHit, true);
  assertEquals(second.source, "probe_cache");
  assertEquals(second.imageUrl, first.imageUrl);
  // One render and one upload across BOTH calls.
  assertEquals(s.calls.render, 1, "no second Lambda still");
  assertEquals(s.calls.write, 1, "no duplicate upload");
});

// ═══ 5/6. stale cache rejection ══════════════════════════════════════════
Deno.test("PURE — 5/6. a different base video cannot reach the cached frame", async () => {
  // Generation 20's frame 30 is already cached. Generation 21 asks for frame
  // 30 of a different video, and the fingerprinted path makes the old object
  // unreachable rather than merely rejected.
  const s = storage();
  const gen20 = await run({ baseVideoUrl: GEN20 }, s);
  assertEquals(gen20.ok, true);
  assertEquals(s.calls.render, 1);

  const gen21 = await run({ baseVideoUrl: GEN21 }, s);
  assertEquals(gen21.ok, true);
  assertEquals(gen21.cacheHit, false, "generation 21 did NOT reuse generation 20");
  assertEquals(s.calls.render, 2, "it rendered its own frame");
  assert(gen21.imageUrl !== gen20.imageUrl, "different paths entirely");
  assertEquals(Object.keys(s.objects).length, 2);
});

Deno.test("PURE — 5. the cache path is fenced by the video fingerprint", async () => {
  const a = plateFrameCachePath({
    userId: USER, projectId: PROJECT, sceneId: SCENE,
    fingerprint: await fingerprint(GEN20), frameNumber: 30,
  });
  const b = plateFrameCachePath({
    userId: USER, projectId: PROJECT, sceneId: SCENE,
    fingerprint: await fingerprint(GEN21), frameNumber: 30,
  });
  assert(a !== b, "same scene, same frame, different plate → different object");
  assert(a.startsWith(`${USER}/${PROJECT}/plate-frames/${SCENE}/`), a);
  assert(a.endsWith("/f30.jpeg"), a);
  // …and it is NOT the legacy unfenced probe namespace.
  assertEquals(a.includes("probe-frames"), false);
  assertEquals(a.includes("-p1-f30"), false);
  // Path segments are sanitised.
  const dirty = plateFrameCachePath({
    userId: "../../etc", projectId: "a b/c", sceneId: SCENE, fingerprint: "ff", frameNumber: 7,
  });
  assertEquals(dirty.includes(".."), false, dirty);
  assertEquals(dirty.split("/").length, 6, dirty);
});

// ═══ 7/8/9. failures are classified, and fail closed ═════════════════════
Deno.test("PURE — 7. a render failure fails closed with its own class", async () => {
  const s = storage();
  const r = await run({
    renderStill: async () => {
      throw new Error("lambda_http_500");
    },
  }, s);
  assertEquals(r.ok, false);
  assertEquals(r.reason, "still_render_failed");
  assertEquals(r.detail, "lambda_http_500");
  assertEquals(r.imageUrl, undefined);
  assertEquals(s.calls.write, 0, "nothing is persisted on failure");
});

Deno.test("PURE — 8. a timeout is not the same failure as a render error", async () => {
  for (const thrown of [
    Object.assign(new Error("signal timed out"), { name: "TimeoutError" }),
    Object.assign(new Error("The signal has been aborted"), { name: "AbortError" }),
    new Error("still render timeout after 30000ms"),
  ]) {
    const r = await run({ renderStill: async () => { throw thrown; } });
    assertEquals(r.ok, false);
    assertEquals(r.reason, "still_render_timeout", String(thrown.message));
  }
});

Deno.test("PURE — 9. an implausible still is refused, not uploaded", async () => {
  const s = storage();
  const tiny = await run({ renderStill: async () => still(MIN_STILL_BYTES - 1) }, s);
  assertEquals(tiny.ok, false);
  assertEquals(tiny.reason, "invalid_still_result");
  assert((tiny.detail ?? "").includes(String(MIN_STILL_BYTES)));
  assertEquals(s.calls.write, 0);

  // …and so is a non-buffer result.
  const bogus = await run({ renderStill: async () => (null as unknown as Uint8Array) });
  assertEquals(bogus.ok, false);
  assertEquals(bogus.reason, "invalid_still_result");
});

Deno.test("PURE — an upload failure is its own class", async () => {
  const s = storage();
  const r = await run({ writeCache: async () => null }, s);
  assertEquals(r.ok, false);
  assertEquals(r.reason, "still_upload_failed");
  assertEquals(r.detail, "no url returned");

  const threw = await run({ writeCache: async () => { throw new Error("bucket_denied"); } });
  assertEquals(threw.reason, "still_upload_failed");
  assertEquals(threw.detail, "bucket_denied");
});

Deno.test("PURE — a missing base video never reaches the renderer", async () => {
  const s = storage();
  for (const url of [null, undefined, "", "not-a-url", "s3://bucket/key"]) {
    const r = await run({ baseVideoUrl: url }, s);
    assertEquals(r.ok, false, String(url));
    assertEquals(r.reason, "source_video_unavailable", String(url));
  }
  assertEquals(s.calls.render, 0, "no Lambda call was ever made");
  assertEquals(s.calls.read, 0, "and no cache lookup either");
});

Deno.test("PURE — a cache read that throws still renders rather than failing", async () => {
  const s = storage();
  const r = await run({ readCache: async () => { throw new Error("storage_5xx"); } }, s);
  assertEquals(r.ok, true, "a cache outage is not an extraction failure");
  assertEquals(r.cacheHit, false);
  assertEquals(s.calls.render, 1);
});

// ═══ CONTRACT — wiring ═══════════════════════════════════════════════════
const read = (rel: string) => Deno.readTextFileSync(new URL(rel, import.meta.url));
const codeOnly = (src: string) =>
  src.split(/\r?\n/).map((l) => {
    const t = l.trim();
    return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") ? "" : l;
  }).join("\n");

const DIALOG = codeOnly(read("../compose-dialog-segments/index.ts"));
const V525 = codeOnly(read("./v525-plate-frame-extract.ts"));
const TRACK = read("./plate-face-track.ts");
const PROBE = read("./face-frame-extract.ts");

Deno.test("CONTRACT — B. the v251 helper never could extract, and is gone from V524", () => {
  // Its own header is the proof; the module is untouched and still serves the
  // legacy face-gate probe path.
  assert(PROBE.includes("No Replicate. No lucataco. No ffmpeg calls. Ever."));
  assert(PROBE.includes("no_cache_no_server_extract"));
  assertEquals(PROBE.includes("V525"), false, "not modified by this release");
  // V524's registration no longer injects it.
  assertEquals(DIALOG.includes("extractFrameForFaceProbe"), false);
  assert(DIALOG.includes("const r = await extractPlateFrame({"));
});

Deno.test("CONTRACT — A. the still renderer is the existing production one", () => {
  // Reused, not re-written: no second Lambda payload anywhere.
  assert(TRACK.includes("export function defaultRenderStill() {"));
  assert(TRACK.includes('type: "still",'));
  assert(TRACK.includes('const STILL_COMPOSITION = "DialogStitchVideo";'));
  assert(TRACK.includes('const STILL_REMOTION_VERSION = "4.0.462";'));
  assert(DIALOG.includes("  defaultRenderStill,"));
  assert(DIALOG.includes("renderStill: v525RenderStill,"));
  // The extractor module itself owns no AWS, no storage, no network.
  assertEquals(V525.includes("AwsClient"), false);
  assertEquals(V525.includes("amazonaws"), false);
  assertEquals(V525.includes("Deno.env"), false);
  assertEquals(V525.includes("supabase"), false);
  assertEquals(V525.includes("fetch("), false);
  assertEquals(V525.split(/\r?\n/).filter((l) => l.trim().startsWith("import ")).length, 0);
  // AWS-only policy: no banned provider reappears.
  for (const banned of ["replicate", "lucataco", "ffmpeg"]) {
    assertEquals(V525.toLowerCase().includes(banned), false, banned);
  }
});

Deno.test("CONTRACT — C. the fenced cache path is used, not the legacy one", () => {
  assert(V525.includes("export function plateFrameCachePath("));
  assert(V525.includes('"plate-frames",'));
  assert(DIALOG.includes("fingerprint: async (value) => {"));
  assert(DIALOG.includes('.from("composer-frames")'));
  assert(DIALOG.includes('contentType: "image/jpeg",'));
});

Deno.test("CONTRACT — F. the bounded three-frame search is unchanged", () => {
  assert(DIALOG.includes("frameCandidatesForTurn(builtPasses[0].segments[0], totalSec, ASSUMED_FPS).slice(0, 3)"));
  assert(DIALOG.includes("for (const frame of v524Reuse.hit ? [] : v524Frames) {"));
  const at = DIALOG.indexOf("for (const frame of v524Reuse.hit ? [] : v524Frames) {");
  const loop = DIALOG.slice(at, at + 6000);
  assert(loop.includes("if (reg.ok) {") && loop.includes("break;"));
});

Deno.test("CONTRACT — G. every attempt is recorded, bounded to three", () => {
  assert(DIALOG.includes("const v525Attempts: RegistrationAttempt[] = [];"));
  assert(DIALOG.includes("v525Attempts.push({"));
  assert(DIALOG.includes("attempts: boundAttempts(v525Attempts),"));
  const helper = codeOnly(read("./v524-plate-identity-registration.ts"));
  assert(helper.includes("export const MAX_REGISTRATION_ATTEMPTS = 3;"));
  assert(helper.includes("return (rows ?? []).slice(0, MAX_REGISTRATION_ATTEMPTS);"));
  // The row carries the extract reason, so a failure names its own cause.
  for (const k of ["extract_ok:", "extract_reason:", "extract_source:", "registration_reason:"]) {
    assert(DIALOG.includes(k), k);
  }
});

Deno.test("CONTRACT — H. the failure is persisted where it cannot clobber", () => {
  // The brief asked for the failed record to be written into
  // `dialog_shots.plate_identity` before the terminal 422. It is not, and
  // deliberately: a full `dialog_shots` write built from the ENTRY snapshot
  // is exactly the pattern V510 removed — it overwrites whatever a
  // concurrent sibling terminalized in between. `v510-terminal-fence`
  // counts the surviving call sites so a fourth cannot appear unnoticed,
  // and it caught this one.
  assertEquals(DIALOG.split("mergeDialogShots(").length - 1, 3, "no new full write");
  assertEquals(DIALOG.includes("v525TerminalDialogShots"), false);

  // The evidence goes to `syncso_dispatch_log` instead: durable,
  // append-only, and incapable of overwriting anyone's terminal state.
  const block = DIALOG.indexOf("const v523Block = firstReject.identityHardFail === true;");
  const log = DIALOG.indexOf("await logSyncDispatch(supabase, {", block);
  const ret = DIALOG.indexOf("return json(", block);
  assert(block > 0 && log > block && ret > log, "log → return");
  assert(DIALOG.slice(log, ret).includes("v524: (v153PlateIdentitySnapshot as any)?.plateNative ?? null,"));
  assert(DIALOG.slice(log, ret).includes('error_class: "face_repair_identity_unresolved",'));

  // The record itself is never relabelled as a success, wherever it lands.
  assert(DIALOG.includes("ok: v524Registration?.ok ?? false,"));
  const helper = codeOnly(read("./v524-plate-identity-registration.ts"));
  assert(helper.includes('if (stored.ok !== true) return miss("stored_registration_failed");'));
});

Deno.test("CONTRACT — I/L. reuse and concurrency behaviour are unchanged", () => {
  assert(DIALOG.includes("const v524Reuse = reuseStoredRegistration({"));
  assert(DIALOG.includes("v524Reuse.hit ? [] : v524Frames"));
  // Upload is idempotent on the fenced path, so a duplicate concurrent render
  // overwrites the same object with the same picture.
  assert(DIALOG.includes("upsert: true,"));
});

Deno.test("CONTRACT — frozen: V523, V524 identity, V520/V521/V522/V516", () => {
  const v523 = read("./v523-identity-repair.ts");
  assertEquals(v523.includes("V525"), false, "V523 untouched");
  for (const r of [
    "reference_space_mismatch",
    "identity_unresolved",
    "identity_contested",
    "identity_lock_conflict",
    "identity_lock_ambiguous",
  ]) assert(v523.includes(r), r);
  const rek = read("./resolveIdentityViaRekognition.ts");
  assertEquals(rek.includes("V525"), false);
  assert(rek.includes("const MIN_SIMILARITY = 55;"));
  assert(rek.includes("const BOX_IOU_LINK_MIN = 0.35;"));
  for (const f of [
    "./v520-track-feasibility.ts",
    "./compute-mouth-centered-crop.ts",
    "./pass-face-preclip.ts",
    "./preclip-crop-containment.ts",
    "./v464-asd-projection.ts",
    "./v516-mouth-coherence.ts",
    "./v461-face-gate.ts",
  ]) assertEquals(read(f).includes("V525"), false, f);
  // plate-face-track gained one `export` keyword and a comment, nothing else.
  assert(TRACK.includes("export const TRACK_MIN_IOU = 0.15;"));
  assert(TRACK.includes("export const TRACK_MAX_CENTER_DRIFT = 0.7;"));
  assertEquals(codeOnly(TRACK).split("V525").length - 1, 0, "no executable line mentions V525");
});

Deno.test("CONTRACT — 15. no provider dispatch on an extraction failure", () => {
  // The registration runs in the face gate, which returns 422 with a refund
  // before any canonical box is frozen or any Sync.so call is built.
  const reg = DIALOG.indexOf("const v525Attempts:");
  const gate = DIALOG.indexOf("const gateResults = await Promise.all(");
  const block = DIALOG.indexOf("const v523Block = firstReject.identityHardFail === true;");
  const dispatch = DIALOG.indexOf("v406_canonical_boxes_frozen");
  assert(reg > 0 && gate > reg && block > gate && dispatch > block, "extraction precedes every dispatch");
});
