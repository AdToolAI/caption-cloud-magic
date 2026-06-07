// Multi-character cast picker for a Composer scene.
// Up to 4 characters, each with its own shot-type strategy.
// Backwards-compatible: writes both `characterShots[]` AND `characterShot`
// (= the first/primary slot) so older pipeline code keeps working.

import { useEffect, useMemo, useRef } from 'react';
import { Plus, X, Users, UserPlus, AlertCircle, Shirt } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { SHOT_TYPE_META } from './CharacterShotBadge';
import type {
  CharacterShot,
  CharacterShotType,
  ComposerCharacter,
} from '@/types/video-composer';
import { safeLower, safeFirstNameLower } from '@/lib/motion-studio/strings';
import { useSavedOutfits } from '@/hooks/useSavedOutfits';

const MAX_CAST = 4;
const SHOT_ORDER: CharacterShotType[] = ['full', 'profile', 'back', 'detail', 'pov', 'silhouette'];

type Lang = 'en' | 'de' | 'es';

const LABELS = {
  cast:    { en: 'Cast:', de: 'Cast:', es: 'Reparto:' },
  add:     { en: 'Add character', de: 'Charakter hinzufügen', es: 'Añadir personaje' },
  none:    { en: 'No characters in cast', de: 'Kein Charakter im Cast', es: 'Sin personajes' },
  remove:  { en: 'Remove from scene', de: 'Aus Szene entfernen', es: 'Quitar de la escena' },
  full:    { en: 'Full cast (max 4)', de: 'Cast voll (max. 4)', es: 'Reparto completo (máx 4)' },
  hint:    {
    en: 'Up to 4 characters per scene. ≥2 → Nano Banana 2 composes them into the first frame; Vidu Q2 (Multi-Reference) is recommended.',
    de: 'Bis zu 4 Charaktere pro Szene. Bei ≥2 komponiert Nano Banana 2 sie ins erste Frame; Vidu Q2 (Multi-Reference) wird empfohlen.',
    es: 'Hasta 4 personajes por escena. Con ≥2, Nano Banana 2 los compone en el primer frame; se recomienda Vidu Q2.',
  },
  briefingSection: { en: 'In this project', de: 'In diesem Projekt', es: 'En este proyecto' },
  librarySection:  { en: 'From your avatar library', de: 'Aus deiner Avatar-Bibliothek', es: 'De tu biblioteca de avatares' },
  createNew:       { en: 'Create new avatar…', de: 'Neuen Avatar erstellen…', es: 'Crear nuevo avatar…' },
  unknown:         { en: 'Unknown — remove?', de: 'Unbekannt – entfernen?', es: 'Desconocido – ¿quitar?' },
  outfit:          { en: 'Outfit', de: 'Outfit', es: 'Atuendo' },
  outfitDefault:   { en: 'Default look', de: 'Standard-Look', es: 'Look estándar' },
  manageOutfits:   { en: 'Manage outfits', de: 'Outfits verwalten', es: 'Gestionar atuendos' },
} as const;

interface Props {
  characters: ComposerCharacter[];
  /** Optional: full avatar library (brand_characters + purchased). Shown as a
   *  second section in the add-popover. Picking one auto-adds it to briefing. */
  libraryCharacters?: ComposerCharacter[];
  /** Called when the user picks a character that wasn't in `characters` yet,
   *  so the parent can persist it to the project briefing cast. */
  onAddToBriefing?: (character: ComposerCharacter) => void;
  value?: CharacterShot[];
  /** Backwards-compat: legacy single-slot value. */
  legacyValue?: CharacterShot;
  onChange: (next: CharacterShot[]) => void;
  language?: Lang;
  /**
   * When true, each cast slot renders a manual Action field underneath the
   * row so the user can pin exactly what THIS character does in the scene
   * (UI language → auto-EN → `[CastActions]` marker in the prompt).
   */
  showActionFields?: boolean;
}

function normalizeValue(value?: CharacterShot[], legacy?: CharacterShot): CharacterShot[] {
  if (value && value.length > 0) return value.filter((s) => s.shotType !== 'absent');
  if (legacy && legacy.shotType !== 'absent') return [legacy];
  return [];
}

/**
 * Tolerant character lookup — mirrors `applyCastToPrompt.findCharacter`
 * and `CastConsistencyMap.getAnchor` so the picker stays in sync even when
 * the storyboard LLM drifts the `characterId` away from the brand UUID.
 */
function findCharacter(
  slotId: string | undefined,
  pool: ComposerCharacter[],
): ComposerCharacter | undefined {
  if (!slotId || !pool.length) return undefined;
  const exact = pool.find((c) => c.id === slotId);
  if (exact) return exact;
  const lower = safeLower(slotId);
  if (!lower) return undefined;
  const byNameInId = pool.find((c) => {
    const first = safeFirstNameLower(c.name);
    return !!first && first.length >= 3 && lower.includes(first);
  });
  if (byNameInId) return byNameInId;
  return pool.find((c) => safeLower(c.name) === lower);
}

