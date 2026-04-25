// Block K-1 — Structured Prompt Builder
//
// Slot-based prompt UI that complements the free-text editor. Users can
// switch between "📝 Free Text" and "🧱 Structured" mode. In structured
// mode, six labeled fields capture Subject / Action / Setting / Time-Weather
// / Style / Negative — each with an inline ✨ AI-Suggest button (powered by
// the `structured-prompt-compose` edge function in `mode: 'suggest'`).
//
// The component owns NO state — all changes are forwarded to the parent so
// the SceneCard remains the single source of truth for `promptSlots`.

import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Loader2, Dices, Save, Wand2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import {
  SLOT_KEYS,
  SLOT_META,
  hasAnySlot,
  type PromptSlots,
} from '@/lib/motion-studio/structuredPromptStitcher';
import {
  evaluatePromptLength,
  clipSourceToModelKey,
  MODEL_PROMPT_LIMITS,
  type PromptModelKey,
} from '@/lib/motion-studio/promptTokenLimits';

interface StructuredPromptBuilderProps {
  slots: PromptSlots;
  onChange: (slots: PromptSlots) => void;
  /** Used to size token-limit warnings to the actual target model. */
  clipSource: string;
  /** Free-text fallback used as context when generating slot suggestions. */
  contextHint?: string;
  /** Currently composed prompt (final stitched + enriched) — for token bar. */
  composedPrompt: string;
  language: string;
  onInspireMe?: () => void;
  onSavePreset?: () => void;
  onOpenStylePresets?: () => void;
}

const t = (lang: string, de: string, en: string, es: string) =>
  lang === 'de' ? de : lang === 'es' ? es : en;

