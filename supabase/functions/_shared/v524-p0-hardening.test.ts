/**
 * V524-P0 — RELEASE HARDENING
 *
 * Two gates, and nothing else.
 *
 * P0-A  `resolveIdentityViaRekognition.ts` carried two pre-existing
 *       `Uint8Array<ArrayBufferLike>` → `BufferSource` variance errors. They
 *       are caller-independent and older than V524; they only became visible
 *       when `compose-dialog-segments` began importing the module directly,
 *       taking its isolated typecheck from 36 to 38. The fix is the same
 *       compile-only helper `plateFaceSlotRouter.ts` already ships. These
 *       tests execute real WebCrypto and prove the bytes are unchanged.
 *
 * P0-B  Plate-native registration costs a frame extract, a DetectFaces and one
 *       CompareFaces per character. The face gate runs on every non-advance
 *       invocation — the initial dispatch and every retry — so the same
 *       picture was being re-measured. A stored registration is now reused
 *       when, and only when, it belongs to this exact scene, run, generation,
 *       base video and raster.
 *
 *   PURE     — executes the crypto and the reuse decision.
 *   CONTRACT — asserts wiring no unit test can reach.
 */

import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  isPlateNativeRegistrationFresh,
  reuseStoredRegistration,
  type PlateNativeFence,
  type PlateNativeIdentityRecord,
} from "./v524-plate-identity-registration.ts";

// ═══ P0-A — the signing bytes are unchanged ══════════════════════════════
//
// `asBufferSource` copies into a fresh, definitely-non-shared buffer. The
// only way that could matter to SigV4 is if the copy changed the bytes, so
// the test runs both spellings through real WebCrypto and compares.

function asBufferSource(bytes: Uint8Array): BufferSource {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy as unknown as BufferSource;
}

const hex = (buf: ArrayBuffer) =>
  Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");

/** The digest as it was written before P0. */
const sha256HexBefore = async (data: Uint8Array | string) => {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  // deno-lint-ignore no-explicit-any
  return hex(await crypto.subtle.digest("SHA-256", bytes as any));
};
/** The digest as it is written after P0. */
const sha256HexAfter = async (data: Uint8Array | string) => {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  return hex(await crypto.subtle.digest("SHA-256", asBufferSource(bytes)));
};

/** The HMAC key material as it was passed before P0. */
const hmacBefore = async (key: ArrayBuffer | Uint8Array, data: string) => {
  const k = await crypto.subtle.importKey(
    "raw",
    // deno-lint-ignore no-explicit-any
    (key instanceof Uint8Array ? key : new Uint8Array(key)) as any,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(data));
};
/** …and after. */
const hmacAfter = async (key: ArrayBuffer | Uint8Array, data: string) => {
  const k = await crypto.subtle.importKey(
    "raw",
    key instanceof Uint8Array ? asBufferSource(key) : key as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(data));
};

const signingKey = async (
  hmacFn: typeof hmacBefore,
  secret: string,
  dateStamp: string,
  region: string,
  service: string,
) => {
  const kDate = await hmacFn(new TextEncoder().encode("AWS4" + secret), dateStamp);
  const kRegion = await hmacFn(kDate, region);
  const kService = await hmacFn(kRegion, service);
  return await hmacFn(kService, "aws4_request");
};

Deno.test("PURE — P0-A. the SHA-256 input is byte-identical", async () => {
  const cases: Array<Uint8Array | string> = [
    "",
    "{}",
    JSON.stringify({ Image: { S3Object: null }, Attributes: ["DEFAULT"] }),
    new Uint8Array([]),
    new Uint8Array([0, 1, 2, 253, 254, 255]),
    new TextEncoder().encode("AWS4wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY"),
  ];
  for (const c of cases) {
    assertEquals(await sha256HexAfter(c), await sha256HexBefore(c), String(c).slice(0, 24));
  }
});

