import { tx } from "@/lib/i18nText";
import { User, Footprints, Hand, Eye, Sun, Minus, UserSquare2, X } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import type { CharacterShot, CharacterShotType, ComposerCharacter } from '@/types/video-composer';

type Lang = 'en' | 'de' | 'es';
const // REMOVE_LABEL was here





export const SHOT_TYPE_META: Record<
  CharacterShotType,
  { label: string; icon: any; hint: string; tone: string }
> = {
  full:       { label: tx({ de: 'Voll', en: 'Full', es: 'Completo' }), icon: User,        hint: tx({ de: 'Full Shot — Gesicht & Körper sichtbar (Establishing).', en: 'Full Shot — Face & body visible (Establishing).', es: 'Plano general: cara y cuerpo visibles (establecimiento).' }), tone: 'text-amber-400 border-amber-500/40 bg-amber-500/10' },
  profile:    { label: 'Profil', icon: UserSquare2, hint: tx({ de: 'Profil/Seitenansicht — Konsistenz über Kleidung.', en: 'Profile/Side View — Consistency over clothing.', es: 'Vista de perfil/lateral: consistencia sobre la ropa.' }), tone: 'text-sky-400 border-sky-500/40 bg-sky-500/10' },
  back:       { label: 'Rücken', icon: Footprints,  hint: tx({ de: 'Rückenansicht / über die Schulter.', en: 'Back view / over the shoulder.', es: 'Vista posterior/sobre el hombro.' }), tone: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10' },
  detail:     { label: 'Detail', icon: Hand,        hint: 'Detail-Shot (Hände, Schwert, Krone) — sehr konsistent.', tone: 'text-violet-400 border-violet-500/40 bg-violet-500/10' },
  pov:        { label: 'POV',    icon: Eye,         hint: tx({ de: 'POV — Charakter unsichtbar, zeigt was er sieht.', en: 'POV — Character invisible, shows what he sees.', es: 'POV: personaje invisible, muestra lo que ve.' }), tone: 'text-cyan-400 border-cyan-500/40 bg-cyan-500/10' },
  silhouette: { label: 'Silhouette', icon: Sun,     hint: tx({ de: 'Silhouette / Gegenlicht — Identifier statt Gesicht.', en: 'Silhouette / Backlight — Identifier instead of face.', es: 'Silueta / Contraluz — Identificador en lugar de cara.' }), tone: 'text-orange-400 border-orange-500/40 bg-orange-500/10' },
  absent:     { label: tx({ de: 'Ohne', en: 'None', es: 'Ninguno' }),   icon: Minus,       hint: tx({ de: 'Charakter nicht in dieser Szene.', en: 'Character not in this scene.', es: 'Personaje no en esta escena.' }), tone: 'text-muted-foreground border-border/40 bg-muted/40' },


const SHOT_ORDER: CharacterShotType[] = ['full', 'profile', 'back', 'detail', 'pov', 'silhouette', 'absent'];

interface BadgeProps {
  shot: CharacterShot;
  characterName?: string;
}

export function CharacterShotBadge({ shot, characterName }: BadgeProps) {
  const meta = SHOT_TYPE_META[shot.shotType];
  if (!meta) return null;
  const Icon = meta.icon;
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border ${meta.tone}`}
          >
            <Icon className="h-3 w-3" />
            {characterName ? `${characterName} · ${meta.label}` : meta.label}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[260px] text-xs">
          <p className="font-medium mb-1">{tx({ de: 'Shot-Strategie:', en: 'Shot strategy:', es: 'Estrategia de toma:' })} {meta.label}</p>
          <p className="text-muted-foreground">{meta.hint}</p>
          <p className="text-[10px] text-muted-foreground/80 mt-1.5 italic">
            {tx({ de: 'Weniger Gesichts-Closeups → konsistentere Charakter-Wahrnehmung.', en: 'Fewer facial close-ups → more consistent character perception.', es: 'Menos primeros planos faciales → percepción del personaje más consistente.' })}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface PickerProps {
  characters: ComposerCharacter[];
  value?: CharacterShot;
  onChange: (next?: CharacterShot) => void;
  language?: Lang;
}

/**
 * Manual override for the per-scene character shot strategy.
 * Renders nothing when no characters are defined in the briefing.
 */
export function CharacterShotPicker({ characters, value, onChange, language = 'en' }: PickerProps) {
  if (!characters || characters.length === 0) return null;

  const lang: Lang = (language as Lang) ?? 'en';
  const charId = value?.characterId || '__none__';
  const shotType: CharacterShotType = value?.shotType || 'absent';
  const hasCharacter = charId !== '__none__';
  const noneLabel = tx({ de: '— keiner —', en: '— none —', es: '— ninguno —' });
  const characterLabel = tx({ de: 'Charakter:', en: 'Character:', es: 'Personaje:' });

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-[10px] text-muted-foreground">{characterLabel}</span>
      <Select
        value={charId}
        onValueChange={(v) => {
          if (v === '__none__') {
            onChange(undefined);
          } else {
            onChange({ characterId: v, shotType: shotType === 'absent' ? 'full' : shotType });
          }
        }}
      >
        <SelectTrigger className="h-6 w-auto gap-1 text-[10px] border-border/40 bg-background/50 px-2">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__" className="text-xs">{noneLabel}</SelectItem>
          {characters.map((c) => (
            <SelectItem key={c.id} value={c.id} className="text-xs">
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasCharacter && (
        <>
          <Select
            value={shotType}
            onValueChange={(v) => onChange({ characterId: charId, shotType: v as CharacterShotType })}
          >
            <SelectTrigger className="h-6 w-auto gap-1 text-[10px] border-border/40 bg-background/50 px-2">
              <SelectValue />
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

          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  onClick={() => onChange(undefined)}
                  aria-label={tx({ de: 'Charakter aus dieser Szene entfernen', en: 'Remove character from this scene', es: 'Quitar personaje de esta escena' })}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                {tx({ de: 'Charakter aus dieser Szene entfernen', en: 'Remove character from this scene', es: 'Quitar personaje de esta escena' })}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </>
      )}
    </div>
  );
}
