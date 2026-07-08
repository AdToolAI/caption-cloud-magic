// Auto-injects selected scene world-assets (Locations, Buildings, Props) into
// the scene prompt as deterministic, idempotent mention tokens at the start:
//
//   @gothic-cathedral @vintage-camera <rest of prompt>
//
// - Mentions are slugified asset names so they resolve through the existing
//   `useUnifiedMentionLibrary` + `resolveMentions` pipeline (which already
//   knows how to forward reference_image_url to Vidu Q2 / Hailuo i2v / Nano
//   Banana scene anchor).
// - Re-running with the same selection does not duplicate tokens.
// - Empty selection removes all auto-injected tokens for that asset family
//   (but leaves user-typed mentions intact: only the leading auto-block is
//    rewritten).
// - We use a fenced auto-block so we never trample mentions the user typed
//   themselves further down in the prose:
//
//     <!--scene-assets-->@a @b @c<!--/scene-assets--> <prose>

const BLOCK_RE = /^\s*<!--scene-assets-->[^<]*<!--\/scene-assets-->\s*/;

export function slugifyAssetName(name: string): string {
  return (name || '')
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function stripBlock(prompt: string): string {
  return (prompt || '').replace(BLOCK_RE, '');
}

export type SceneAssetKind = 'location' | 'building' | 'prop';

export interface SceneAssetMention {
  /** human name as stored in brand_locations / brand_buildings / brand_props */
  name: string;
  /** v211 — canonical UUID from brand_locations / brand_buildings / brand_props.
   *  When present the world-anchor resolver matches by UUID, not by slug. */
  id?: string;
  /** v211 — which brand table this UUID belongs to. Optional; only used to
   *  disambiguate the resolver when two families share a name. */
  type?: SceneAssetKind;
}

/**
 * Replace the leading auto-injected scene-asset block with a fresh one.
 * Pass an empty array to remove the block entirely.
 *
 * v211: The prompt-marker stays slug-based (LLMs read prose, not UUIDs), but
 * callers should pass `{ name, id, type }` so downstream resolvers can lock
 * to canonical brand-table UUIDs rather than fuzzy-matching by slug.
 */
export function applySceneAssetsToPrompt(
  prompt: string,
  assets: SceneAssetMention[],
): string {
  const prose = stripBlock(prompt || '').trimStart();
  const tokens = (assets || [])
    .map((a) => slugifyAssetName(a.name))
    .filter(Boolean);
  const unique = Array.from(new Set(tokens)).map((s) => `@${s}`);
  if (unique.length === 0) return prose;
  return `<!--scene-assets-->${unique.join(' ')}<!--/scene-assets--> ${prose}`;
}

/**
 * Read the current selection back out of the prompt — used to keep the picker
 * in sync when the user types/edits mentions manually.
 */
export function readSceneAssetSlugs(prompt: string): string[] {
  const m = (prompt || '').match(BLOCK_RE);
  if (!m) return [];
  const inner = m[0]
    .replace(/<!--\/?scene-assets-->/g, '')
    .trim();
  return inner
    .split(/\s+/)
    .map((t) => t.replace(/^@/, ''))
    .filter(Boolean);
}