Deno.test("PURE — P0-A. the HMAC key material is byte-identical", async () => {
  const enc = new TextEncoder();
  const keys: Array<Uint8Array | ArrayBuffer> = [
    enc.encode("AWS4secret"),
    new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
    // A zero-length key is rejected by WebCrypto in BOTH spellings and is
    // never a SigV4 input (the key is always AWS4 + secret), so it proves
    // nothing about the change and is left out.
    new Uint8Array([255, 0, 128]).buffer,
    enc.encode("AWS4wJalrXUtnFEMI/K7MDENG").buffer,
  ];
  for (const k of keys) {
    assertEquals(hex(await hmacAfter(k, "20260828")), hex(await hmacBefore(k, "20260828")));
  }
});

Deno.test("PURE — P0-A. the full SigV4 signing key is byte-identical", async () => {
  const before = await signingKey(hmacBefore, "wJalrXUtnFEMI/K7MDENG", "20260828", "us-east-1", "rekognition");
  const after = await signingKey(hmacAfter, "wJalrXUtnFEMI/K7MDENG", "20260828", "us-east-1", "rekognition");
  assertEquals(hex(after), hex(before));

  // …and so is the signature over a canonical string built from it.
  const sigBefore = hex(await hmacBefore(before, "AWS4-HMAC-SHA256\n20260828T000000Z\nscope\nhash"));
  const sigAfter = hex(await hmacAfter(after, "AWS4-HMAC-SHA256\n20260828T000000Z\nscope\nhash"));
  assertEquals(sigAfter, sigBefore);
});

Deno.test("PURE — P0-A. asBufferSource copies, and never aliases", () => {
  const src = new Uint8Array([1, 2, 3]);
  const out = asBufferSource(src) as unknown as Uint8Array;
  assertEquals(Array.from(out), [1, 2, 3]);
  src[0] = 99;
  assertEquals(out[0], 1, "a later mutation of the source cannot reach the copy");
});

// ═══ P0-B — run-scoped registration reuse ════════════════════════════════
const SARAH = "5c81f9bf-a5f1-4608-849f-e2a4adc84bcb";
const SAMUEL = "a1111111-0000-0000-0000-000000000001";
const MATTHEW = "b2222222-0000-0000-0000-000000000002";
const KAY = "c3333333-0000-0000-0000-000000000003";
const CAST = [SARAH, SAMUEL, MATTHEW, KAY];

const SCENE = "67b392b1-aca1-489d-b773-d604deb22623";
const RUN = "33480f14-cbdf-4a33-ad23-c2fa502b3c20";
const GEN = 20;
const BASE_URL = "https://example.test/composer/67b392b1/gen-20/base.mp4";
const PLATE = { width: 720, height: 1280 };
const FENCE: PlateNativeFence = {
  sceneId: SCENE,
  runId: RUN,
  plateGeneration: GEN,
  baseVideoUrl: BASE_URL,
  plateDims: PLATE,
};

const rec = (characterId: string, i: number): PlateNativeIdentityRecord => ({
  characterId,
  bbox: [10 + i * 100, 200, 90 + i * 100, 320],
  frameNumber: 60,
  plateDims: PLATE,
  source: "plate_native",
  identityEvidence: "aws_rekognition_compare_faces",
  similarity: 96 + i,
  baseVideoUrl: BASE_URL,
  sceneId: SCENE,
  runId: RUN,
  plateGeneration: GEN,
  registeredAt: "2026-08-28T00:00:00.000Z",
});

const STORED = { ok: true, frame_number: 60, records: CAST.map(rec) };

Deno.test("PURE — 1. the first dispatch has nothing stored and must register", () => {
  for (const stored of [null, undefined, {}, { ok: true, records: [] }]) {
    const r = reuseStoredRegistration({ stored: stored as never, characterIds: CAST, fence: FENCE });
    assertEquals(r.hit, false);
    assertEquals(r.miss, "no_stored_registration");
    assertEquals(r.records.length, 0);
  }
});

Deno.test("PURE — 2/3. the same run, generation and base video reuses everything", () => {
  // Six passes of one scene ask the same question six times; after the first
  // answer there is nothing left to measure.
  for (let pass = 0; pass < 6; pass++) {
    const r = reuseStoredRegistration({ stored: STORED, characterIds: CAST, fence: FENCE });
    assertEquals(r.hit, true, `pass ${pass}`);
    assertEquals(r.miss, null);
    assertEquals(r.records.length, 4);
    assertEquals(r.frameNumber, 60);
    assertEquals(r.records.map((x) => x.characterId), CAST, "cast order, not detector order");
  }
});

