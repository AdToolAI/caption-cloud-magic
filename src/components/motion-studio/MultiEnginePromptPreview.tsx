// Block K-6 — Multi-Engine Prompt Preview
//
// Lets the user preview how the same `PromptSlots` get composed for each of
// the 6 supported AI video engines (Sora 2, Kling 3, Hailuo 2.3, Wan 2.5,
// Seedance 1, Luma Ray 2). Calls the `structured-prompt-compose` edge
// function with `mode: 'compose'` once per model — results are cached in
// component state so switching tabs is instant.
//
// Used inside `SceneCard.tsx` only when:
//   • promptMode === 'structured'
//   • at least one slot is filled
// Helps power-users validate their prompt before switching their scene
// engine to a different provider.

import { useEffect, useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Copy, RefreshCw, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import {
  evaluatePromptLength,
  MODEL_PROMPT_LIMITS,
  type PromptModelKey,
} from '@/lib/motion-studio/promptTokenLimits';
import {
  stitchSlots,
  type PromptSlots,
} from '@/lib/motion-studio/structuredPromptStitcher';

interface MultiEnginePromptPreviewProps {
  slots: PromptSlots;
  language: 'de' | 'en' | 'es';
  /** Initial active tab — usually the scene's current `clipSource`. */
  defaultModel?: PromptModelKey;
}

const MODEL_ORDER: PromptModelKey[] = [
  'ai-sora',
  'ai-kling',
  'ai-hailuo',
  'ai-wan',
  'ai-seedance',
  'ai-luma',
];

interface ModelResult {
  state: 'idle' | 'loading' | 'ready' | 'error';
  prompt?: string;
  error?: string;
}

const t = (lang: string, de: string, en: string, es: string) =>
  lang === 'de' ? de : lang === 'es' ? es : en;

export default function MultiEnginePromptPreview({
  slots,
  language,
  defaultModel = 'ai-sora',
}: MultiEnginePromptPreviewProps) {
  const [active, setActive] = useState<PromptModelKey>(defaultModel);
  const [results, setResults] = useState<Record<PromptModelKey, ModelResult>>(
    () =>
      MODEL_ORDER.reduce(
        (acc, k) => ({ ...acc, [k]: { state: 'idle' } }),
        {} as Record<PromptModelKey, ModelResult>
      )
  );

  // Slot signature — recompose if slots change.
  const signature = JSON.stringify(slots);

  useEffect(() => {
    // Reset cache when slots change.
    setResults(
      MODEL_ORDER.reduce(
        (acc, k) => ({ ...acc, [k]: { state: 'idle' } }),
        {} as Record<PromptModelKey, ModelResult>
      )
    );
  }, [signature]);

  useEffect(() => {
    void loadModel(active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, signature]);

  const loadModel = async (model: PromptModelKey, force = false) => {
    setResults((prev) => {
      if (!force && prev[model].state === 'ready') return prev;
      return { ...prev, [model]: { state: 'loading' } };
    });
    try {
      const { data, error } = await supabase.functions.invoke(
        'structured-prompt-compose',
        {
          body: {
            mode: 'compose',
            slots,
            language,
            targetModel: model,
          },
        }
      );
      if (error) throw error;
      const prompt: string | undefined = data?.prompt;
      if (!prompt) throw new Error('Empty response');
      setResults((prev) => ({
        ...prev,
        [model]: { state: 'ready', prompt },
      }));
    } catch (e: any) {
      console.error('[MultiEnginePromptPreview] compose failed', model, e);
      // Fallback to local deterministic stitch so the user still sees
      // *something* per model.
      const fallback = stitchSlots(slots);
      setResults((prev) => ({
        ...prev,
        [model]: {
          state: 'error',
          prompt: fallback,
          error: e?.message ?? 'AI compose failed',
        },
      }));
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: t(language, 'In Zwischenablage kopiert', 'Copied to clipboard', 'Copiado al portapapeles'),
      });
    } catch {
      toast({
        title: t(language, 'Kopieren fehlgeschlagen', 'Copy failed', 'Falló la copia'),
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="rounded-md border border-primary/20 bg-background/40 p-2 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {t(language, 'Multi-Engine Vorschau', 'Multi-Engine Preview', 'Vista previa multi-motor')}
        </span>
        <Badge variant="outline" className="text-[8px] h-3.5 px-1 border-primary/30 text-primary/80">
          {t(language, '6 Modelle', '6 models', '6 modelos')}
        </Badge>
      </div>

      <Tabs value={active} onValueChange={(v) => setActive(v as PromptModelKey)}>
        <TabsList className="h-7 w-full justify-start gap-0.5 bg-muted/40 p-0.5">
          {MODEL_ORDER.map((m) => (
            <TabsTrigger
              key={m}
              value={m}
              className="h-6 px-1.5 text-[9px] data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
            >
              {MODEL_PROMPT_LIMITS[m].label}
            </TabsTrigger>
          ))}
        </TabsList>

        {MODEL_ORDER.map((m) => {
          const r = results[m];
          const status = r.prompt ? evaluatePromptLength(r.prompt, m) : null;
          const limit = MODEL_PROMPT_LIMITS[m];
          return (
            <TabsContent key={m} value={m} className="mt-2 space-y-1.5">
              {r.state === 'loading' && (
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground py-3 justify-center">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {t(language, 'Komponiere für', 'Composing for', 'Componiendo para')} {limit.label}…
                </div>
              )}

              {r.prompt && (
                <>
                  <div className="rounded border border-border/40 bg-background/60 p-2 max-h-32 overflow-y-auto">
                    <p className="text-[10px] font-mono leading-relaxed text-foreground/80 break-words whitespace-pre-line">
                      {r.prompt}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[9px]">
                    {status && (
                      <span
                        className={
                          status.level === 'over'
                            ? 'text-destructive font-semibold'
                            : status.level === 'warn'
                            ? 'text-amber-500'
                            : 'text-muted-foreground'
                        }
                      >
                        {status.count}/{limit.hard}{' '}
                        {limit.unit === 'words'
                          ? t(language, 'Wörter', 'words', 'palabras')
                          : t(language, 'Zeichen', 'chars', 'caracteres')}
                      </span>
                    )}
                    <div className="flex items-center gap-1 ml-auto">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-5 px-1.5 text-[9px] gap-1"
                        onClick={() => loadModel(m, true)}
                        disabled={r.state === 'loading'}
                      >
                        <RefreshCw className="h-2.5 w-2.5" />
                        {t(language, 'Neu', 'Refresh', 'Recargar')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-5 px-1.5 text-[9px] gap-1"
                        onClick={() => copyToClipboard(r.prompt!)}
                      >
                        <Copy className="h-2.5 w-2.5" />
                        {t(language, 'Kopieren', 'Copy', 'Copiar')}
                      </Button>
                    </div>
                  </div>
                  {r.state === 'error' && (
                    <div className="flex items-start gap-1 text-[9px] text-amber-500">
                      <AlertTriangle className="h-2.5 w-2.5 mt-0.5 flex-shrink-0" />
                      <span>
                        {t(
                          language,
                          'KI-Komposition fehlgeschlagen — lokale Fallback-Stitch wird angezeigt.',
                          'AI compose failed — showing local fallback stitch.',
                          'Falló la composición IA — mostrando stitch local de respaldo.'
                        )}
                      </span>
                    </div>
                  )}
                </>
              )}
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
