import { Check, X } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { VISUAL_STYLES, type ComposerVisualStyle } from '@/config/composerVisualStyles';
import {
  getCompatibility,
  compatibilityDotClass,
  type AIVideoModel,
} from '@/config/modelStyleCompatibility';
import { cn } from '@/lib/utils';

interface StylePickerCompactProps {
  /** Selected style — `null` means "no style hint, free prompt". */
  value: ComposerVisualStyle | null;
  onChange: (style: ComposerVisualStyle | null) => void;
  /** Which AI model the picker is for — drives the suitability dot. */
  model: AIVideoModel;
  /** UI language for labels & tooltips. */
  language?: 'de' | 'en' | 'es';
  className?: string;
}

const LABELS = {
  de: { none: 'Kein Stil', noneDesc: 'Prompt unverändert verwenden', clear: 'Stil entfernen' },
  en: { none: 'No style', noneDesc: 'Use prompt as-is', clear: 'Clear style' },
  es: { none: 'Sin estilo', noneDesc: 'Usar prompt tal cual', clear: 'Quitar estilo' },
};

export function StylePickerCompact({
  value,
  onChange,
  model,
  language = 'de',
  className,
}: StylePickerCompactProps) {
  const labels = LABELS[language] ?? LABELS.de;

  return (
    <TooltipProvider delayDuration={200}>
      <div className={cn('flex flex-wrap gap-2', className)}>
        {/* "No style" chip */}
        <button
          type="button"
          onClick={() => onChange(null)}
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border text-xs font-medium transition-all',
            value === null
              ? 'border-primary bg-primary/10 text-foreground ring-1 ring-primary/30'
              : 'border-border bg-background hover:border-primary/40 text-muted-foreground',
          )}
        >
          <X className="h-3 w-3" />
          {labels.none}
        </button>

        {VISUAL_STYLES.map((style) => {
          const compat = getCompatibility(model, style.id);
          const isActive = value === style.id;
          return (
            <Tooltip key={style.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onChange(style.id)}
                  className={cn(
                    'relative inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border text-xs font-medium transition-all',
                    isActive
                      ? 'border-primary bg-primary/10 text-foreground ring-1 ring-primary/30'
                      : 'border-border bg-background hover:border-primary/40 text-foreground/80',
                  )}
                >
                  <span className="text-sm leading-none">{style.glyph}</span>
                  <span>{style.label[language]}</span>
                  {/* Compatibility dot */}
                  <span
                    aria-hidden
                    className={cn(
                      'h-1.5 w-1.5 rounded-full ml-0.5',
                      compatibilityDotClass(compat.level),
                    )}
                  />
                  {isActive && <Check className="h-3 w-3 text-primary ml-0.5" />}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[240px]">
                <div className="space-y-1">
                  <p className="font-semibold text-xs">
                    {style.glyph} {style.label[language]}
                  </p>
                  <p className="text-xs opacity-80">{style.desc[language]}</p>
                  <div className="pt-1 border-t border-border/50">
                    <p className="text-xs flex items-center gap-1.5">
                      <span
                        className={cn(
                          'h-1.5 w-1.5 rounded-full inline-block',
                          compatibilityDotClass(compat.level),
                        )}
                      />
                      {compat.note[language]}
                    </p>
                    {compat.recommend && compat.recommend.length > 0 && (
                      <p className="text-xs opacity-70 mt-0.5">
                        → {compat.recommend.map((m) => m.charAt(0).toUpperCase() + m.slice(1)).join(', ')}
                      </p>
                    )}
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}

        {value !== null && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground"
            onClick={() => onChange(null)}
          >
            <X className="h-3 w-3 mr-1" />
            {labels.clear}
          </Button>
        )}
      </div>
    </TooltipProvider>
  );
}