Deno.test("PURE — 4/5/6. a different run, generation or video is not this plate", () => {
  const cases: Array<[string, PlateNativeFence]> = [
    ["run", { ...FENCE, runId: "99999999-0000-0000-0000-000000000000" }],
    ["generation", { ...FENCE, plateGeneration: 21 }],
    ["base video", { ...FENCE, baseVideoUrl: BASE_URL.replace("gen-20", "gen-21") }],
    ["scene", { ...FENCE, sceneId: "00000000-0000-0000-0000-000000000000" }],
    ["raster", { ...FENCE, plateDims: { width: 1080, height: 1920 } }],
  ];
  for (const [name, fence] of cases) {
    const r = reuseStoredRegistration({ stored: STORED, characterIds: CAST, fence });
    assertEquals(r.hit, false, name);
    assertEquals(r.miss, "stored_registration_stale", name);
    assertEquals(r.records.length, 0, name);
  }
});

Deno.test("PURE — 7. an incomplete registration is never a cache hit", () => {
  // Sarah is missing from the stored set — the exact shape of a run that
  // could not place her.
  const partial = { ok: true, frame_number: 60, records: STORED.records.filter((r) => r.characterId !== SARAH) };
  const r = reuseStoredRegistration({ stored: partial, characterIds: CAST, fence: FENCE });
  assertEquals(r.hit, false);
  assertEquals(r.miss, "stored_registration_incomplete");

  // A stored attempt that FAILED is likewise never an answer.
  const failed = { ok: false, frame_number: 60, records: STORED.records };
  const rf = reuseStoredRegistration({ stored: failed, characterIds: CAST, fence: FENCE });
  assertEquals(rf.hit, false);
  assertEquals(rf.miss, "stored_registration_failed");
});

Deno.test("PURE — 8. an ambiguous stored set is not a cache hit", () => {
  // Two records claiming Sarah. `findPlateNativeRecord` refuses to pick one,
  // so the whole reuse refuses too.
  const ambiguous = {
    ok: true,
    frame_number: 60,
    records: [...STORED.records, { ...rec(SARAH, 7), bbox: [500, 900, 600, 1020] as [number, number, number, number] }],
  };
  const r = reuseStoredRegistration({ stored: ambiguous, characterIds: CAST, fence: FENCE });
  assertEquals(r.hit, false);
  assertEquals(r.miss, "stored_registration_stale");
});

Deno.test("PURE — a record missing its provenance is never fresh", () => {
  assertEquals(isPlateNativeRegistrationFresh(null, FENCE), false);
  assertEquals(isPlateNativeRegistrationFresh({ characterId: SARAH }, FENCE), false);
  assertEquals(
    isPlateNativeRegistrationFresh({ ...rec(SARAH, 0), source: undefined as never }, FENCE),
    false,
  );
  assertEquals(
    isPlateNativeRegistrationFresh({ ...rec(SARAH, 0), plateDims: { width: 1080, height: 1920 } }, FENCE),
    false,
    "a different raster is a different measurement",
  );
  assertEquals(isPlateNativeRegistrationFresh(rec(SARAH, 0), FENCE), true);
});

Deno.test("PURE — a run without an id does not become a wildcard", () => {
  // When the current dispatch has no run id the run fence cannot be checked,
  // but every other fence still binds.
  const noRun: PlateNativeFence = { ...FENCE, runId: null };
  assertEquals(isPlateNativeRegistrationFresh(rec(SARAH, 0), noRun), true);
  assertEquals(
    isPlateNativeRegistrationFresh({ ...rec(SARAH, 0), plateGeneration: 19 }, noRun),
    false,
  );
});

// ═══ CONTRACT — wiring ═══════════════════════════════════════════════════
const read = (rel: string) => Deno.readTextFileSync(new URL(rel, import.meta.url));
const codeOnly = (src: string) =>
  src.split(/\r?\n/).map((l) => {
    const t = l.trim();
    return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") ? "" : l;
  }).join("\n");