export default function StructuredPromptBuilder({
  slots,
  onChange,
  clipSource,
  contextHint,
  composedPrompt,
  language,
  onInspireMe,
  onSavePreset,
  onOpenStylePresets,
}: StructuredPromptBuilderProps) {
  const [suggestingSlot, setSuggestingSlot] = useState<keyof PromptSlots | null>(null);

  const modelKey: PromptModelKey = clipSourceToModelKey(clipSource) ?? 'ai-sora';
  const limit = MODEL_PROMPT_LIMITS[modelKey];
  const status = evaluatePromptLength(composedPrompt, modelKey);

  const updateSlot = (key: keyof PromptSlots, value: string) => {
    onChange({ ...slots, [key]: value });
  };

  const requestSuggestion = async (key: keyof PromptSlots) => {
    setSuggestingSlot(key);
    try {
      const { data, error } = await supabase.functions.invoke(
        'structured-prompt-compose',
        {
          body: {
            mode: 'suggest',
            slot: key,
            slots,
            language,
            targetModel: modelKey,
            contextHint: contextHint?.slice(0, 600) ?? '',
          },
        }
      );
      if (error) throw error;
      const suggestion: string | undefined = data?.suggestion;
      if (suggestion) {
        updateSlot(key, suggestion);
        toast({
          title: t(language, '✨ Vorschlag eingefügt', '✨ Suggestion inserted', '✨ Sugerencia insertada'),
        });
      } else {
        throw new Error('Empty suggestion');
      }
    } catch (e: any) {
      console.error('[StructuredPromptBuilder] suggest failed', e);
      toast({
        title: t(language, 'KI-Vorschlag fehlgeschlagen', 'AI suggestion failed', 'Fallo la sugerencia IA'),
        description: e?.message ?? '',
        variant: 'destructive',
      });
    } finally {
      setSuggestingSlot(null);
    }
  };

  const counted = hasAnySlot(slots);
  const filledCount = SLOT_KEYS.filter((k) => (slots[k] ?? '').trim().length > 0).length;

  const tokenBarColor =
    status.level === 'over'
      ? 'bg-destructive'
      : status.level === 'warn'
      ? 'bg-amber-500'
      : 'bg-primary';

  return (
    <div className="space-y-2 rounded-md border border-primary/30 bg-gradient-to-br from-primary/5 to-background/40 p-2">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-primary">
          <Wand2 className="h-3 w-3" />
          {t(language, 'Strukturierter Builder', 'Structured Builder', 'Constructor estructurado')}
          {counted && (
            <Badge variant="secondary" className="h-4 px-1 text-[9px]">
              {filledCount}/{SLOT_KEYS.length}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          {onOpenStylePresets && (
            <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] gap-1" onClick={onOpenStylePresets}>
              <Sparkles className="h-3 w-3" />
              {t(language, 'Styles', 'Styles', 'Estilos')}
            </Button>
          )}
          {onInspireMe && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[10px] gap-1"
              onClick={onInspireMe}
              title={t(language, 'Würfle eine Szene', 'Roll a scene', 'Lanza una escena')}
            >
              <Dices className="h-3 w-3" />
            </Button>
          )}
          {onSavePreset && counted && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[10px] gap-1"
              onClick={onSavePreset}
              title={t(language, 'Als Style speichern', 'Save as style', 'Guardar como estilo')}
            >
              <Save className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Slots */}
      <div className="grid gap-1.5">
        {SLOT_KEYS.map((key) => {
          const meta = SLOT_META[key];
          const value = slots[key] ?? '';
          const isSuggesting = suggestingSlot === key;
          const InputComp = meta.multiline ? Textarea : Input;
          return (
            <div key={key} className="space-y-0.5">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <span>{meta.icon}</span>
                  <span>{meta.label[language as 'de' | 'en' | 'es'] ?? meta.label.en}</span>
                </Label>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-5 px-1.5 text-[9px] gap-1 text-primary/70 hover:text-primary"
                  onClick={() => requestSuggestion(key)}
                  disabled={isSuggesting}
                >
                  {isSuggesting ? (
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-2.5 w-2.5" />
                  )}
                  {t(language, 'KI', 'AI', 'IA')}
                </Button>
              </div>
              <InputComp
                value={value}
                onChange={(e: any) => updateSlot(key, e.target.value)}
                placeholder={meta.placeholder[language as 'de' | 'en' | 'es'] ?? meta.placeholder.en}
                className="h-8 text-[11px] py-1 px-2"
                rows={meta.multiline ? 2 : undefined}
              />
            </div>
          );
        })}
      </div>

      {/* Token Bar — live preview of composed prompt length vs model limit */}
      <div className="space-y-1 pt-1 border-t border-border/50">
        <div className="flex items-center justify-between text-[9px]">
          <span className="text-muted-foreground">
            {t(language, 'Länge', 'Length', 'Longitud')} ({limit.label})
          </span>
          <span
            className={
              status.level === 'over'
                ? 'text-destructive font-semibold'
                : status.level === 'warn'
                ? 'text-amber-500'
                : 'text-muted-foreground'
            }
          >
            {status.count} / {limit.hard} {limit.unit === 'words' ? (language === 'de' ? 'Wörter' : language === 'es' ? 'palabras' : 'words') : (language === 'de' ? 'Zeichen' : language === 'es' ? 'caracteres' : 'chars')}
          </span>
        </div>
        <div className="h-1 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full transition-all ${tokenBarColor}`}
            style={{ width: `${status.percent}%` }}
          />
        </div>
        {status.level === 'over' && (
          <p className="text-[9px] text-destructive">
            {t(
              language,
              `⚠ Über dem Limit von ${limit.hard} ${limit.unit === 'words' ? 'Wörtern' : 'Zeichen'} — ${limit.label} schneidet ab.`,
              `⚠ Over the ${limit.hard}-${limit.unit} limit — ${limit.label} will truncate.`,
              `⚠ Por encima del límite de ${limit.hard} ${limit.unit === 'words' ? 'palabras' : 'caracteres'} — ${limit.label} truncará.`
            )}
          </p>
        )}
      </div>
    </div>
  );
}