export function CharacterCastPicker({
  characters,
  libraryCharacters,
  onAddToBriefing,
  value,
  legacyValue,
  onChange,
  language = 'en',
  showActionFields = true,
}: Props) {
  const lang: Lang = language;
  const cast = normalizeValue(value, legacyValue);

  // Combined pool used for resolving slot ids (briefing first, then library
  // — briefing wins on dupe id).
  const resolutionPool = useMemo<ComposerCharacter[]>(() => {
    const seen = new Set((characters ?? []).map((c) => c.id));
    const extras = (libraryCharacters ?? []).filter((c) => !seen.has(c.id));
    return [...(characters ?? []), ...extras];
  }, [characters, libraryCharacters]);

  // Self-heal: when a slot's id is drifted (e.g. "lib:matthew-…") but matches
  // a real character via tolerant lookup, rewrite it to the canonical UUID
  // exactly once. Subsequent renders see the corrected id and stop.
  const healedRef = useRef(false);
  useEffect(() => {
    if (healedRef.current) return;
    if (cast.length === 0) return;
    let changed = false;
    const next = cast.map((s) => {
      if (resolutionPool.some((c) => c.id === s.characterId)) return s;
      const match = findCharacter(s.characterId, resolutionPool);
      if (match && match.id !== s.characterId) {
        changed = true;
        return { ...s, characterId: match.id };
      }
      return s;
    });
    if (changed) {
      healedRef.current = true;
      onChange(next);
    }
    // Dependencies kept lean — only re-run when ids actually change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cast.map((s) => s.characterId).join('|'), resolutionPool.map((c) => c.id).join('|')]);

  const inCast = new Set(cast.map((s) => s.characterId));

  const briefingAvailable = (characters ?? []).filter((c) => !inCast.has(c.id));
  const libraryAvailable = (libraryCharacters ?? []).filter(
    (c) => !inCast.has(c.id) && !(characters ?? []).some((b) => b.id === c.id),
  );

  // Render nothing if there is genuinely nothing to show or do.
  if (
    (characters?.length ?? 0) === 0 &&
    (libraryCharacters?.length ?? 0) === 0 &&
    cast.length === 0
  ) {
    return null;
  }

  const updateSlot = (id: string, patch: Partial<CharacterShot>) => {
    onChange(cast.map((s) => (s.characterId === id ? { ...s, ...patch } : s)));
  };
  const removeSlot = (id: string) => {
    onChange(cast.filter((s) => s.characterId !== id));
  };
  const addSlot = (id: string) => {
    if (cast.length >= MAX_CAST) return;
    onChange([...cast, { characterId: id, shotType: 'full' }]);
  };
  const addFromLibrary = (c: ComposerCharacter) => {
    if (cast.length >= MAX_CAST) return;
    if (onAddToBriefing && !(characters ?? []).some((b) => b.id === c.id)) {
      onAddToBriefing(c);
    }
    addSlot(c.id);
  };

  const canAddMore =
    cast.length < MAX_CAST &&
    (briefingAvailable.length > 0 || libraryAvailable.length > 0 || !!onAddToBriefing);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
          <Users className="h-3 w-3" />
          {LABELS.cast[lang]}
        </span>

        {cast.length === 0 && (
          <span className="text-[10px] text-muted-foreground italic">{LABELS.none[lang]}</span>
        )}

        {cast.map((slot) => {
          const ch = findCharacter(slot.characterId, resolutionPool);
          const meta = SHOT_TYPE_META[slot.shotType] ?? SHOT_TYPE_META.full;
          const isGhost = !ch;
          return (
            <div
              key={slot.characterId}
              className={
                isGhost
                  ? 'inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 pl-0.5 pr-1 py-0.5'
                  : 'inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 pl-0.5 pr-1 py-0.5'
              }
              title={isGhost ? LABELS.unknown[lang] : ch?.name}
            >
              {ch?.referenceImageUrl ? (
                <img
                  src={ch.referenceImageUrl}
                  alt={ch.name}
                  className="h-5 w-5 rounded-full object-cover"
                />
              ) : isGhost ? (
                <div className="h-5 w-5 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-300">
                  <AlertCircle className="h-3 w-3" />
                </div>
              ) : (
                <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[8px] font-bold">
                  {ch?.name?.[0] ?? '?'}
                </div>
              )}
              <span className={`text-[10px] font-medium px-1 ${isGhost ? 'text-amber-300' : ''}`}>
                {ch?.name ?? LABELS.unknown[lang]}
              </span>

              {!isGhost && (
                <Select
                  value={slot.shotType}
                  onValueChange={(v) =>
                    updateSlot(slot.characterId, { shotType: v as CharacterShotType })
                  }
                >
                  <SelectTrigger className="h-5 w-auto gap-1 text-[10px] border-border/40 bg-background/50 px-1.5">
                    <SelectValue>{meta.label}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {SHOT_ORDER.map((t) => {
                      const m = SHOT_TYPE_META[t];
                      const Icon = m.icon;
                      return (
                        <SelectItem key={t} value={t} className="text-xs">
                          <span className="inline-flex items-center gap-1.5">
                            <Icon className="h-3 w-3" />
                            {m.label}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              )}

              <button
                type="button"
                onClick={() => removeSlot(slot.characterId)}
                className="ml-0.5 h-4 w-4 rounded-full hover:bg-destructive/20 text-muted-foreground hover:text-destructive flex items-center justify-center"
                aria-label={LABELS.remove[lang]}
                title={LABELS.remove[lang]}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}

        {canAddMore && (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[10px] gap-1 border-dashed"
              >
                <Plus className="h-3 w-3" />
                {LABELS.add[lang]}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 p-1">
              <div className="space-y-1">
                {briefingAvailable.length > 0 && (
                  <div>
                    <div className="px-2 pt-1 pb-0.5 text-[9px] uppercase tracking-widest text-muted-foreground/70">
                      {LABELS.briefingSection[lang]}
                    </div>
                    <div className="space-y-0.5">
                      {briefingAvailable.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => addSlot(c.id)}
                          className="flex items-center gap-2 w-full px-2 py-1.5 rounded hover:bg-muted text-left"
                        >
                          {c.referenceImageUrl ? (
                            <img src={c.referenceImageUrl} alt={c.name} className="h-6 w-6 rounded-full object-cover" />
                          ) : (
                            <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold">
                              {c.name[0]}
                            </div>
                          )}
                          <span className="text-xs">{c.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {libraryAvailable.length > 0 && (
                  <div>
                    <div className="px-2 pt-1 pb-0.5 text-[9px] uppercase tracking-widest text-muted-foreground/70">
                      {LABELS.librarySection[lang]}
                    </div>
                    <div className="space-y-0.5">
                      {libraryAvailable.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => addFromLibrary(c)}
                          className="flex items-center gap-2 w-full px-2 py-1.5 rounded hover:bg-muted text-left"
                        >
                          {c.referenceImageUrl ? (
                            <img src={c.referenceImageUrl} alt={c.name} className="h-6 w-6 rounded-full object-cover" />
                          ) : (
                            <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold">
                              {c.name[0]}
                            </div>
                          )}
                          <span className="text-xs">{c.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="border-t border-border/40 my-1" />
                <a
                  href="/brand-characters"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 w-full px-2 py-1.5 rounded hover:bg-muted text-left text-xs text-primary"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  {LABELS.createNew[lang]}
                </a>
              </div>
            </PopoverContent>
          </Popover>
        )}

        {cast.length >= MAX_CAST && (
          <span className="text-[10px] text-amber-400/80 italic">{LABELS.full[lang]}</span>
        )}
      </div>

      {/* Per-character outfit picker rows. One row per cast member that maps
          to a real Brand Character (only those have saved outfit looks). */}
      {cast.map((slot) => {
        const ch = findCharacter(slot.characterId, resolutionPool);
        if (!ch) return null;
        const avatarId = ch.brandCharacterId;
        if (!avatarId) return null;
        return (
          <OutfitPickerRow
            key={`outfit-${slot.characterId}`}
            avatarId={avatarId}
            characterName={ch.name}
            characterAvatar={ch.referenceImageUrl}
            value={slot.outfitLookId ?? null}
            onChange={(outfitLookId) =>
              updateSlot(slot.characterId, { outfitLookId })
            }
            lang={lang}
          />
        );
      })}

      {/* Per-character Action override fields. Lazy-import the SceneActionField
          via React to keep this module's bundle slim if the consumer never
          opts in via showActionFields. */}
      {showActionFields && cast.map((slot) => {
        const ch = findCharacter(slot.characterId, resolutionPool);
        if (!ch) return null;
        return (
          <ActionFieldRow
            key={`action-${slot.characterId}`}
            characterName={ch.name}
            value={slot.actionUser ?? ''}
            englishValue={slot.actionEn ?? ''}
            language={lang}
            onChange={(actionUser) => updateSlot(slot.characterId, { actionUser })}
            onEnglishChange={(actionEn) => updateSlot(slot.characterId, { actionEn })}
          />
        );
      })}


      {cast.length >= 2 && (
        <p className="text-[10px] text-muted-foreground/80 leading-tight">{LABELS.hint[lang]}</p>
      )}
    </div>
  );
}

/* ============================================================== */
/*  Per-character outfit picker (saved looks from /avatars/:id)    */
/* ============================================================== */

interface OutfitPickerRowProps {
  avatarId: string;
  characterName: string;
  characterAvatar?: string;
  value: string | null;
  onChange: (outfitLookId: string | null) => void;
  lang: Lang;
}

function OutfitPickerRow({
  avatarId,
  characterName,
  characterAvatar,
  value,
  onChange,
  lang,
}: OutfitPickerRowProps) {
  const { data: looks = [], isLoading } = useSavedOutfits(avatarId);

  // No saved outfits → don't waste vertical space, just a one-line nudge.
  if (!isLoading && looks.length === 0) {
    return (
      <div className="flex items-center gap-2 pl-1">
        <Shirt className="h-3 w-3 text-muted-foreground/60 flex-shrink-0" />
        <span className="text-[10px] text-muted-foreground/60 truncate">
          <span className="text-muted-foreground/90 font-medium">{characterName}</span>
          {' · '}
          <a
            href={`/avatars/${avatarId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary/80 hover:text-primary underline-offset-2 hover:underline"
          >
            {LABELS.manageOutfits[lang]}
          </a>
        </span>
      </div>
    );
  }

  // Auto-reset if the previously selected outfit was deleted in the meantime.
  const stillExists = value === null || looks.some((l) => l.id === value);
  if (!isLoading && !stillExists) {
    onChange(null);
  }

  return (
    <div className="flex items-start gap-2 pl-1">
      {characterAvatar ? (
        <img
          src={characterAvatar}
          alt={characterName}
          className="h-5 w-5 rounded-full object-cover flex-shrink-0 mt-0.5"
        />
      ) : (
        <Shirt className="h-3 w-3 text-muted-foreground/70 flex-shrink-0 mt-1" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 mb-1">
          <span className="text-[10px] font-medium text-muted-foreground/90">{characterName}</span>
          <span className="text-[10px] text-muted-foreground/60">· {LABELS.outfit[lang]}:</span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => onChange(null)}
            className={
              value === null
                ? 'inline-flex items-center gap-1.5 rounded-full border border-primary/60 bg-primary/15 px-2 py-0.5 shadow-[0_0_18px_-6px_hsl(var(--primary)/0.55)] text-primary'
                : 'inline-flex items-center gap-1.5 rounded-full border border-border/40 bg-background/40 px-2 py-0.5 hover:border-border'
            }
            title={LABELS.outfitDefault[lang]}
          >
            <span className="text-[10px] font-medium">{LABELS.outfitDefault[lang]}</span>
          </button>
          {looks.map((look) => {
            const active = value === look.id;
            return (
              <button
                key={look.id}
                type="button"
                onClick={() => onChange(look.id)}
                className={
                  active
                    ? 'inline-flex items-center gap-1.5 rounded-full border border-primary/60 bg-primary/15 pl-0.5 pr-2 py-0.5 shadow-[0_0_18px_-6px_hsl(var(--primary)/0.55)] text-primary'
                    : 'inline-flex items-center gap-1.5 rounded-full border border-border/40 bg-background/40 pl-0.5 pr-2 py-0.5 hover:border-border'
                }
                title={look.name}
              >
                {look.cover_url || look.front_url ? (
                  <img
                    src={look.cover_url || look.front_url || ''}
                    alt={look.name}
                    className="h-5 w-5 rounded-full object-cover"
                  />
                ) : (
                  <Shirt className="h-3 w-3 mx-1" />
                )}
                <span className="text-[10px] font-medium max-w-[8rem] truncate">{look.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ============================================================== */
/*  Per-character Action override row (auto-EN translation)        */
/* ============================================================== */

import SceneActionField from './SceneActionField';

interface ActionFieldRowProps {
  characterName: string;
  value: string;
  englishValue: string;
  language: Lang;
  onChange: (v: string) => void;
  onEnglishChange: (en: string) => void;
}

function ActionFieldRow({
  characterName,
  value,
  englishValue,
  language,
  onChange,
  onEnglishChange,
}: ActionFieldRowProps) {
  const L = {
    en: { label: `Action — what does ${characterName} do?`, ph: `e.g. types focused on her laptop, nods at the others` },
    de: { label: `Aktion — was tut ${characterName}?`, ph: `z. B. tippt konzentriert am Laptop und nickt den anderen zu` },
    es: { label: `Acción — ¿qué hace ${characterName}?`, ph: `p. ej. teclea concentrado en su portátil y asiente a los demás` },
  }[language];
  return (
    <div className="pl-1">
      <SceneActionField
        language={language}
        label={L.label}
        placeholder={L.ph}
        value={value}
        englishValue={englishValue}
        onChange={onChange}
        onEnglishChange={onEnglishChange}
        size="sm"
        rows={2}
      />
    </div>
  );
}