const DIALOG = codeOnly(read("../compose-dialog-segments/index.ts"));
const REK = read("./resolveIdentityViaRekognition.ts");
const ROUTER = read("./plateFaceSlotRouter.ts");

Deno.test("CONTRACT — P0-A. the helper is the router's, verbatim", () => {
  const shape = [
    "function asBufferSource(bytes: Uint8Array): BufferSource {",
    "  const copy = new Uint8Array(bytes.byteLength);",
    "  copy.set(bytes);",
    "  return copy as unknown as BufferSource;",
    "}",
  ].join("\n");
  const nl = (s: string) => s.split(/\r?\n/).join("\n");
  assert(nl(ROUTER).includes(shape), "the production original");
  assert(nl(REK).includes(shape), "and the copy");
});

Deno.test("CONTRACT — P0-A. the AWS surface is untouched", () => {
  // Endpoint, algorithm, thresholds and request shape all survive verbatim.
  for (const needle of [
    "AWS4-HMAC-SHA256",
    "aws4_request",
    "const MIN_SIMILARITY_PASS2 = 45;",
    "const BOX_IOU_LINK_MIN = 0.35;",
  ]) assert(REK.includes(needle), needle);
  // The only two call sites that changed are the crypto boundaries.
  assertEquals(REK.split("asBufferSource(").length - 1, 3, "definition + digest + importKey");
  assertEquals(REK.includes('crypto.subtle.digest("SHA-256", bytes)'), false, "old spelling gone");
});

Deno.test("CONTRACT — P0-B. reuse is checked before any network work", () => {
  const reuse = DIALOG.indexOf("const v524Reuse = reuseStoredRegistration({");
  const loop = DIALOG.indexOf("for (const frame of v524Reuse.hit ? [] : v524Frames) {");
  // V530 — the extractor DEFINITION now sits above this block so the face
  // gate can reach the same source-fenced cache. A definition performs no
  // work, so the invariant is anchored on the registration's own
  // INVOCATION of it, which is what the reuse decision actually guards.
  const acquire = DIALOG.indexOf("const r = await v525Acquire(i.frameNumber);");
  const rek = DIALOG.indexOf("const r = await resolveIdentityViaRekognition({");
  assert(reuse > 0 && loop > reuse, "the decision precedes the loop");
  assert(acquire > loop && rek > loop, "and both provider calls sit inside it");
  // A hit iterates an empty list: no extract, no DetectFaces, no CompareFaces.
  assert(DIALOG.includes("v524Reuse.hit ? [] : v524Frames"));
  // And the hoisted definition really is inert: it builds a closure and
  // reads env, nothing more.
  const def = DIALOG.slice(
    DIALOG.indexOf("const v525RenderStill = (() => {"),
    DIALOG.indexOf("const v525Acquire = async (frameNumber: number)"),
  );
  assertEquals(def.includes("await "), false, "the renderer probe awaits nothing");
});

Deno.test("CONTRACT — P0-B. the reuse key is the full fence", () => {
  assert(DIALOG.includes("const v524Fence: PlateNativeFence = {"));
  for (const k of [
    "sceneId,",
    "runId: v510RunId,",
    "plateGeneration: v524PlateGeneration,",
    'baseVideoUrl: String(v524BaseVideoUrl ?? ""),',
    "plateDims: plateDims ?? { width: 0, height: 0 },",
  ]) assert(DIALOG.includes(k), k);
  assert(DIALOG.includes("fence: v524Fence,"));
  // The stored set comes from the persisted plate identity, not from memory.
  assert(DIALOG.includes("const v524Stored = (persistedPlateIdentity as any)?.plateNative ?? null;"));
});

Deno.test("CONTRACT — P0-B. a reused set is written back, and says so", () => {
  assert(DIALOG.includes('registration_source: v524Reuse.hit ? "reused" : "registered",'));
  assert(DIALOG.includes("reuse_miss: v524Reuse.miss ?? null,"));
  // The gate itself still runs once per non-advance invocation, ahead of the
  // per-pass work.
  const reg = DIALOG.indexOf("const v524Frames =");
  const gate = DIALOG.indexOf("const gateResults = await Promise.all(");
  assert(reg > 0 && gate > reg);
});
