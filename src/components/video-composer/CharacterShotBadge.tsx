import { User, Footprints, Hand, Eye, Sun, Minus, UserSquare2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import type { CharacterShot, CharacterShotType, ComposerCharacter } from '@/types/video-composer';

export const SHOT_TYPE_META: Record<
  CharacterShotType,
  { label: string; icon: any; hint: string; tone: string }
> = {
  full:       { label: 'Voll', icon: User,        hint: 'Full Shot — Gesicht & Körper sichtbar (Establishing).', tone: 'text-amber-400 border-amber-500/40 bg-amber-500/10' },
  profile:    { label: 'Profil', icon: UserSquare2, hint: 'Profil/Seitenansicht — Konsistenz über Kleidung.', tone: 'text-sky-400 border-sky-500/40 bg-sky-500/10' },
  back:       { label: 'Rücken', icon: Footprints,  hint: 'Rückenansicht / über die Schulter.', tone: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10' },
  detail:     { label: 'Detail', icon: Hand,        hint: 'Detail-Shot (Hände, Schwert, Krone) — sehr konsistent.', tone: 'text-violet-400 border-violet-500/40 bg-violet-500/10' },
  pov:        { label: 'POV',    icon: Eye,         hint: 'POV — Charakter unsichtbar, zeigt was er sieht.', tone: 'text-cyan-400 border-cyan-500/40 bg-cyan-500/10' },
  silhouette: { label: 'Silhouette', icon: Sun,     hint: 'Silhouette / Gegenlicht — Identifier statt Gesicht.', tone: 'text-orange-400 border-orange-500/40 bg-orange-500/10' },
  absent:     { label: 'Ohne',   icon: Minus,       hint: 'Charakter nicht in dieser Szene.', tone: 'text-muted-foreground border-border/40 bg-muted/40' },
};

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
          <p className="font-medium mb-1">Shot-Strategie: {meta.label}</p>
          <p className="text-muted-foreground">{meta.hint}</p>
          <p className="text-[10px] text-muted-foreground/80 mt-1.5 italic">
            Weniger Gesichts-Closeups → konsistentere Charakter-Wahrnehmung.
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
}

/**
 * Manual override for the per-scene character shot strategy.
 * Renders nothing when no characters are defined in the briefing.
 */
export function CharacterShotPicker({ characters, value, onChange }: PickerProps) {
  if (!characters || characters.length === 0) return null;

  const charId = value?.characterId || '__none__';
  const shotType: CharacterShotType = value?.shotType || 'absent';

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-[10px] text-muted-foreground">Charakter:</span>
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
          <SelectItem value="__none__" className="text-xs">— keiner —</SelectItem>
          {characters.map((c) => (
            <SelectItem key={c.id} value={c.id} className="text-xs">
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {charId !== '__none__' && (
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
      )}
    </div>
  );
}
