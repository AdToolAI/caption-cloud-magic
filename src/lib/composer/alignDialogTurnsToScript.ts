/**
 * alignDialogTurnsToScript — the script textarea is the source of truth for
 * *how much* dialog a scene contains; the canonical `dialogTurns` remain the
 * source of truth for *who* speaks (UUID binding, v201).
 *
 * Before this helper the studio only adopted editor text when the line count
 * matched the turn count exactly. Shortening a script from 6 to 4 lines was
 * therefore silently ignored — header, seconds estimate and the persisted
 * turns all kept the old 6 blocks.
 *
 * Rules:
 *  - fewer lines than turns  → surplus turns are dropped (kept order + ids)
 *  - more lines than turns   → extra lines become new turns without an id
 *  - a line whose `Name:` prefix resolves to a different cast member wins
 *    over the positional turn — the character id is re-resolved by name.
 */

export interface CanonicalTurn {
  turnId?: string;
  characterId: string;
  displayName?: string;
  text: string;
  mood?: string;
  order: number;
}

export interface ParsedScriptLine {
  speakerName: string | null;
  text: string;
}

/** Split a raw script into `Name: text` lines (name optional). */
export function parseScriptLines(script: string | null | undefined): ParsedScriptLine[] {
  const out: ParsedScriptLine[] = [];
  for (const raw of String(script ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^([^:\n]{1,96}):\s*(.*)$/);
    const speakerName = m ? m[1].trim() : null;
    const text = (m ? m[2] : line).trim();
    if (!text) continue;
    out.push({ speakerName: speakerName || null, text });
  }
  return out;
}

export interface AlignOptions {
  turns: CanonicalTurn[];
  script: string | null | undefined;
  /** Resolve a written speaker name to a canonical character id (cast lookup). */
  resolveSpeakerId?: (name: string) => { id: string; name: string } | null;
}

/**
 * Returns the turn list that matches the current script. Returns `null` when
 * there is nothing to align (no turns, or an empty script) so callers can keep
 * their existing fallbacks.
 */
export function alignDialogTurnsToScript({
  turns,
  script,
  resolveSpeakerId,
}: AlignOptions): CanonicalTurn[] | null {
  if (!turns.length) return null;
  const lines = parseScriptLines(script);
  if (!lines.length) return null;

  return lines.map((line, index) => {
    const base = turns[index];
    const byName = line.speakerName ? resolveSpeakerId?.(line.speakerName) ?? null : null;

    // Speaker resolution: an explicit, resolvable name always wins; otherwise
    // keep the positional turn; otherwise fall back to the last known turn so
    // extra lines still carry a valid character id.
    const fallback = base ?? turns[turns.length - 1];
    const characterId = byName?.id ?? fallback.characterId;
    const keepsIdentity = characterId === base?.characterId;

    return {
      // Only keep the canonical turn id when the speaker did not change —
      // a re-assigned line must not inherit the previous speaker's turn id.
      turnId: keepsIdentity ? base?.turnId : undefined,
      characterId,
      displayName: byName?.name ?? (keepsIdentity ? base?.displayName : undefined),
      text: line.text,
      mood: keepsIdentity ? base?.mood : undefined,
      order: index,
    } satisfies CanonicalTurn;
  });
}
