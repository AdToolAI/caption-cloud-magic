/**
 * SceneActionField — reusable textarea + auto-EN translation preview.
 *
 * Used for both the Scene-level action ("Was passiert in der Szene?") and
 * the per-Character-slot action ("Was tut Sarah?") in the Composer.
 *
 * The user types in their UI language; `useAutoTranslateEn` produces a
 * cached English translation that is surfaced read-only below the box and
 * pushed to the parent via `onEnglishChange`. Empty input → empty english
 * → upstream prompt-injection drops the corresponding marker.
 */
import { useEffect } from 'react';
import { Languages, Loader2, Lock, Unlock } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useAutoTranslateEn, type TranslateLang } from '@/hooks/useAutoTranslateEn';

type Lang = 'en' | 'de' | 'es';

interface Props {
  /** Source-language text (what the user typed). */
  value: string;
  /** Auto-translated English value (cached). */
  englishValue?: string;
  onChange: (next: string) => void;
  onEnglishChange: (english: string) => void;
  /** UI language — also the translation source language. */
  language: Lang;
  label: string;
  placeholder?: string;
  /** Compact density for per-cast-slot rendering. */
  size?: 'sm' | 'md';
  rows?: number;
  disabled?: boolean;
}

const T = {
  en: { auto: 'Auto-EN', locked: 'Manual override', empty: 'Director-generated', live: 'Translating…', err: 'Translation failed — original text will be used' },
  de: { auto: 'Auto-EN', locked: 'Manuell — überstimmt Director', empty: 'Director-Output regiert', live: 'Übersetze…', err: 'Übersetzung fehlgeschlagen — Original wird verwendet' },
  es: { auto: 'Auto-EN', locked: 'Manual — anula Director', empty: 'Output del Director', live: 'Traduciendo…', err: 'Falló la traducción — se usa el original' },
} as const;

export default function SceneActionField({
  value,
  englishValue,
  onChange,
  onEnglishChange,
  language,
  label,
  placeholder,
  size = 'md',
  rows = 2,
  disabled = false,
}: Props) {
  const L = T[language] ?? T.en;
  const sourceLang: TranslateLang = language;

  const { english, isLoading, error } = useAutoTranslateEn(value, sourceLang, {
    delayMs: 500,
    enabled: !disabled,
  });

  // Push the canonical English value to the parent whenever it changes.
  useEffect(() => {
    if ((value ?? '').trim() && !english.trim() && (englishValue ?? '').trim()) return;
    if (english !== englishValue) onEnglishChange(english);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [english, value, englishValue]);

  const locked = (value ?? '').trim().length > 0;
  const compact = size === 'sm';
  const textSize = compact ? 'text-[11px]' : 'text-xs';

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <label className={`${compact ? 'text-[9px]' : 'text-[10px]'} text-muted-foreground font-medium uppercase tracking-wide`}>
          {label}
        </label>
        <div className="flex items-center gap-1">
          <Badge
            variant="outline"
            className={`h-4 px-1.5 text-[9px] gap-1 ${sourceLang === 'en' ? 'opacity-50' : ''}`}
            title={sourceLang === 'en' ? 'No translation needed' : `${sourceLang.toUpperCase()} → EN`}
          >
            <Languages className="h-2.5 w-2.5" />
            {L.auto}
          </Badge>
          {locked ? (
            <Badge variant="outline" className="h-4 px-1.5 text-[9px] gap-1 border-primary/40 text-primary" title={L.locked}>
              <Lock className="h-2.5 w-2.5" />
            </Badge>
          ) : (
            <Badge variant="outline" className="h-4 px-1.5 text-[9px] gap-1 opacity-60" title={L.empty}>
              <Unlock className="h-2.5 w-2.5" />
            </Badge>
          )}
        </div>
      </div>

      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        className={`${textSize} min-h-0 resize-none`}
      />

      {/* English preview (only when source ≠ EN and user has typed something) */}
      {sourceLang !== 'en' && (english.trim() || isLoading) && (
        <div className={`flex items-start gap-1.5 ${compact ? 'text-[9px]' : 'text-[10px]'} text-muted-foreground/80 leading-snug pl-1`}>
          {isLoading ? (
            <Loader2 className="h-2.5 w-2.5 animate-spin mt-0.5 flex-shrink-0" />
          ) : (
            <span className="text-primary/70 font-mono mt-px flex-shrink-0">→</span>
          )}
          <span className="italic break-words">
            {isLoading ? L.live : english}
          </span>
        </div>
      )}
      {error && (
        <p className="text-[9px] text-amber-500/80 pl-1">{L.err}</p>
      )}
    </div>
  );
}
