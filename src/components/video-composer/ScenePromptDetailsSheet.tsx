/**
 * ScenePromptDetailsSheet — Phase 1 of the "Studio Set" simplification.
 *
 * Consolidates everything that used to live as three separate, always-visible
 * prompt previews on the SceneCard:
 *   1. DirectorConsolePreview (token-coloured "DIRECTOR CONSOLE — LIVE PROMPT")
 *   2. The composePromptLayers "Finaler Prompt (Vorschau)" IIFE block
 *   3. The Multi-Engine Preview launcher
 *   4. The Compare-Lab launcher
 *
 * They're now hidden behind a single small "Prompt-Details" button under the
 * editable AI-Prompt textarea. Power-users open once; ordinary customers no
 * longer see the same prompt three times in a row.
 *
 * Pure presentation — does not own any state or mutate the scene.
 */
import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { ChevronUp, ChevronDown, Sparkles, Beaker } from 'lucide-react';
import DirectorConsolePreview from './director-console/DirectorConsolePreview';
import MultiEnginePromptPreview from '@/components/motion-studio/MultiEnginePromptPreview';
import { composePromptLayers } from '@/lib/motion-studio/composePromptLayers';
import { hasAnySlot, type PromptSlots } from '@/lib/motion-studio/structuredPromptStitcher';
import { clipSourceToModelKey } from '@/lib/motion-studio/promptTokenLimits';
import type { ComposerScene } from '@/types/video-composer';

type Lang = 'de' | 'en' | 'es';

interface BrandCharacterInput {
  name: string;
  identityCardPrompt?: string;
  referenceImageUrl?: string;
  appliesToScene?: boolean;
  usePortraitAsFirstFrame?: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scene: ComposerScene;
  language: Lang;
  promptMode: 'free' | 'structured';
  promptSlots: PromptSlots;
  promptSlotOrder: any;
  brandCharacterInput?: BrandCharacterInput;
  libCharacters: any[];
  libLocations: any[];
  /** Project cast — forwarded to DirectorConsolePreview for the [4 PERFORMANCE] block. */
  characters?: Array<{ id: string; name: string }>;
  onOpenCompareLab: () => void;
}


const t = {
  de: {
    title: 'Prompt-Details',
    description: 'Was die KI tatsächlich bekommt — Live-Prompt, Layer-Aufschlüsselung, Multi-Engine-Vergleich.',
    livePrompt: 'Live Prompt (so wird er an die KI geschickt)',
    finalPrompt: 'Komponierter Final-Prompt',
    layers: 'Layer-Details',
    layersHide: 'Details ausblenden',
    multiEngine: 'Multi-Engine Vorschau',
    multiEngineShow: 'Multi-Engine Vorschau anzeigen',
    multiEngineHide: 'Multi-Engine ausblenden',
    compare: 'Auf Engines vergleichen',
    deduped: 'entfernt (Dedup)',
    nothing: 'Noch kein Prompt — schreibe etwas in die Textarea.',
  },
  en: {
    title: 'Prompt details',
    description: 'What the AI actually receives — live prompt, layer breakdown, multi-engine comparison.',
    livePrompt: 'Live prompt (what gets sent to the AI)',
    finalPrompt: 'Composed final prompt',
    layers: 'Layer details',
    layersHide: 'Hide details',
    multiEngine: 'Multi-engine preview',
    multiEngineShow: 'Show multi-engine preview',
    multiEngineHide: 'Hide multi-engine',
    compare: 'Compare on engines',
    deduped: 'deduped',
    nothing: 'No prompt yet — type something in the textarea.',
  },
  es: {
    title: 'Detalles del prompt',
    description: 'Lo que realmente recibe la IA — prompt en vivo, desglose de capas, comparación multi-motor.',
    livePrompt: 'Prompt en vivo (lo que se envía a la IA)',
    finalPrompt: 'Prompt final compuesto',
    layers: 'Detalles de capas',
    layersHide: 'Ocultar detalles',
    multiEngine: 'Vista previa multi-motor',
    multiEngineShow: 'Mostrar vista previa multi-motor',
    multiEngineHide: 'Ocultar multi-motor',
    compare: 'Comparar en motores',
    deduped: 'eliminados (dedup)',
    nothing: 'Aún no hay prompt — escribe algo en el área de texto.',
  },
} as const;

