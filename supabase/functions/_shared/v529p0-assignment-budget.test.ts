/**
 * V529-P0 — FAIL CLOSED ON ASSIGNMENT BUDGET EXHAUSTION.
 *
 * V529 shipped the rectangular solver with a deterministic greedy fallback for
 * the case where the exhaustive search ran past its node budget. The exact
 * handoff audit found that reachable in a supported shape: MAX_SPEAKERS is
 * frozen at 4, `detectFacesOnAnchor` sends no MaxFaces, and from 22 detected
 * faces upward the budget is exceeded. A plate with background people, posters
 * or reflections gets there — and the pre-V529 solver, having no budget at
 * all, was still exact at that shape.
 *
 * A greedy pairing would have become authoritative biometric evidence that
 * nothing downstream could distinguish from a proven one. So an exhausted
 * search now returns no edges at all.
 *
 * These tests derive the boundary from the committed solver rather than from
 * the numbers in the audit.
 */
import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { assignBiometricEdges } from "./resolveIdentityViaRekognition.ts";

/** A matrix whose scores are distinct and high, so a greedy would have found plenty. */
const matrix = (rows: number, cols: number): number[][] =>
  Array.from(
    { length: rows },
    (_, r) => Array.from({ length: cols }, (_, c) => 60 + ((r * 7 + c * 3) % 40)),
  );

/**
 * The node accounting of the committed DFS, replicated so the boundary is
 * derived rather than quoted. One node per dfs() entry; assigned branches
 * first, the skip branch last.
 */
function exactNodeCount(rows: number, cols: number): number {
  let nodes = 0;
  const used = new Array(cols).fill(false);
  const dfs = (r: number) => {
    nodes++;
    if (r === rows) return;
    for (let c = 0; c < cols; c++) {
      if (used[c]) continue;
      used[c] = true;
      dfs(r + 1);
      used[c] = false;
    }
    dfs(r + 1);
  };
  dfs(0);
  return nodes;
}

// ═══ PART 7 — the boundary, derived from the solver itself ═════════

Deno.test("V529-P0 — the real budget boundary, found by asking the solver", () => {
  // Walk outward until the committed solver first refuses. No number is
  // assumed; the solver is the authority on where its own cliff is.
  let lastExact = 0;
  let firstExceeded = 0;
  for (let cols = 1; cols <= 40; cols++) {
    const a = assignBiometricEdges(matrix(4, cols));
    if (a.budgetExceeded) {
      firstExceeded = cols;
      break;
    }
    lastExact = cols;
  }
  assertEquals(lastExact, 21, "4x21 must still complete exactly");
  assertEquals(firstExceeded, 22, "4x22 must be the first refused shape");
  // And the accounting agrees with the constant the module declares.
  assert(exactNodeCount(4, 21) <= 200_000, `4x21 = ${exactNodeCount(4, 21)} nodes`);
  assert(exactNodeCount(4, 22) > 200_000, `4x22 = ${exactNodeCount(4, 22)} nodes`);
  assertEquals(exactNodeCount(4, 21), 187_955);
  assertEquals(exactNodeCount(4, 22), 226_605);
});

Deno.test("V529-P0 — 4x21 still returns the exact assignment", () => {
  const a = assignBiometricEdges(matrix(4, 21));
  assertEquals(a.budgetExceeded, false);
  assertEquals(a.degraded, false);
  assertEquals(a.cardinality, 4);
  assertEquals(a.assign.filter((c) => c === -1).length, 0);
  assertEquals(new Set(a.assign).size, 4, "one face each, no sharing");
  for (const c of a.assign) assert(c >= 0 && c < 21);
});

Deno.test("V529-P0 — 4x22 fails closed with no edges at all", () => {
  const a = assignBiometricEdges(matrix(4, 22));
  assertEquals(a.budgetExceeded, true);
  assertEquals(a.degraded, true);
  assertEquals(a.cardinality, 0);
  assertEquals(a.assign, [-1, -1, -1, -1]);
  assertEquals(a.tied, false);
});

// ═══ PART 8 — large shapes terminate, bounded and fast ═════════════

