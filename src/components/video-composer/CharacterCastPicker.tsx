// Multi-character cast picker for a Composer scene.
// Up to 4 characters, each with its own shot-type strategy.
// Backwards-compatible: writes both `characterShots[]` AND `characterShot`
// (= the first/primary slot) so older pipeline code keeps working.

import { Plus, X, Users } from 'lucide-react';
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
} as const;

interface Props {
  characters: ComposerCharacter[];
  value?: CharacterShot[];
  /** Backwards-compat: legacy single-slot value. */
  legacyValue?: CharacterShot;
  onChange: (next: CharacterShot[]) => void;
  language?: Lang;
}

function normalizeValue(value?: CharacterShot[], legacy?: CharacterShot): CharacterShot[] {
  if (value && value.length > 0) return value.filter((s) => s.shotType !== 'absent');
  if (legacy && legacy.shotType !== 'absent') return [legacy];
  return [];
}

export function CharacterCastPicker({
  characters,
  value,
  legacyValue,
  onChange,
  language = 'en',
}: Props) {
  if (!characters || characters.length === 0) return null;
  const lang: Lang = language;
  const cast = normalizeValue(value, legacyValue);
  const inCast = new Set(cast.map((s) => s.characterId));
  const available = characters.filter((c) => !inCast.has(c.id));

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
          const ch = characters.find((c) => c.id === slot.characterId);
          const meta = SHOT_TYPE_META[slot.shotType] ?? SHOT_TYPE_META.full;
          return (
            <div
              key={slot.characterId}
              className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 pl-0.5 pr-1 py-0.5"
            >
              {ch?.referenceImageUrl ? (
                <img
                  src={ch.referenceImageUrl}
                  alt={ch.name}
                  className="h-5 w-5 rounded-full object-cover"
                />
              ) : (
                <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[8px] font-bold">
                  {ch?.name?.[0] ?? '?'}
                </div>
              )}
              <span className="text-[10px] font-medium px-1">{ch?.name ?? '—'}</span>

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

        {cast.length < MAX_CAST && available.length > 0 && (
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
            <PopoverContent align="start" className="w-56 p-1">
              <div className="space-y-0.5">
                {available.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => addSlot(c.id)}
                    className="flex items-center gap-2 w-full px-2 py-1.5 rounded hover:bg-muted text-left"
                  >
                    {c.referenceImageUrl ? (
                      <img
                        src={c.referenceImageUrl}
                        alt={c.name}
                        className="h-6 w-6 rounded-full object-cover"
                      />
                    ) : (
                      <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold">
                        {c.name[0]}
                      </div>
                    )}
                    <span className="text-xs">{c.name}</span>
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        )}

        {cast.length >= MAX_CAST && (
          <span className="text-[10px] text-amber-400/80 italic">{LABELS.full[lang]}</span>
        )}
      </div>

      {cast.length >= 2 && (
        <p className="text-[10px] text-muted-foreground/80 leading-tight">{LABELS.hint[lang]}</p>
      )}
    </div>
  );
}
