/**
 * FA-4/P0 — Sync Fan-out: Turn↔Pass-Bindung.
 *
 * Kanonische Invariante:
 *   set(turn_backed_sync_segment.segment_id) == set(dialog_turns.id)
 *
 * NICHT über alle `sync_segment`-Rows: v194-Silent-Stabilizer sind separate,
 * nicht-turn-backed Sync-Jobs mit eigener deterministischer Segmentidentität.
 * Die Klassifikation erfolgt ausschließlich über die bestehende
 * Produktionssemantik (`stabilizer_pass` + `is_silent_stabilizer`) — niemals
 * heuristisch über „segment_id liegt nicht in dialog_turns".
 */

export interface TurnPassCandidate {
  idx?: number;
  segment_id?: string | null;
  stabilizer_pass?: boolean;
  is_silent_stabilizer?: boolean;
  [k: string]: unknown;
}

/** Kanonisches Stabilizer-Predicate (bestehende Produktionssemantik). */
export function isStabilizerPass(pass: unknown): boolean {
  return (pass as any)?.stabilizer_pass === true &&
    (pass as any)?.is_silent_stabilizer === true;
}

export interface TurnPassBindingReport {
  ok: boolean;
  turn_backed_count: number;
  canonical_turns: number;
  null_segment_pass_idx: number[];
  foreign_segment_ids: string[];
  duplicate_segment_ids: string[];
  missing_turn_ids: string[];
  stabilizer_count: number;
  stabilizer_null_pass_idx: number[];
  stabilizer_turn_id_collisions: string[];
}

/**
 * Validiert die Turn↔Pass-Bindung nach vollständigem Pass-Aufbau (inkl.
 * Stabilizer-Injektion) und VOR dem ersten turn-backed Ledger-Acquire.
 */
export function evaluateTurnPassBinding(
  passes: readonly TurnPassCandidate[],
  canonicalTurnIds: readonly string[],
): TurnPassBindingReport {
  const turnBacked = passes.filter((p) => !isStabilizerPass(p));
  const stabilizers = passes.filter((p) => isStabilizerPass(p));
  const canonical = canonicalTurnIds
    .map((id) => String(id ?? "").trim())
    .filter((id) => id.length > 0);
  const canonicalSet = new Set(canonical);

  const seen = new Map<string, number>();
  const nullSegmentPassIdx: number[] = [];
  const foreign: string[] = [];
  for (const p of turnBacked) {
    const sid = typeof p.segment_id === "string" ? p.segment_id.trim() : "";
    if (!sid) {
      nullSegmentPassIdx.push(Number(p.idx ?? -1));
      continue;
    }
    if (!canonicalSet.has(sid)) foreign.push(sid);
    seen.set(sid, (seen.get(sid) ?? 0) + 1);
  }
  const duplicates = [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id);
  const missing = canonical.filter((id) => !seen.has(id));

  const stabilizerNull: number[] = [];
  const stabilizerCollisions: string[] = [];
  for (const p of stabilizers) {
    const sid = typeof p.segment_id === "string" ? p.segment_id.trim() : "";
    if (!sid) {
      stabilizerNull.push(Number(p.idx ?? -1));
      continue;
    }
    if (canonicalSet.has(sid)) stabilizerCollisions.push(sid);
  }

  const ok =
    turnBacked.length === canonical.length &&
    nullSegmentPassIdx.length === 0 &&
    foreign.length === 0 &&
    duplicates.length === 0 &&
    missing.length === 0 &&
    stabilizerNull.length === 0 &&
    stabilizerCollisions.length === 0;

  return {
    ok,
    turn_backed_count: turnBacked.length,
    canonical_turns: canonical.length,
    null_segment_pass_idx: nullSegmentPassIdx,
    foreign_segment_ids: foreign,
    duplicate_segment_ids: duplicates,
    missing_turn_ids: missing,
    stabilizer_count: stabilizers.length,
    stabilizer_null_pass_idx: stabilizerNull,
    stabilizer_turn_id_collisions: stabilizerCollisions,
  };
}
