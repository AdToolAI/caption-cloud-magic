// Per-scene character anchor resolver.
//
// Decides HOW the chosen character(s) should be sent to the AI provider so the
// scene composition (wide shot, back-shot, drone, etc.) is preserved instead
// of being overridden by a centered face close-up.
//
// Strategies:
//   first-frame-direct   → portrait sent as i2v anchor (only safe for close-ups)
//   first-frame-composed → portrait+scenePrompt rendered into a new first-frame
//                          via Nano Banana 2 (preferred default for character scenes)
//   subject-reference    → portrait goes into a dedicated subject-reference slot
//                          (Vidu Q2, Kling Reference2V) — does not lock framing
//   text-only            → no image anchor, identity card stays in the prompt
//
// Resolution order for picking the candidate character:
//   1. Explicit characterShot
//   2. Cast-name match in the prompt
//   3. Favourite Brand Character whose name is in the prompt

import type { ComposerCharacter, ComposerScene } from '@/types/video-composer';
import { MOTION_STUDIO_STRICT_IDS } from './featureFlags';

export type AnchorStrategy =
  | 'first-frame-direct'
  | 'first-frame-composed'
  | 'subject-reference'
  | 'text-only';

export interface SceneAnchor {
  characterId: string;
  name: string;
  /** Original portrait URL (always present). */
  referenceImageUrl: string;
  /** Where the candidate came from. */
  source: 'explicit-shot' | 'cast-slot' | 'cast-name-match' | 'brand-name-match';
  /** How the portrait should be used by the provider. */
  strategy: AnchorStrategy;
}

interface BrandCharLike {
  id?: string;
  name?: string;
  reference_image_url?: string;
}

const SUBJECT_REF_SOURCES = new Set(['ai-vidu']);

function nameMatchesPrompt(name: string | undefined, prompt: string): boolean {
  if (!name) return false;
  const full = name.toLowerCase().trim();
  if (!full) return false;
  if (prompt.includes(full)) return true;
  const first = full.split(/\s+/)[0];
  return !!first && first.length >= 3 && prompt.includes(first);
}

