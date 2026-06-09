/**
 * PerTurnShotChip — compact popover that lets the user override Shot
 * Director axes (framing/angle/movement/lighting) for a single dialog
 * line, on top of the scene-level Shot Director defaults.
 *
 * Rendered inline next to `DialogTakeStrip` in SceneDialogStudio.
 * Empty selection = inherits scene defaults.
 */
import { useMemo } from 'react';
import { Camera, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  SHOT_CATEGORIES,
  findOption,
  type ShotCategory,
  type ShotSelection,
} from '@/config/shotDirector';

type Lang = 'en' | 'de' | 'es';

const DIALOG_AXES: ShotCategory[] = ['framing', 'angle', 'movement', 'lighting'];

const AXIS_LABEL: Record<ShotCategory, { en: string; de: string; es: string }> = {
  framing:  { en: 'Framing',  de: 'Bildausschnitt', es: 'Encuadre' },
  angle:    { en: 'Angle',    de: 'Winkel',         es: 'Ángulo' },
  movement: { en: 'Movement', de: 'Bewegung',       es: 'Movimiento' },
  lighting: { en: 'Lighting', de: 'Licht',          es: 'Luz' },
  camera:   { en: 'Camera',   de: 'Kamera',         es: 'Cámara' },
  lens:     { en: 'Lens',     de: 'Objektiv',       es: 'Objetivo' },
};

const TRIGGER_LABEL: Record<Lang, string> = {
  en: 'Per-line shot',
  de: 'Shot pro Zeile',
  es: 'Plano por línea',
};

interface Props {
  value: Partial<ShotSelection> | undefined;
  onChange: (next: Partial<ShotSelection>) => void;
  language: Lang;
}

export default function PerTurnShotChip({ value, onChange, language }: Props) {
  const lang: Lang = language ?? 'en';
  const count = useMemo(
    () => DIALOG_AXES.filter((a) => value?.[a]).length,
    [value],
  );

  const setAxis = (cat: ShotCategory, optionId: string | null) => {
    const next: Partial<ShotSelection> = { ...(value ?? {}) };
    if (optionId === null) delete next[cat];
    else next[cat] = optionId;
    onChange(next);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] transition ${
            count > 0
              ? 'border-primary/60 bg-primary/10 text-primary'
              : 'border-border/40 bg-muted/30 text-muted-foreground hover:text-foreground'
          }`}
          title={TRIGGER_LABEL[lang]}
        >
          <Camera className="h-2.5 w-2.5" />
          <span>{TRIGGER_LABEL[lang]}</span>
          {count > 0 && (
            <span className="rounded bg-primary/20 px-1 text-[9px] tabular-nums">{count}</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-2.5" align="start">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {TRIGGER_LABEL[lang]}
          </div>
          {count > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-5 px-1.5 text-[10px]"
              onClick={() => onChange({})}
            >
              <RotateCcw className="mr-1 h-2.5 w-2.5" />
              Reset
            </Button>
          )}
        </div>
        <div className="space-y-2">
          {DIALOG_AXES.map((cat) => {
            const sel = findOption(cat, value?.[cat]);
            return (
              <div key={cat} className="space-y-1">
                <div className="text-[10px] font-medium text-foreground/80">
                  {AXIS_LABEL[cat][lang]}
                </div>
                <div className="flex flex-wrap gap-1">
                  {SHOT_CATEGORIES[cat].slice(0, 8).map((opt) => {
                    const active = sel?.id === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setAxis(cat, active ? null : opt.id)}
                        className={`rounded px-1.5 py-0.5 text-[10px] transition ${
                          active
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
                        }`}
                        title={opt.description[lang]}
                      >
                        {opt.label[lang]}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
