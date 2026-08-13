/**
 * resolveEffectiveDialog — the single canonical dialog contract (v430, Step 0).
 * =============================================================================
 *
 * Root cause of `dialog_too_long_for_plate`: the UI script was shortened to 4
 * lines while `composer_scenes.dialog_turns` still held 6 turns, and the
 * server voices `dialog_turns`. A pure line-count comparison is not enough —
 * "same number of lines, different text" stayed undetected.
 *
 * This module is the ONE place that answers "what dialog does this scene
 * actually have?". Exactly three callers use it:
 *   1. the dialog editor (on load and on save),
 *   2. the UI preflight (blocks the generate button on estimated overrun),
 *   3. `compose-twoshot-audio` (before TTS, persisting the canonical turns).
 *
 * Contract guarantees:
 *  - divergence is detected on normalized speaker + normalized text + order,
 *  - stable turn ids survive unchanged lines (lip-sync v201: `dialog_turns` is
 *    the UUID source of truth),
 *  - an empty script never destroys existing turns,
 *  - pure: no Supabase import, no IO, no mutation of the input.
 *
 * IMPORTANT: this file has a byte-identical mirror at
 * `supabase/functions/_shared/resolve-effective-dialog.ts`.
 * A parity test fails the build when the two drift apart.
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

/** Unicode-NFC, trimmed, whitespace-collapsed text. */
export function normalizeDialogText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Case-insensitive speaker key; a leading `@mention` marker is irrelevant. */
export function normalizeSpeakerKey(value: unknown): string {
  return normalizeDialogText(value).replace(/^@/, '').toLowerCase();
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

/**
 * Normalize a raw `dialog_turns` payload (camelCase in DB JSON) into canonical
 * turns: invalid entries dropped, order applied, text normalized.
 */
export function normalizeDialogTurns(raw: unknown): CanonicalTurn[] {
  if (!Array.isArray(raw)) return [];
  const out: CanonicalTurn[] = [];
  raw.forEach((entry, index) => {
    const turn = entry as Record<string, unknown> | null;
    if (!turn || typeof turn !== 'object') return;
    const characterId = String(turn.characterId ?? (turn as any).character_id ?? '').trim();
    const text = normalizeDialogText(turn.text);
    if (!characterId || !text) return;
    const rawId = turn.turnId ?? (turn as any).turn_id;
    const rawOrder = typeof turn.order === 'number' ? Number(turn.order) : index;
    out.push({
      turnId: rawId ? String(rawId) : undefined,
      characterId,
      displayName: String(turn.displayName ?? (turn as any).display_name ?? '').trim() || undefined,
      text,
      mood: turn.mood ? String(turn.mood) : undefined,
      order: rawOrder,
    });
  });
  return out
    .sort((a, b) => a.order - b.order)
    .map((turn, index) => ({ ...turn, order: index }));
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
 *
 * Rules:
 *  - fewer lines than turns  → surplus turns are dropped (kept order + ids)
 *  - more lines than turns   → extra lines become new turns without an id
 *  - a line whose `Name:` prefix resolves to a different cast member wins
 *    over the positional turn — the character id is re-resolved by name.
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
      text: normalizeDialogText(line.text),
      mood: keepsIdentity ? base?.mood : undefined,
      order: index,
    } satisfies CanonicalTurn;
  });
}

export type EffectiveDialogReason =
  | 'no_turns'
  | 'empty_script'
  | 'in_sync'
  | 'count_mismatch'
  | 'speaker_mismatch'
  | 'text_mismatch';

export interface EffectiveDialog {
  /** The turns that MUST be voiced / counted / persisted. */
  turns: CanonicalTurn[];
  source: 'turns' | 'aligned' | 'script';
  diverged: boolean;
  reason: EffectiveDialogReason;
}

/** Scene shape accepted in both camelCase (client) and snake_case (server). */
export interface EffectiveDialogSceneInput {
  dialogScript?: string | null;
  dialog_script?: string | null;
  dialogTurns?: unknown;
  dialog_turns?: unknown;
}

export interface ResolveEffectiveDialogOptions {
  resolveSpeakerId?: (name: string) => { id: string; name: string } | null;
}

/** Comparable signature of a turn: normalized speaker + normalized text. */
function turnSignature(turn: CanonicalTurn): string {
  return `${normalizeSpeakerKey(turn.characterId)}::${normalizeDialogText(turn.text).toLowerCase()}`;
}

/**
 * The canonical answer to "what dialog does this scene have right now?".
 * Pure — never touches the database and never mutates its input.
 */
export function resolveEffectiveDialog(
  scene: EffectiveDialogSceneInput | null | undefined,
  options: ResolveEffectiveDialogOptions = {},
): EffectiveDialog {
  const script = scene?.dialogScript ?? scene?.dialog_script ?? '';
  const turns = normalizeDialogTurns(scene?.dialogTurns ?? scene?.dialog_turns);

  if (turns.length === 0) {
    return { turns: [], source: 'script', diverged: false, reason: 'no_turns' };
  }

  const lines = parseScriptLines(script);
  if (lines.length === 0) {
    // An empty script must never destroy the canonical turns.
    return { turns, source: 'turns', diverged: false, reason: 'empty_script' };
  }

  const aligned = alignDialogTurnsToScript({
    turns,
    script,
    resolveSpeakerId: options.resolveSpeakerId,
  });
  if (!aligned) {
    return { turns, source: 'turns', diverged: false, reason: 'empty_script' };
  }

  if (aligned.length !== turns.length) {
    return { turns: aligned, source: 'aligned', diverged: true, reason: 'count_mismatch' };
  }

  let speakerDrift = false;
  let textDrift = false;
  for (let i = 0; i < aligned.length; i += 1) {
    if (normalizeSpeakerKey(aligned[i].characterId) !== normalizeSpeakerKey(turns[i].characterId)) {
      speakerDrift = true;
    } else if (turnSignature(aligned[i]) !== turnSignature(turns[i])) {
      textDrift = true;
    }
  }

  if (speakerDrift) {
    return { turns: aligned, source: 'aligned', diverged: true, reason: 'speaker_mismatch' };
  }
  if (textDrift) {
    return { turns: aligned, source: 'aligned', diverged: true, reason: 'text_mismatch' };
  }

  return { turns, source: 'turns', diverged: false, reason: 'in_sync' };
}