export default function ScenePromptDetailsSheet({
  open,
  onOpenChange,
  scene,
  language,
  promptMode,
  promptSlots,
  promptSlotOrder,
  brandCharacterInput,
  libCharacters,
  libLocations,
  characters,
  onOpenCompareLab,
}: Props) {

  const [layersOpen, setLayersOpen] = useState(false);
  const [multiEngineOpen, setMultiEngineOpen] = useState(false);
  const L = t[language];

  const composed = composePromptLayers({
    rawPrompt: scene.aiPrompt || '',
    directorModifiers: scene.directorModifiers,
    shotDirector: scene.shotDirector,
    cinematicStylePresetId: (scene as any).cinematicStylePresetId,
    brandCharacter: brandCharacterInput,
    libraryCharacters: libCharacters,
    libraryLocations: libLocations,
  });
  const hasContent =
    Boolean(composed.finalPrompt) ||
    composed.layers.some((l) => l.source !== 'rawPrompt' && l.applied);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            {L.title}
          </DialogTitle>
          <DialogDescription>{L.description}</DialogDescription>
        </DialogHeader>

        {!hasContent && (
          <p className="text-sm text-muted-foreground py-8 text-center">{L.nothing}</p>
        )}

        {hasContent && (
          <div className="space-y-4">
            {/* 1) Director Console — token-coloured live prompt */}
            <div>
              <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">
                {L.livePrompt}
              </Label>
              <DirectorConsolePreview scene={scene} language={language} className="mt-1" />
            </div>

            {/* 2) Composed final prompt + layer breakdown */}
            <div className="rounded-md border border-dashed border-primary/30 bg-background/40 p-3">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-[10px] text-muted-foreground">
                  {L.finalPrompt}
                  {composed.dropped.length > 0 && (
                    <span className="ml-1 text-[9px] text-amber-400/80">
                      · {composed.dropped.length} {L.deduped}
                    </span>
                  )}
                </Label>
                <div className="flex items-center gap-1">
                  {composed.referenceImageUrl && (
                    <Badge variant="outline" className="text-[9px] h-4 px-1 border-primary/40 text-primary">i2v ref</Badge>
                  )}
                  {composed.negativePrompt && (
                    <Badge variant="outline" className="text-[9px] h-4 px-1 border-amber-500/40 text-amber-400">neg</Badge>
                  )}
                  {brandCharacterInput && composed.layers.find((l) => l.source === 'brandCharacter')?.applied && (
                    <Badge variant="outline" className="text-[9px] h-4 px-1 border-emerald-500/40 text-emerald-400">brand</Badge>
                  )}
                </div>
              </div>
              <p className="text-[11px] font-mono leading-relaxed text-foreground/80 break-words whitespace-pre-line">
                {composed.finalPrompt || '—'}
              </p>
              <button
                type="button"
                className="mt-2 flex items-center gap-1 text-[10px] text-primary/80 hover:text-primary"
                onClick={() => setLayersOpen((v) => !v)}
              >
                {layersOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                {layersOpen ? L.layersHide : L.layers}
              </button>
              {layersOpen && (
                <div className="mt-2 space-y-1.5 border-t border-primary/20 pt-2">
                  {composed.layers.map((l, i) => (
                    <div key={i} className="text-[10px] flex gap-1.5">
                      <span className={`font-semibold shrink-0 w-32 ${l.applied ? 'text-primary/80' : 'text-muted-foreground/40 line-through'}`}>
                        {l.label}
                      </span>
                      <span className={`font-mono break-words ${l.applied ? 'text-foreground/70' : 'text-muted-foreground/40 line-through'}`}>
                        {l.text || '—'}
                      </span>
                    </div>
                  ))}
                  {composed.negativePrompt && (
                    <div className="text-[10px] flex gap-1.5">
                      <span className="font-semibold shrink-0 w-32 text-amber-400/80">negative_prompt →</span>
                      <span className="font-mono text-amber-300/70 break-words">{composed.negativePrompt}</span>
                    </div>
                  )}
                  {composed.dropped.length > 0 && (
                    <div className="text-[10px] flex gap-1.5">
                      <span className="font-semibold shrink-0 w-32 text-amber-400/60">axis dedup ✂</span>
                      <span className="font-mono text-amber-300/50 break-words line-through">
                        {composed.dropped.map((d) => `${d.text} (${d.source})`).join(' · ')}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 3) Multi-Engine Preview — only meaningful in structured mode */}
            {promptMode === 'structured' && hasAnySlot(promptSlots) && (
              <div>
                <button
                  type="button"
                  onClick={() => setMultiEngineOpen((v) => !v)}
                  className="text-[11px] text-primary/80 hover:text-primary flex items-center gap-1"
                >
                  <Sparkles className="h-3 w-3" />
                  {multiEngineOpen ? L.multiEngineHide : L.multiEngineShow}
                </button>
                {multiEngineOpen && (
                  <div className="mt-2">
                    <MultiEnginePromptPreview
                      slots={promptSlots}
                      language={language}
                      order={promptSlotOrder}
                      defaultModel={clipSourceToModelKey(scene.clipSource) ?? 'ai-sora'}
                    />
                  </div>
                )}
              </div>
            )}

            {/* 4) Compare-Lab launcher */}
            <div className="pt-2 border-t border-primary/10">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  onOpenChange(false);
                  onOpenCompareLab();
                }}
                className="gap-1.5"
              >
                <Beaker className="h-3.5 w-3.5" />
                {L.compare}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
