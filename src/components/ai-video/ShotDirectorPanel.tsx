import { useEffect, useState } from 'react';
import { Camera, Sun, Move, Crop, RotateCcw, Check, Aperture, Film } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useTranslation } from '@/hooks/useTranslation';
import {
  SHOT_CATEGORIES,
  findOption,
  type ShotCategory,
  type ShotSelection,
} from '@/config/shotDirector';
import { buildShotPromptSuffix, getSelectionCount } from '@/lib/shotDirector/buildShotPromptSuffix';
import { PresetGrid } from '@/components/studio-visual/PresetGrid';
import { getPresetThumbnail } from '@/config/studioPresetThumbnails';

const STORAGE_KEY = 'shotDirector.selection.v1';

const CATEGORY_META: Record<
  ShotCategory,
  { icon: typeof Camera; title: { en: string; de: string; es: string } }
> = {
  framing: {
    icon: Crop,
    title: { en: 'Framing', de: 'Bildausschnitt', es: 'Encuadre' },
  },
  angle: {
    icon: Camera,
    title: { en: 'Camera Angle', de: 'Kamerawinkel', es: 'Ángulo' },
  },
  movement: {
    icon: Move,
    title: { en: 'Movement', de: 'Bewegung', es: 'Movimiento' },
  },
  lighting: {
    icon: Sun,
    title: { en: 'Lighting', de: 'Licht', es: 'Iluminación' },
  },
  camera: {
    icon: Film,
    title: { en: 'Camera Body', de: 'Kamera', es: 'Cámara' },
  },
  lens: {
    icon: Aperture,
    title: { en: 'Lens', de: 'Objektiv', es: 'Objetivo' },
  },
};

interface Props {
  value: ShotSelection;
  onChange: (next: ShotSelection) => void;
  /** Optional preview — the user's current prompt, so we can show the merged final prompt. */
  basePrompt?: string;
}

type Lang = 'en' | 'de' | 'es';

export function ShotDirectorPanel({ value, onChange, basePrompt = '' }: Props) {
  const { language } = useTranslation();
  const lang = (language as Lang) ?? 'en';
  const [showPreview, setShowPreview] = useState(false);

  /* Restore last selection from sessionStorage on mount (Workspace Persistence pattern). */
  useEffect(() => {
    if (getSelectionCount(value) > 0) return;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as ShotSelection;
      if (parsed && typeof parsed === 'object') onChange(parsed);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Persist on change. */
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  }, [value]);

  const setCategory = (cat: ShotCategory, optionId: string | null) => {
    const next: ShotSelection = { ...value };
    if (optionId === null) delete next[cat];
    else next[cat] = optionId;
    onChange(next);
  };

  const reset = () => {
    onChange({});
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  };

  const count = getSelectionCount(value);
  const suffix = buildShotPromptSuffix(value);
  const finalPrompt = [basePrompt.trim(), suffix].filter(Boolean).join(' ');

  return (
    <Card className="p-5 bg-card/60 backdrop-blur-xl border-border/60 space-y-4 relative overflow-hidden">
      {/* Subtle gold accent line — James Bond 2028 */}
      <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-gradient-to-b from-primary/0 via-primary/60 to-primary/0" />

      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-medium flex items-center gap-2">
            <Camera className="h-4 w-4 text-primary" />
            {lang === 'de' ? 'Shot Director' : lang === 'es' ? 'Director de Plano' : 'Shot Director'}
            {count > 0 && (
              <Badge variant="outline" className="border-primary/40 text-primary text-[10px] ml-1">
                {count}/6
              </Badge>
            )}
          </Label>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {lang === 'de'
              ? 'Klick die Cinematografie zusammen — wird automatisch in deinen Prompt integriert.'
              : lang === 'es'
                ? 'Selecciona la cinematografía — se añade automáticamente a tu prompt.'
                : 'Click the cinematography — auto-injected into your prompt.'}
          </p>
        </div>
        {count > 0 && (
          <Button variant="ghost" size="sm" onClick={reset} className="text-muted-foreground hover:text-foreground">
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            {lang === 'de' ? 'Zurücksetzen' : lang === 'es' ? 'Restablecer' : 'Reset'}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {(Object.keys(SHOT_CATEGORIES) as ShotCategory[]).map((cat) => {
          const meta = CATEGORY_META[cat];
          const Icon = meta.icon;
          const selected = findOption(cat, value[cat]);
          const selectedThumb = getPresetThumbnail(cat, value[cat]);
          return (
            <Popover key={cat}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={`relative h-auto p-0 flex flex-col items-stretch text-left whitespace-normal border-border/60 bg-background/40 hover:border-primary/50 transition-all overflow-hidden ${
                    selected ? 'border-primary/60 ring-1 ring-primary/30' : ''
                  }`}
                >
                  <div className="relative aspect-square w-full bg-muted/30 overflow-hidden">
                    {selectedThumb ? (
                      <img
                        src={selectedThumb}
                        alt={selected?.label[lang] ?? ''}
                        loading="lazy"
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Icon className="h-6 w-6 text-muted-foreground/50" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
                    <div className="absolute top-1.5 left-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-sm">
                      <Icon className={`h-2.5 w-2.5 ${selected ? 'text-primary' : 'text-white/70'}`} />
                      <span className="text-[9px] uppercase tracking-wider text-white/90">
                        {meta.title[lang]}
                      </span>
                    </div>
                  </div>
                  <div className="px-2 py-1.5">
                    <span className={`block text-xs font-medium leading-tight truncate ${selected ? 'text-primary' : 'text-foreground/70'}`}>
                      {selected ? selected.label[lang] : lang === 'de' ? 'Wählen…' : lang === 'es' ? 'Elegir…' : 'Choose…'}
                    </span>
                  </div>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[420px] p-3 bg-popover/95 backdrop-blur-xl border-border/60" align="start">
                <div className="mb-2 flex items-center gap-1.5">
                  <Icon className="h-3.5 w-3.5 text-primary" />
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {meta.title[lang]}
                  </span>
                </div>
                <div className="max-h-[460px] overflow-y-auto pr-1">
                  <PresetGrid
                    category={cat}
                    options={SHOT_CATEGORIES[cat]}
                    selectedId={value[cat]}
                    onSelect={(id) => setCategory(cat, id)}
                    lang={lang}
                  />
                </div>
              </PopoverContent>
            </Popover>
          );
        })}
      </div>

      {count > 0 && (
        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={() => setShowPreview((p) => !p)}
            className="text-[11px] text-muted-foreground hover:text-primary transition-colors underline-offset-2 hover:underline"
          >
            {showPreview
              ? lang === 'de' ? 'Final-Prompt verbergen' : lang === 'es' ? 'Ocultar prompt final' : 'Hide final prompt'
              : lang === 'de' ? 'Final-Prompt anzeigen' : lang === 'es' ? 'Mostrar prompt final' : 'Show final prompt'}
          </button>
        </div>
      )}

      <AnimatePresence>
        {showPreview && count > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="rounded-md bg-background/60 border border-primary/20 p-3">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {lang === 'de' ? 'Vorschau (Englisch für maximale Modell-Qualität)' : lang === 'es' ? 'Vista previa (en inglés para máxima calidad)' : 'Preview (English for max model quality)'}
              </Label>
              <p className="mt-2 text-xs leading-relaxed text-foreground/90 font-mono">
                {finalPrompt || suffix}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
