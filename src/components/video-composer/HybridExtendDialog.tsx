import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, ArrowRight, Sparkles, Loader2, AlertTriangle } from 'lucide-react';
import {
  useHybridExtend,
  HYBRID_BACKWARD_CAPABLE,
  type HybridMode,
  type HybridEngine,
} from '@/hooks/useHybridExtend';
import { CLIP_SOURCE_LABELS, getClipCost, type ClipQuality } from '@/types/video-composer';

interface HybridExtendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  sourceSceneId: string;
  sourceClipUrl?: string;
  defaultMode?: HybridMode;
  /** Called after a successful extend so the caller can refetch the storyboard. */
  onSuccess?: (newSceneId: string) => void;
  language?: 'de' | 'en' | 'es';
}

const ENGINES: HybridEngine[] = ['ai-kling', 'ai-luma', 'ai-hailuo', 'ai-wan', 'ai-seedance'];

const T = {
  de: {
    title: 'Szene verlängern (Hybrid)',
    desc: 'Generiere eine neue Szene, die optisch nahtlos an die Quelle anschließt.',
    forward: 'Forward (nach hinten)',
    backward: 'Backward (nach vorn)',
    engine: 'AI Engine',
    backwardOnly: 'Nur Kling & Luma unterstützen Backward Extend',
    quality: 'Qualität',
    standard: 'Standard',
    pro: 'Pro',
    duration: 'Dauer',
    seconds: 'Sek.',
    prompt: 'Prompt',
    promptPh: 'Beschreibe, was in der neuen Szene passieren soll …',
    cost: 'Geschätzte Kosten',
    cancel: 'Abbrechen',
    generate: 'Generieren',
    generating: 'Wird erstellt …',
    noPrompt: 'Bitte einen Prompt eingeben.',
  },
  en: {
    title: 'Extend Scene (Hybrid)',
    desc: 'Generate a new scene that seamlessly connects to the source clip.',
    forward: 'Forward (after)',
    backward: 'Backward (before)',
    engine: 'AI Engine',
    backwardOnly: 'Only Kling & Luma support backward extend',
    quality: 'Quality',
    standard: 'Standard',
    pro: 'Pro',
    duration: 'Duration',
    seconds: 'sec',
    prompt: 'Prompt',
    promptPh: 'Describe what should happen in the new scene …',
    cost: 'Estimated cost',
    cancel: 'Cancel',
    generate: 'Generate',
    generating: 'Generating …',
    noPrompt: 'Please enter a prompt.',
  },
  es: {
    title: 'Extender Escena (Híbrido)',
    desc: 'Genera una nueva escena que conecta de forma natural con el clip fuente.',
    forward: 'Forward (después)',
    backward: 'Backward (antes)',
    engine: 'Motor AI',
    backwardOnly: 'Sólo Kling y Luma admiten extensión backward',
    quality: 'Calidad',
    standard: 'Estándar',
    pro: 'Pro',
    duration: 'Duración',
    seconds: 'seg',
    prompt: 'Prompt',
    promptPh: 'Describe lo que debe pasar en la nueva escena …',
    cost: 'Coste estimado',
    cancel: 'Cancelar',
    generate: 'Generar',
    generating: 'Generando …',
    noPrompt: 'Introduce un prompt.',
  },
} as const;

export default function HybridExtendDialog({
  open,
  onOpenChange,
  projectId,
  sourceSceneId,
  sourceClipUrl,
  defaultMode = 'forward',
  onSuccess,
  language = 'de',
}: HybridExtendDialogProps) {
  const t = T[language] ?? T.de;
  const [mode, setMode] = useState<HybridMode>(defaultMode);
  const [engine, setEngine] = useState<HybridEngine>('ai-kling');
  const [quality, setQuality] = useState<ClipQuality>('standard');
  const [duration, setDuration] = useState(5);
  const [prompt, setPrompt] = useState('');

  const { extendScene, isExtending } = useHybridExtend();

  // Auto-switch engine if backward + non-capable selected
  const effectiveEngine: HybridEngine = useMemo(() => {
    if (mode === 'backward' && !HYBRID_BACKWARD_CAPABLE.includes(engine)) {
      return 'ai-kling';
    }
    return engine;
  }, [mode, engine]);

  const cost = getClipCost(effectiveEngine, quality, duration);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    const result = await extendScene({
      projectId,
      sourceSceneId,
      mode,
      engine: effectiveEngine,
      quality,
      prompt: prompt.trim(),
      durationSeconds: duration,
    });
    if (result) {
      onSuccess?.(result.newSceneId);
      onOpenChange(false);
      setPrompt('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            {t.title}
          </DialogTitle>
          <DialogDescription>{t.desc}</DialogDescription>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(v) => setMode(v as HybridMode)} className="mt-2">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="forward" className="gap-2">
              <ArrowRight className="w-4 h-4" /> {t.forward}
            </TabsTrigger>
            <TabsTrigger value="backward" className="gap-2">
              <ArrowLeft className="w-4 h-4" /> {t.backward}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="forward" className="space-y-4 pt-4">
            <EngineSelectorRow
              t={t}
              engine={engine}
              setEngine={setEngine}
              mode="forward"
            />
          </TabsContent>

          <TabsContent value="backward" className="space-y-4 pt-4">
            <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 p-2 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{t.backwardOnly}</span>
            </div>
            <EngineSelectorRow
              t={t}
              engine={effectiveEngine}
              setEngine={setEngine}
              mode="backward"
            />
          </TabsContent>
        </Tabs>

        <div className="space-y-4 pt-2">
          {/* Quality */}
          <div className="space-y-2">
            <Label>{t.quality}</Label>
            <Select value={quality} onValueChange={(v) => setQuality(v as ClipQuality)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">{t.standard}</SelectItem>
                <SelectItem value="pro">{t.pro}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Duration */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label>{t.duration}</Label>
              <span className="text-xs text-muted-foreground">
                {duration} {t.seconds}
              </span>
            </div>
            <Slider
              min={3}
              max={12}
              step={1}
              value={[duration]}
              onValueChange={([v]) => setDuration(v)}
            />
          </div>

          {/* Prompt */}
          <div className="space-y-2">
            <Label>{t.prompt}</Label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={t.promptPh}
              rows={3}
            />
          </div>

          {/* Cost */}
          <div className="flex items-center justify-between text-sm rounded-lg bg-muted/50 px-3 py-2">
            <span className="text-muted-foreground">{t.cost}</span>
            <Badge variant="secondary">€ {cost.toFixed(2)}</Badge>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isExtending}>
            {t.cancel}
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={isExtending || !prompt.trim() || !sourceClipUrl}
          >
            {isExtending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t.generating}
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                {t.generate}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EngineSelectorRow({
  t,
  engine,
  setEngine,
  mode,
}: {
  t: (typeof T)[keyof typeof T];
  engine: HybridEngine;
  setEngine: (e: HybridEngine) => void;
  mode: HybridMode;
}) {
  return (
    <div className="space-y-2">
      <Label>{t.engine}</Label>
      <Select value={engine} onValueChange={(v) => setEngine(v as HybridEngine)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ENGINES.map((eng) => {
            const disabled = mode === 'backward' && !HYBRID_BACKWARD_CAPABLE.includes(eng);
            return (
              <SelectItem key={eng} value={eng} disabled={disabled}>
                <div className="flex items-center gap-2">
                  {CLIP_SOURCE_LABELS[eng].de}
                  {disabled && (
                    <Badge variant="outline" className="text-xs">forward only</Badge>
                  )}
                </div>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}