Deno.test("V529-P0 — large detector shapes terminate without greedy authority", () => {
  for (const cols of [22, 30, 60, 100]) {
    const a = assignBiometricEdges(matrix(4, cols));
    assertEquals(a.budgetExceeded, true, `4x${cols}`);
    assertEquals(a.cardinality, 0, `4x${cols}`);
    assertEquals(a.assign, [-1, -1, -1, -1], `4x${cols}`);
    // The invariant that makes the whole change safe.
    assertEquals(a.assign.some((c) => c >= 0), false, `4x${cols} claimed an edge`);
  }
});

Deno.test("V529-P0 — the refusal is bounded in time, not merely in nodes", () => {
  // 4x100 exhaustively is ~99 million nodes. The budget must cut it short.
  const before = exactNodeCount(4, 12); // cheap warm-up, no timing dependency
  assert(before > 0);
  const a = assignBiometricEdges(matrix(4, 100));
  assertEquals(a.budgetExceeded, true);
  // If the budget were not enforced this call would not have returned.
  assertEquals(a.cardinality, 0);
});

// ═══ PARTS 2 / 11 — no greedy survives anywhere ════════════════════

Deno.test("V529-P0 — budgetExceeded always implies zero assigned edges", () => {
  for (let cols = 1; cols <= 60; cols++) {
    for (let rows = 1; rows <= 4; rows++) {
      const a = assignBiometricEdges(matrix(rows, cols));
      if (!a.budgetExceeded) continue;
      assertEquals(a.cardinality, 0, `${rows}x${cols}`);
      assertEquals(a.assign.every((c) => c === -1), true, `${rows}x${cols}`);
    }
  }
});

Deno.test("V529-P0 — the greedy fallback is gone from the module", async () => {
  const src = await Deno.readTextFile("./supabase/functions/_shared/resolveIdentityViaRekognition.ts");
  // The greedy body and every one of its identifiers are removed.
  for (const marker of ["takenR", "takenC", "gAssign", "edges.sort(", "Deterministic greedy bound"]) {
    assertEquals(src.includes(marker), false, `greedy remnant: ${marker}`);
  }
  // The budget itself is unchanged — the cliff was not merely moved.
  assert(src.includes("const ASSIGN_NODE_BUDGET = 200_000;"), "budget must stay 200_000");
  // And no face-column cap was introduced instead.
  assertEquals(src.includes("MaxFaces"), false, "detector evidence must stay intact");
  assertEquals(/detected\.slice\(0,\s*\d+\)/.test(src), false, "no truncation of detected faces");
});

// ═══ PARTS 3 / 4 / 5 — the resolver's fail-closed shape ════════════

Deno.test("V529-P0 — the resolver refuses without blaming the evidence", async () => {
  const src = await Deno.readTextFile("./supabase/functions/_shared/resolveIdentityViaRekognition.ts");
  // A distinct reason in the diagnostic union, not a free-form string.
  assert(src.includes('| "assignment_budget_exceeded";'), "reason union must be extended");
  assert(src.includes('reason: "assignment_budget_exceeded",'), "result reason");
  assert(src.includes('reason: "assignment_budget_exceeded" as const,'), "per-character reason");
  // The gate runs before any edge is accepted.
  const gate = src.indexOf("if (assignment.budgetExceeded) {");
  const pick = src.indexOf("const pick = assignment.assign;");
  const accept = src.indexOf("faces[col].characterId = c.characterId;");
  assert(gate > 0 && gate < pick && pick < accept, "the refusal must precede every acceptance");
  // It returns the shape every existing resolver failure already returns.
  const gateBlock = src.slice(gate, pick);
  assert(gateBlock.includes("...empty,"), "reuse the established fail-closed shape");
  assert(gateBlock.includes("accepted: false,"));
  assert(gateBlock.includes("acceptedFaceIndex: null,"));
  assert(gateBlock.includes("acceptedSimilarity: null,"));
  // Measured scores are kept; ownership is the only thing withheld.
  assert(gateBlock.includes("bestSimilarity,"));
  assert(gateBlock.includes("bestFaceIndex,"));
  // No assignmentLock is built inside the gate.
  assertEquals(gateBlock.includes("assignmentLock["), false);
});

// ═══ PARTS 14 / 15 / 16 — nothing else moved ═══════════════════════

