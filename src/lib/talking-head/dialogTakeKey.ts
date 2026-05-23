/**
 * dialogTakeKey — Stable per-line key for the Take-System A/B/C (Phase B).
 *
 * Used as the map key inside `ComposerScene.dialogTakes`. Built from the line
 * index AND a short hash of the line text so that:
 *  - Editing a line invalidates its takes (the user is hearing different words).
 *  - Re-ordering scripts naturally invalidates affected lines.
 *  - Two identical lines from the same speaker in the same script get distinct
 *    keys (via index), so re-rolling one doesn't affect the other.
 *
 * Phase C — Tonality changes also invalidate takes. When the user adds or
 * changes a `[whisper]` / `[shouting]` marker, the resulting audio is
 * sonically different even if the words are identical, so we fold the
 * tonality into the hash. Old takes stay accessible under their old key
 * (they're still in `dialogTakes`), but the new key resolves to a fresh
 * slot — letting the user A/B compare across tonalities.
 *
 * The hash is a tiny FNV-1a 32-bit (deterministic, JS-only) of the trimmed
 * lowercased text. It is NOT cryptographic — collisions are acceptable, but
 * good enough to distinguish edits at line granularity.
 */

export function dialogLineKey(index: number, text: string, tonality?: string | null): string {
  const t = (text ?? '').trim().toLowerCase();
  const tone = (tonality ?? '').trim().toLowerCase();
  // Fold tonality into the hash input so a marker change invalidates the key.
  const input = tone ? `${t}|${tone}` : t;
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return `${index}:${h.toString(36)}`;
}

export const TAKE_LABELS = ['A', 'B', 'C'] as const;
export const MAX_TAKES_PER_LINE = 3;