function personKey(value: string | undefined): string {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function dialogSpeakerKeys(script: string | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of String(script || '').split('\n')) {
    const m = line.match(/^\s*\[?([A-Za-zÀ-ÿ][\w\s.'-]{1,60}?)\]?\s*[:：]/);
    const key = personKey(m?.[1]);
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(key);
    }
  }
  return out;
}

function speakerMatchesCharacter(speakerKey: string, character: ComposerCharacter | undefined): boolean {
  if (!speakerKey || !character) return false;
  const idKey = personKey(character.id);
  const nameKey = personKey(character.name);
  const speakerFirst = speakerKey.split(' ')[0];
  return idKey === speakerKey || nameKey === speakerKey || idKey.split(' ')[0] === speakerFirst || nameKey.split(' ')[0] === speakerFirst;
}

function pickStrategy(
  shotType: string | undefined,
  clipSource: string | undefined,
  source: SceneAnchor['source'],
  forceDirect: boolean,
  multi: boolean = false,
): AnchorStrategy {
  if (forceDirect && !multi) return 'first-frame-direct';
  if (clipSource && SUBJECT_REF_SOURCES.has(clipSource)) return 'subject-reference';
  // Multi-character scenes ALWAYS need composition — direct never works for >1.
  if (multi) return 'first-frame-composed';
  // Tight shots: portrait directly is fine — composition IS the face.
  if (shotType === 'detail' || shotType === 'pov') return 'first-frame-direct';
  // Explicit framing that is NOT a tight close-up → compose.
  if (shotType === 'full' || shotType === 'profile' || shotType === 'back' || shotType === 'silhouette') {
    return 'first-frame-composed';
  }
  // Name-match (LLM mentioned the character by name but didn't set an explicit
  // shot slot): we DO have a portrait, so compose it into the scene — text-only
  // would let the provider invent a stranger's face.
  if (source === 'cast-name-match' || source === 'brand-name-match') {
    return 'first-frame-composed';
  }
  // Explicit shot present but unknown shotType → compose.
  return 'first-frame-composed';
}

export function resolveSceneCharacterAnchor(
  scene: Pick<ComposerScene, 'aiPrompt' | 'characterShot' | 'clipSource'> & {
    forcePortraitAsFirstFrame?: boolean;
  },
  characters: ComposerCharacter[] | undefined,
  brandChar: BrandCharLike | null | undefined,
): SceneAnchor | undefined {
  const all = resolveSceneCharacterAnchorsAll(scene, characters, brandChar);
  return all[0];
}

/**
 * Multi-character variant. Returns an ordered array of anchors:
 *   1. Explicit characterShot (if any)
 *   2. ALL cast members whose names appear in the prompt
 *   3. Brand character (if its name appears and not already in cast)
 *
 * The `strategy` of each anchor is recomputed with `multi=true` when more
 * than one anchor is returned, forcing `first-frame-composed` so the scene
 * composer can place ALL of them in one frame.
 */
export function resolveSceneCharacterAnchorsAll(
  scene: Pick<ComposerScene, 'aiPrompt' | 'characterShot' | 'characterShots' | 'clipSource' | 'dialogScript'> & {
    forcePortraitAsFirstFrame?: boolean;
  },
  characters: ComposerCharacter[] | undefined,
  brandChar: BrandCharLike | null | undefined,
): SceneAnchor[] {
  const forceDirect = scene.forcePortraitAsFirstFrame === true;
  const seen = new Set<string>();
  const seenPeople = new Set<string>();
  const out: SceneAnchor[] = [];

  // 1) Explicit cast slots (multi-character UI). Falls back to legacy
  //    `characterShot` (singular) when `characterShots` is not yet populated.
  const rawSlots = (scene.characterShots && scene.characterShots.length > 0)
    ? scene.characterShots
    : (scene.characterShot ? [scene.characterShot] : []);
  const speakers = dialogSpeakerKeys(scene.dialogScript);
  const slots = speakers.length > 0 && characters && rawSlots.length > 0
    ? rawSlots
        .map((slot) => {
          const cm = characters.find((c) => c.id === slot.characterId);
          const order = speakers.findIndex((key) => speakerMatchesCharacter(key, cm));
          return { slot, order };
        })
        .filter((x) => x.order >= 0)
        .sort((a, b) => a.order - b.order)
        .map((x) => x.slot)
    : rawSlots;
  if (characters && slots.length > 0) {
    for (const slot of slots) {
      if (!slot || !slot.shotType || slot.shotType === 'absent') continue;
      if (seen.has(slot.characterId)) continue;
      const cm = characters.find((c) => c.id === slot.characterId);
      if (!cm?.referenceImageUrl) continue;
      const key = personKey(cm.name) || personKey(cm.id);
      if (key && seenPeople.has(key)) continue;
      // Outfit override: when the scene picked a saved outfit look for this
      // character, swap the portrait URL for the outfit cover. The caller
      // (compose-scene-anchor) treats it as just another portrait URL.
      const outfitUrl = (slot as any).__outfitImageUrl as string | undefined;
      out.push({
        characterId: cm.id,
        name: cm.name,
        referenceImageUrl: outfitUrl || cm.referenceImageUrl,
        source: out.length === 0 ? 'explicit-shot' : 'cast-slot',
        strategy: 'first-frame-direct', // recomputed below
      });
      seen.add(cm.id);
      if (key) seenPeople.add(key);
    }
  }

  const prompt = (scene.aiPrompt || '').toLowerCase();

  // 2) Any cast members whose names appear in the prompt
  if (prompt && characters && characters.length > 0) {
    for (const cm of characters) {
      if (seen.has(cm.id)) continue;
      if (!cm.referenceImageUrl) continue;
      const key = personKey(cm.name) || personKey(cm.id);
      if (key && seenPeople.has(key)) continue;
      if (nameMatchesPrompt(cm.name, prompt)) {
        out.push({
          characterId: cm.id,
          name: cm.name,
          referenceImageUrl: cm.referenceImageUrl,
          source: 'cast-name-match',
          strategy: 'text-only', // recomputed below
        });
        seen.add(cm.id);
        if (key) seenPeople.add(key);
      }
    }
  }

  // 3) Favourite Brand Character (if not already in cast)
  if (
    prompt &&
    brandChar?.reference_image_url &&
    nameMatchesPrompt(brandChar.name, prompt) &&
    !seen.has(brandChar.id || `brand:${brandChar.name}`) &&
    !seenPeople.has(personKey(brandChar.name))
  ) {
    out.push({
      characterId: brandChar.id || `brand:${brandChar.name}`,
      name: brandChar.name || 'Brand Character',
      referenceImageUrl: brandChar.reference_image_url,
      source: 'brand-name-match',
      strategy: 'text-only', // recomputed below
    });
  }

  // Recompute strategies with multi-flag. Each anchor uses ITS OWN shotType
  // (from the matching cast slot) when available; falls back to primary.
  const multi = out.length > 1;
  const primaryShot = slots[0]?.shotType;
  return out.map((a) => {
    const ownSlot = slots.find((s) => s.characterId === a.characterId);
    const shotType = ownSlot?.shotType ?? primaryShot;
    return {
      ...a,
      strategy: pickStrategy(shotType, scene.clipSource, a.source, forceDirect, multi),
    };
  });
}