Deno.test("V529-P0 — V529 diagnostics, thresholds and tie policy are untouched", async () => {
  const src = await Deno.readTextFile("./supabase/functions/_shared/resolveIdentityViaRekognition.ts");
  for (
    const r of [
      '"accepted"',
      '"portrait_load_failed"',
      '"compare_failed"',
      '"no_faces_detected"',
      '"below_threshold"',
      '"ambiguous"',
    ]
  ) {
    assert(src.includes(r), `lost diagnostic reason ${r}`);
  }
  // PART 15 — thresholds frozen.
  assert(src.includes("const MIN_SIMILARITY = 55;"));
  assert(src.includes("const MIN_SIMILARITY_PASS2 = 45;"));
  assert(src.includes("const BOX_IOU_LINK_MIN = 0.35;"));
  // PART 16 — the compatibility-first tie policy stays; `tied` stays visible.
  assert(src.includes("} else if (card === bestCard && sum === bestScore) {"));
  assert(src.includes("tied = true;"));
  // PART 14 — the below-threshold branch still carries its measurements.
  assert(src.includes('? "ambiguous"'));
  assert(src.includes(': "below_threshold"'));
});

// ═══ PART 6 — everything that completed before still completes ═════

Deno.test("V529-P0 — shapes that fit the budget behave exactly as V529 did", () => {
  // The V529 fixtures, re-asserted here so a P0 regression is caught in P0.
  assertEquals(assignBiometricEdges([[12], [8], [71], [30]]).assign, [-1, -1, 0, -1]);
  assertEquals(assignBiometricEdges([[10, 5], [80, 9], [12, 4], [7, 65]]).assign, [-1, 0, -1, 1]);
  assertEquals(
    assignBiometricEdges([[90, 10, 5], [12, 88, 6], [4, 7, 84], [3, 2, 1]]).assign,
    [0, 1, 2, -1],
  );
  assertEquals(
    assignBiometricEdges([[82, 11, 6, 3], [9, 77, 12, 4], [5, 14, 91, 7], [2, 8, 10, 68]]).assign,
    [0, 1, 2, 3],
  );
  // And none of them is flagged as refused.
  for (
    const m of [
      [[12], [8], [71], [30]],
      [[10, 5], [80, 9], [12, 4], [7, 65]],
      [[90, 10, 5], [12, 88, 6], [4, 7, 84], [3, 2, 1]],
      [[82, 11, 6, 3], [9, 77, 12, 4], [5, 14, 91, 7], [2, 8, 10, 68]],
    ]
  ) {
    assertEquals(assignBiometricEdges(m).budgetExceeded, false);
  }
  // The intermediate shapes the audit named, all still exact.
  for (const cols of [12, 18, 20, 21]) {
    const a = assignBiometricEdges(matrix(4, cols));
    assertEquals(a.budgetExceeded, false, `4x${cols}`);
    assertEquals(a.cardinality, 4, `4x${cols}`);
  }
});

// ═══ PART 12 — the shape both consumers already handle ═════════════

Deno.test("V529-P0 — a refused resolve is shape-identical to existing failures", async () => {
  const src = await Deno.readTextFile("./supabase/functions/_shared/resolveIdentityViaRekognition.ts");
  // `empty` is what aws_credentials_missing, anchor_fetch_failed, detect_failed
  // and detect_zero_faces already return, and it is what the budget gate
  // returns too: ok:false, faces: [], assignmentLock: {}, resolvedCount: 0.
  const emptyDecl = src.slice(src.indexOf("const empty: RekognitionIdentityResult = {"));
  assert(emptyDecl.includes("ok: false,"));
  assert(emptyDecl.includes("faces: [],"));
  assert(emptyDecl.includes("assignmentLock: {},"));
  assert(emptyDecl.includes("resolvedCount: 0,"));
  // compose-video-clips reads assignmentLock, ok, reason, resolvedCount,
  // expectedCount, minSimilarity and msTotal — all present on `empty`.
  const clips = await Deno.readTextFile("./supabase/functions/compose-video-clips/index.ts");
  assertEquals(clips.includes("idResolved.faces"), false, "no face-array assumption");
  assertEquals(clips.includes("reResolved.faces"), false, "no face-array assumption");
});
