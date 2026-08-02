/**
 * v387 — Kanonischer Assignment-Lock.
 *
 * Der Assignment-Lock bildet `speakerIdx → characterId` ab. Er wurde an
 * mehreren Stellen erzeugt (Rekognition-Seed, Geometrie-Lock, Plate-Identity)
 * und beim Dispatch nur noch gemerged. Dadurch konnten Slots aus einem
 * FRÜHEREN Lauf überleben: eine Szene mit 4 Sprechern lief mit
 * `locked_slots=5/4` in den Injektivitätstest und schlug mit
 * `lipsync_identity_collision` fehl, obwohl alle vier Sprecher
 * unterschiedliche Charaktere waren.
 *
 * Wahrheit für die Identität eines Sprechers sind die `dialog_turns` der
 * aktuellen Szene. Der Lock wird deshalb pro Lauf aus der aktuellen
 * Sprecherliste neu gebaut; ein persistierter Lock darf nur noch Lücken
 * füllen. Slots ausserhalb von `0..N-1` existieren nicht.
 */

export interface AssignmentLockResult {
  /** Kanonischer Lock, ausschliesslich Slots `0..N-1`. */
  lock: Record<string, string>;
  /** Slots, die aus dem persistierten Lock verworfen wurden (stale). */
  droppedSlots: string[];
  /**
   * Echte Kollision: zwei AKTUELLE Sprecher zeigen auf denselben Charakter.
   * Nur das darf die Szene terminal scheitern lassen.
   */
  duplicateCharacterIds: string[];
  /** Slots ohne auflösbare characterId. */
  unresolvedSlots: string[];
}

/** Varianten-Präfixe (Outfit/Pose/Wardrobe/Vibe/Prop/Look) entfernen. */
export function stripVariantPrefix(id?: string | null): string {
  return String(id ?? "")
    .toLowerCase()
    .replace(/^(outfit|pose|wardrobe|vibe|prop|look):/, "")
    .trim();
}

export function canonicalizeAssignmentLock(
  rawLock: Record<string, unknown> | null | undefined,
  speakerCharacterIds: Array<string | null | undefined>,
): AssignmentLockResult {
  const n = speakerCharacterIds.length;
  const raw = rawLock && typeof rawLock === "object" ? rawLock : {};
  const lock: Record<string, string> = {};
  const unresolvedSlots: string[] = [];

  for (let idx = 0; idx < n; idx++) {
    // Sprecheridentität aus den aktuellen dialog_turns hat Vorrang.
    const fromSpeaker = stripVariantPrefix(speakerCharacterIds[idx]);
    const fromLock = stripVariantPrefix(raw[String(idx)] as string | undefined);
    const cid = fromSpeaker || fromLock;
    if (cid) lock[String(idx)] = cid;
    else unresolvedSlots.push(String(idx));
  }

  const droppedSlots = Object.keys(raw).filter((k) => {
    const i = Number(k);
    return !Number.isInteger(i) || i < 0 || i >= n;
  });

  const seen = new Set<string>();
  const duplicateCharacterIds: string[] = [];
  for (const cid of Object.values(lock)) {
    if (seen.has(cid)) {
      if (!duplicateCharacterIds.includes(cid)) duplicateCharacterIds.push(cid);
    }
    seen.add(cid);
  }

  return { lock, droppedSlots, duplicateCharacterIds, unresolvedSlots };
}
