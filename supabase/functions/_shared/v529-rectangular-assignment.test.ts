/**
 * V529 — RECTANGULAR BIOMETRIC ASSIGNMENT + UNRESOLVED IDENTITY DIAGNOSTICS.
 *
 * Generation 27, frame 428: four characters, ONE detected face. The old
 * brute-permutation Hungarian could never reach `r === rows`, so `bestPick`
 * stayed null and the fallback returned the identity map [0,1,2,3]. Columns
 * 1..3 do not exist; `matrix[i][col]` was `undefined ?? 0`, and three
 * characters were refused as though they had scored zero. The one real face
 * went to character 0 by index rather than by evidence.
 *
 * Sarah and Kay were unresolved on all three sampled frames, and nothing
 * persisted could separate a portrait that never loaded from a CompareFaces
 * call that failed from a face that was never detected from a genuinely low
 * score. Those four need different fixes.
 *
 * These tests pin the assignment contract and the diagnostic vocabulary. No
 * threshold moves.
 */
import { assert, assertEquals, assertNotEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { assignBiometricEdges } from "./resolveIdentityViaRekognition.ts";
import {
  registerPlateNativeIdentities,
  type AttemptCharacterDiagnostic,
} from "./v524-plate-identity-registration.ts";

// ── the pre-V529 algorithm, kept verbatim as the compatibility oracle ──
function legacyOptimalAssignment(matrix: number[][]): number[] {
  const rows = matrix.length;
  if (rows === 0) return [];
  const cols = matrix[0]?.length ?? 0;
  const pick = new Array(rows).fill(-1);
  let bestPick: number[] | null = null;
  let bestScore = -Infinity;
  const used = new Array(cols).fill(false);
  const dfs = (r: number, sum: number) => {
    if (r === rows) {
      if (sum > bestScore) {
        bestScore = sum;
        bestPick = pick.slice();
      }
      return;
    }
    for (let c = 0; c < cols; c++) {
      if (used[c]) continue;
      used[c] = true;
      pick[r] = c;
      dfs(r + 1, sum + (matrix[r][c] ?? 0));
      used[c] = false;
    }
  };
  dfs(0, 0);
  return bestPick ?? pick.map((_, i) => i);
}

/** Deterministic pseudo-random, so a failure is always reproducible. */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

// ═══ PART 2 / 7 / 18 — rectangular assignment ═══════════════════════

Deno.test("V529 — Gen27 4x1: one face, one character, no fabricated columns", () => {
  // Character 2 is the only one the single detected face actually resembles.
  const m = [[12], [8], [71], [30]];
  const a = assignBiometricEdges(m);
  assertEquals(a.cardinality, 1);
  assertEquals(a.assign, [-1, -1, 0, -1]);
  // Every index is either -1 or a real column.
  for (const c of a.assign) assert(c === -1 || (c >= 0 && c < 1), `column ${c} out of range`);
  assertEquals(a.degraded, false);
  // The old code would have produced [0,1,2,3] — three non-existent columns.
  assertEquals(legacyOptimalAssignment(m), [0, 1, 2, 3]);
  assertNotEquals(a.assign, legacyOptimalAssignment(m));
});

Deno.test("V529 — 4x2: the two strongest compatible edges win", () => {
  //          face0  face1
  const m = [
    [10, 5], // char0
    [80, 9], // char1  ← face0
    [12, 4], // char2
    [7, 65], // char3  ← face1
  ];
  const a = assignBiometricEdges(m);
  assertEquals(a.cardinality, 2);
  assertEquals(a.assign, [-1, 0, -1, 1]);
});

Deno.test("V529 — 4x3: three one-to-one edges, deterministic", () => {
  const m = [
    [90, 10, 5],
    [12, 88, 6],
    [4, 7, 84],
    [3, 2, 1],
  ];
  const a = assignBiometricEdges(m);
  assertEquals(a.cardinality, 3);
  assertEquals(a.assign, [0, 1, 2, -1]);
});

Deno.test("V529 — 5x3 generic rectangular control", () => {
  const m = [
    [70, 1, 2],
    [3, 66, 4],
    [5, 6, 62],
    [1, 1, 1],
    [2, 2, 2],
  ];
  const a = assignBiometricEdges(m);
  assertEquals(a.cardinality, 3);
  assertEquals(a.assign, [0, 1, 2, -1, -1]);
});

Deno.test("V529 — no face is assigned twice and no character owns two faces", () => {
  const rnd = lcg(20260901);
  for (let trial = 0; trial < 200; trial++) {
    const rows = 1 + Math.floor(rnd() * 5);
    const cols = 1 + Math.floor(rnd() * 5);
    const m = Array.from(
      { length: rows },
      () => Array.from({ length: cols }, () => Math.floor(rnd() * 100)),
    );
    const a = assignBiometricEdges(m);
    const seenCols = new Set<number>();
    let card = 0;
    a.assign.forEach((c, r) => {
      assert(c === -1 || (c >= 0 && c < cols), `row ${r} → column ${c} of ${cols}`);
      if (c === -1) return;
      assert(!seenCols.has(c), `face ${c} assigned twice`);
      seenCols.add(c);
      card++;
    });
    assertEquals(a.assign.length, rows, "one entry per character, never more");
    assertEquals(card, a.cardinality);
    // Maximum cardinality is the smaller side. The search must reach it.
    assertEquals(a.cardinality, Math.min(rows, cols));
  }
});

Deno.test("V529 — the strongest evidence beats character order", () => {
  // Character 3 is the best match for the only face; index order would hand
  // it to character 0, which is exactly the Gen27 defect.
  const m = [[40], [41], [42], [95]];
  const a = assignBiometricEdges(m);
  assertEquals(a.assign, [-1, -1, -1, 0]);
  assertEquals(a.cardinality, 1);
});

// ═══ PART 5 — complete matrices must not move ═══════════════════════

Deno.test("V529 — cols >= rows reproduces the pre-V529 result exactly", () => {
  const rnd = lcg(4711);
  for (let trial = 0; trial < 400; trial++) {
    const rows = 1 + Math.floor(rnd() * 5);
    const cols = rows + Math.floor(rnd() * 3); // always >= rows
    const m = Array.from(
      { length: rows },
      () => Array.from({ length: cols }, () => Math.floor(rnd() * 100)),
    );
    assertEquals(
      assignBiometricEdges(m).assign,
      legacyOptimalAssignment(m),
      `rows=${rows} cols=${cols} ${JSON.stringify(m)}`,
    );
  }
});

Deno.test("V529 — the historical 4x4 fixture is untouched", () => {
  const m = [
    [82, 11, 6, 3],
    [9, 77, 12, 4],
    [5, 14, 91, 7],
    [2, 8, 10, 68],
  ];
  assertEquals(assignBiometricEdges(m).assign, [0, 1, 2, 3]);
  assertEquals(assignBiometricEdges(m).assign, legacyOptimalAssignment(m));
  assertEquals(assignBiometricEdges(m).cardinality, 4);
  assertEquals(assignBiometricEdges(m).degraded, false);
});

Deno.test("V529 — degenerate shapes are answered, not crashed", () => {
  assertEquals(assignBiometricEdges([]).assign, []);
  assertEquals(assignBiometricEdges([[], [], []]).assign, [-1, -1, -1]);
  assertEquals(assignBiometricEdges([[], [], []]).cardinality, 0);
  // An all-zero row is still a row: it may be assigned, but it carries no
  // evidence, and the threshold — not the assignment — decides that.
  const z = assignBiometricEdges([[0, 0], [0, 0]]);
  assertEquals(z.cardinality, 2);
});

// ═══ PARTS 6 / 10-16 — diagnostics and record authority ════════════

const CHARS = [
  { characterId: "sarah", portraitUrl: "https://p/sarah.jpg", speakerIdx: 0 },
  { characterId: "matthew", portraitUrl: "https://p/matthew.jpg", speakerIdx: 1 },
  { characterId: "samuel", portraitUrl: "https://p/samuel.jpg", speakerIdx: 2 },
  { characterId: "kay", portraitUrl: "https://p/kay.jpg", speakerIdx: 3 },
];
const PLATE = { width: 656, height: 1406 };

const diag = (
  characterId: string,
  over: Partial<AttemptCharacterDiagnostic> = {},
): AttemptCharacterDiagnostic => ({
  characterId,
  portraitLoaded: true,
  compareAttempted: true,
  compareOk: true,
  bestSimilarity: null,
  bestFaceIndex: null,
  accepted: false,
  acceptedFaceIndex: null,
  acceptedSimilarity: null,
  reason: "below_threshold",
  ...over,
});

function register(opts: {
  faces: Array<{ characterId: string | null; bbox: [number, number, number, number]; similarity: number | null }>;
  diagnostics?: AttemptCharacterDiagnostic[];
  ok?: boolean;
  reason?: string | null;
}) {
  return registerPlateNativeIdentities({
    sceneId: "67b392b1",
    runId: "05661f33",
    plateGeneration: 27,
    baseVideoUrl: "https://cdn/gen-27/base.mp4",
    plateDims: PLATE,
    frameNumber: 428,
    registeredAt: "2026-09-01T00:00:00.000Z",
    characters: CHARS,
    extractFrame: async () => ({ ok: true, frameUrl: "https://cdn/still.jpeg", reason: null }),
    detectIdentities: async () => ({
      ok: opts.ok ?? true,
      dims: PLATE,
      faces: opts.faces,
      resolvedCount: opts.faces.filter((f) => f.characterId).length,
      reason: opts.reason ?? null,
      characterDiagnostics: opts.diagnostics,
    }),
  } as never);
}

Deno.test("V529 — Gen27 frame 428: one detected face, one record, three diagnosed", async () => {
  const r = await register({
    faces: [{ characterId: "samuel", bbox: [100, 200, 180, 300], similarity: 74 }],
    diagnostics: [
      diag("sarah", { bestSimilarity: 31, bestFaceIndex: 0, reason: "below_threshold" }),
      diag("matthew", { bestSimilarity: 22, bestFaceIndex: 0, reason: "below_threshold" }),
      diag("samuel", { accepted: true, acceptedFaceIndex: 0, acceptedSimilarity: 74, bestSimilarity: 74, bestFaceIndex: 0, reason: "accepted" }),
      diag("kay", { bestSimilarity: 18, bestFaceIndex: 0, reason: "below_threshold" }),
    ],
  });
  // PART 16 — the historical failure invariant is untouched.
  assertEquals(r.ok, false);
  assertEquals(r.records, []);
  assertEquals(r.reason, "incomplete_registration");
  // PART 6 — exactly the accepted biometric edge, nothing positional.
  assertEquals(r.partialRecords?.length, 1);
  assertEquals(r.partialRecords?.[0].characterId, "samuel");
  assertEquals(r.partialRecords?.[0].identityEvidence, "aws_rekognition_compare_faces");
  assertEquals(r.partialRecords?.[0].source, "plate_native");
  assertEquals(r.partialRecords?.[0].similarity, 74);
  // PART 11 — the detector count and the unresolved set survive.
  assertEquals(r.diagnostics.detected, 1);
  assertEquals(r.diagnostics.requested, 4);
  assertEquals(r.diagnostics.resolved, 1);
  assertEquals(r.unresolved, ["sarah", "matthew", "kay"]);
  assertEquals(r.characterDiagnostics?.length, 4);
});

Deno.test("V529 — portrait load failure is not reported as a low score", async () => {
  const r = await register({
    faces: [{ characterId: "matthew", bbox: [10, 20, 90, 120], similarity: 80 }],
    diagnostics: [
      diag("sarah", { portraitLoaded: false, compareAttempted: false, compareOk: false, reason: "portrait_load_failed" }),
      diag("matthew", { accepted: true, acceptedFaceIndex: 0, acceptedSimilarity: 80, reason: "accepted" }),
      diag("samuel", { compareOk: false, reason: "compare_failed" }),
      diag("kay", { bestSimilarity: 41, bestFaceIndex: 0, reason: "below_threshold" }),
    ],
  });
  const by = new Map(r.characterDiagnostics!.map((d) => [d.characterId, d]));
  assertEquals(by.get("sarah")!.reason, "portrait_load_failed");
  assertEquals(by.get("sarah")!.portraitLoaded, false);
  assertNotEquals(by.get("sarah")!.reason, "below_threshold");
  assertEquals(by.get("samuel")!.reason, "compare_failed");
  assertEquals(by.get("samuel")!.compareAttempted, true);
  assertEquals(by.get("samuel")!.compareOk, false);
  // PART 14 — the number future seed discovery actually needs.
  assertEquals(by.get("kay")!.reason, "below_threshold");
  assertEquals(by.get("kay")!.bestSimilarity, 41);
  assertEquals(by.get("kay")!.bestFaceIndex, 0);
  assertEquals(by.get("matthew")!.acceptedSimilarity, 80);
});

Deno.test("V529 — a below-threshold edge never becomes a partial record", async () => {
  // The detector reports a face it could not name. V524 must not adopt it.
  const r = await register({
    faces: [
      { characterId: null, bbox: [10, 20, 90, 120], similarity: null },
      { characterId: null, bbox: [200, 20, 280, 120], similarity: null },
    ],
    diagnostics: CHARS.map((c) => diag(c.characterId, { bestSimilarity: 44, bestFaceIndex: 0 })),
  });
  assertEquals(r.ok, false);
  assertEquals(r.records, []);
  assertEquals(r.partialRecords ?? [], []);
  // Two faces were seen and neither could be named: that is its own class,
  // earlier than incomplete_registration, and it now carries the same rows.
  assertEquals(r.reason, "no_identity_evidence");
  assertEquals(r.unresolved, ["sarah", "matthew", "samuel", "kay"]);
  assertEquals(r.characterDiagnostics?.length, 4);
  assertEquals(r.diagnostics.detected, 2);
});

Deno.test("V529 — a failed detector reports every character, still records=[]", async () => {
  const r = await register({ faces: [], ok: false, reason: "detect_zero_faces" });
  assertEquals(r.ok, false);
  assertEquals(r.records, []);
  assertEquals(r.reason, "identity_detect_failed");
  assertEquals(r.unresolved, ["sarah", "matthew", "samuel", "kay"]);
  assertEquals(r.diagnostics.detected, 0);
});

Deno.test("V529 — a complete frame still succeeds unchanged", async () => {
  const r = await register({
    faces: CHARS.map((c, i) => ({
      characterId: c.characterId,
      bbox: [10 + i * 100, 20, 90 + i * 100, 120] as [number, number, number, number],
      similarity: 70 + i,
    })),
    diagnostics: CHARS.map((c, i) =>
      diag(c.characterId, { accepted: true, acceptedFaceIndex: i, acceptedSimilarity: 70 + i, reason: "accepted" })
    ),
  });
  assertEquals(r.ok, true);
  assertEquals(r.records.length, 4);
  assertEquals(r.unresolved, []);
  assertEquals(r.partialRecords, undefined);
  for (const rec of r.records) {
    assertEquals(rec.identityEvidence, "aws_rekognition_compare_faces");
    assertEquals(rec.source, "plate_native");
  }
});

// ═══ PARTS 3 / 12-15 / 20 — source contracts the unit tests cannot reach ══

Deno.test("V529 — the resolver's reason ordering and thresholds, from source", async () => {
  const src = await Deno.readTextFile("./supabase/functions/_shared/resolveIdentityViaRekognition.ts");
  // PART 20 — no threshold moved.
  assert(src.includes("const MIN_SIMILARITY = 55;"), "pass-1 threshold frozen");
  assert(src.includes("const MIN_SIMILARITY_PASS2 = 45;"), "pass-2 threshold frozen");
  assert(src.includes("const BOX_IOU_LINK_MIN = 0.35;"), "IoU link floor frozen");
  // PART 3 — acceptance is still the same two guarded comparisons.
  assert(src.includes("if (sim < MIN_SIMILARITY) { unresolvedIdx.push(i); return; }"));
  assert(src.includes("if (sim >= MIN_SIMILARITY_PASS2 && sim < MIN_SIMILARITY) {"));
  // PART 12/13/14 — a load failure and a call failure outrank "low score".
  const accepted = src.indexOf('? "accepted"');
  const portrait = src.indexOf('? "portrait_load_failed"');
  const compare = src.indexOf('? "compare_failed"');
  const ambiguous = src.indexOf('? "ambiguous"');
  const below = src.indexOf(': "below_threshold"');
  assert(accepted > 0 && portrait > accepted && compare > portrait && ambiguous > compare && below > ambiguous,
    "reason ladder must be accepted → portrait → compare → ambiguous → below_threshold");
  // PART 15 — zero detections answer per character instead of guessing.
  assert(src.includes('reason: "no_faces_detected" as const,'));
  // PART 2 — the degenerate fallback is gone.
  assertEquals(src.includes("bestPick ?? pick.map((_, i) => i)"), false);
  assertEquals(src.includes("function optimalAssignment("), false);
  // PART 10 — no score row and no bytes are retained.
  assertEquals(src.includes("scoreMatrix," ), false);
});

Deno.test("V529 — V526-B still consumes only accepted biometric edges", async () => {
  const v526b = await import("./v526b-common-frame-identity.ts");
  for (const fn of ["planCommonFrameCompletion", "buildStepFrames", "completeCommonFrameCohort"]) {
    assertEquals(typeof (v526b as any)[fn], "function");
  }
  const v524src = await Deno.readTextFile("./supabase/functions/_shared/v524-plate-identity-registration.ts");
  // Records are still built in exactly one place, from `byChar` hits only.
  assertEquals(v524src.split("identityEvidence: \"aws_rekognition_compare_faces\"").length - 1, 1);
  assert(v524src.includes("const hit = byChar.get(cid);"));
  assert(v524src.includes("if (!hit) {"));
  // And the incomplete contract is untouched.
  assert(v524src.includes("    records: [],"));
  assert(v524src.includes("      partialRecords: records,"));
});
