import { useState } from 'react';
import { Camera, Sun, Move, Crop, RotateCcw, Check, Aperture, Film } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  SHOT_CATEGORIES,
  findOption,
  type ShotCategory,
  type ShotSelection,
  type ShotOption,
} from '@/config/shotDirector';
import { buildShotPromptSuffix, getSelectionCount } from '@/lib/shotDirector/buildShotPromptSuffix';

type Lang = 'en' | 'de' | 'es';

const CATEGORY_META: Record<ShotCategory, { icon: typeof Camera; title: { en: string; de: string; es: string } }> = {
  framing: { icon: Crop, title: { en: 'Framing', de: 'Bildausschnitt', es: 'Encuadre' } },
  angle: { icon: Camera, title: { en: 'Angle', de: 'Winkel', es: 'Ángulo' } },
  movement: { icon: Move, title: { en: 'Movement', de: 'Bewegung', es: 'Movimiento' } },
  lighting: { icon: Sun, title: { en: 'Lighting', de: 'Licht', es: 'Luz' } },
  camera: { icon: Film, title: { en: 'Camera', de: 'Kamera', es: 'Cámara' } },
  lens: { icon: Aperture, title: { en: 'Lens', de: 'Objektiv', es: 'Objetivo' } },
};

interface Props {
  value: ShotSelection;
  onChange: (next: ShotSelection) => void;
  language: string;
  /**
   * `popover` (default) — legacy compact mode with 6 popover-buttons.
   * `master-detail` — flat in-dialog layout with axis list (left) and
   * options list (right). No nested popovers, used in SceneStyleSheet.
   */
  layout?: 'popover' | 'master-detail';
}

export default function SceneShotDirectorPanel({ value, onChange, language, layout = 'popover' }: Props) {
  const lang = ((language as Lang) ?? 'en');
  const count = getSelectionCount(value);

  const setCategory = (cat: ShotCategory, optionId: string | null) => {
    const next: ShotSelection = { ...value };
    if (optionId === null) delete next[cat];
    else next[cat] = optionId;
    onChange(next);
  };

  if (layout === 'master-detail') {
    return <MasterDetail value={value} onChange={onChange} lang={lang} count={count} setCategory={setCategory} />;
  }

  return (
    <div className="space-y-2 rounded-md border border-primary/20 bg-primary/5 p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-primary">
          <Camera className="h-3 w-3" />
          {lang === 'de' ? 'Shot Director' : lang === 'es' ? 'Director de Plano' : 'Shot Director'}
          {count > 0 && (
            <Badge variant="secondary" className="h-4 px-1 text-[9px]">{count}/6</Badge>
          )}
        </div>
        {count > 0 && (
          <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => onChange({})}>
            <RotateCcw className="h-3 w-3 mr-1" />
            Reset
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
        {(Object.keys(SHOT_CATEGORIES) as ShotCategory[]).map((cat) => {
          const meta = CATEGORY_META[cat];
          const Icon = meta.icon;
          const selected = findOption(cat, value[cat]);
          return (
            <Popover key={cat}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={`h-auto min-w-0 w-full py-1.5 px-2 flex flex-col items-start gap-0.5 text-left whitespace-normal overflow-hidden ${
                    selected ? 'border-primary/60 bg-primary/10' : ''
                  }`}
                >
                  <div className="flex items-center gap-1 w-full min-w-0">
                    <Icon className={`h-3 w-3 shrink-0 ${selected ? 'text-primary' : 'text-muted-foreground'}`} />
                    <span className="text-[9px] uppercase tracking-wider text-muted-foreground truncate">
                      {meta.title[lang]}
                    </span>
                  </div>
                  <span className={`text-[10px] leading-tight w-full truncate ${selected ? 'text-primary font-medium' : 'text-foreground/60'}`}>
                    {selected ? selected.label[lang] : lang === 'de' ? 'Wählen…' : lang === 'es' ? 'Elegir…' : 'Choose…'}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-1.5" align="start">
                <div className="max-h-64 overflow-y-auto space-y-0.5">
                  {selected && (
                    <button
                      type="button"
                      onClick={() => setCategory(cat, null)}
                      className="w-full text-left px-2 py-1.5 rounded hover:bg-destructive/10 text-destructive text-[11px] flex items-center gap-1.5"
                    >
                      <RotateCcw className="h-3 w-3" />
                      {lang === 'de' ? 'Entfernen' : lang === 'es' ? 'Quitar' : 'Clear'}
                    </button>
                  )}
                  {SHOT_CATEGORIES[cat].map((opt: ShotOption) => {
                    const isActive = value[cat] === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setCategory(cat, opt.id)}
                        className={`w-full text-left px-2 py-1.5 rounded transition-colors flex items-start gap-2 ${
                          isActive ? 'bg-primary/15' : 'hover:bg-accent/40'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className={`text-[11px] font-medium ${isActive ? 'text-primary' : 'text-foreground'}`}>
                            {opt.label[lang]}
                          </div>
                          <div className="text-[10px] text-muted-foreground leading-snug line-clamp-2">
                            {opt.description[lang]}
                          </div>
                        </div>
                        {isActive && <Check className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />}
                      </button>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
          );
        })}
      </div>
    </div>
  );
}

export { buildShotPromptSuffix };
