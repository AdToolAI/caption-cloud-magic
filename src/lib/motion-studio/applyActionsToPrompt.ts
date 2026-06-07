/**
 * applyActionsToPrompt — inject Scene-Action + per-Character-Action overrides
 * into a Composer scene's `aiPrompt`.
 *
 * Two marker blocks are owned by this helper and are the single source of
 * truth for user-locked action overrides. Anything between the markers can
 * be re-written deterministically without losing surrounding prompt content:
 *
 *   [SceneAction] …English sentence… [/SceneAction]
 *   [CastActions]
 *   - Sarah: types focused on her laptop, nods at Samuel
 *   - Samuel: leans back, gestures with his pen
 *   [/CastActions]
 *
 * The function is idempotent: calling it with the same inputs produces the
 * same output. Empty inputs strip the corresponding marker block.
 *
 * Markers are prepended (not appended) so they appear at the very top of the
 * provider prompt, where Hailuo/Kling/Vidu treat them with the strongest
 * weight. Existing Cast headers (`Featuring …:`) stay intact.
 */

const SCENE_RE = /\[SceneAction\][\s\S]*?\[\/SceneAction\]\s*/i;
const CAST_RE = /\[CastActions\][\s\S]*?\[\/CastActions\]\s*/i;

export interface CastActionEntry {
  /** Display name as it should appear in the bullet list. */
  name: string;
  /** Already-English action sentence. Empty entries are skipped. */
  actionEn: string;
}

function stripBlocks(prompt: string): string {
  return (prompt || '').replace(SCENE_RE, '').replace(CAST_RE, '').replace(/^\s+/, '');
}

export function applyActionsToPrompt(
  prompt: string,
  sceneActionEn: string | undefined,
  castActions: CastActionEntry[] | undefined,
): string {
  const base = stripBlocks(prompt);
  const parts: string[] = [];

  const sceneTrim = (sceneActionEn ?? '').trim();
  if (sceneTrim) {
    parts.push(`[SceneAction] ${sceneTrim} [/SceneAction]`);
  }

  const entries = (castActions ?? []).filter(
    (c) => c && c.name?.trim() && c.actionEn?.trim(),
  );
  if (entries.length > 0) {
    const lines = entries.map((c) => `- ${c.name.trim()}: ${c.actionEn.trim()}`);
    parts.push(`[CastActions]\n${lines.join('\n')}\n[/CastActions]`);
  }

  if (parts.length === 0) return base;
  return `${parts.join('\n')}\n${base}`.trim();
}
