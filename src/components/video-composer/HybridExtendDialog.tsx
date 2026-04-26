import { useState, useMemo, useEffect } from 'react';
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
import {
  ArrowLeft,
  ArrowRight,
  Sparkles,
  Loader2,
  AlertTriangle,
  Link2,
  Palette,
} from 'lucide-react';
import {
  useHybridExtend,
  HYBRID_BACKWARD_CAPABLE,
  HYBRID_BRIDGE_CAPABLE,
  type HybridMode,
  type HybridEngine,
} from '@/hooks/useHybridExtend';
import { CLIP_SOURCE_LABELS, getClipCost, type ClipQuality } from '@/types/video-composer';

/** Minimal scene shape needed by the dialog for the bridge target picker. */
export interface HybridDialogScene {
  id: string;
  orderIndex: number;
  clipUrl?: string;
  sceneType?: string;
}

interface HybridExtendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  sourceSceneId: string;
  sourceClipUrl?: string;
  defaultMode?: HybridMode;
  /** Other scenes in the project (used as bridge target candidates). */
  availableScenes?: HybridDialogScene[];
  /** Called after a successful extend so the caller can refetch the storyboard. */
  onSuccess?: (newSceneId: string) => void;
  language?: 'de' | 'en' | 'es';
}

const ENGINES: HybridEngine[] = ['ai-kling', 'ai-luma', 'ai-hailuo', 'ai-wan', 'ai-seedance'];

const T = {
  de: {
    title: 'Hybrid Production',
    desc: 'Verbinde, verlängere oder referenziere existierende Szenen.',
    forward: 'Forward',
    backward: 'Backward',
    bridge: 'Bridge',
    styleRef: 'Style-Ref',
    engine: 'AI Engine',
    backwardOnly: 'Nur Kling & Luma unterstützen Backward Extend',
    bridgeOnly: 'Bridge benötigt Kling oder Luma (start + end image)',
    styleRefHint: 'Nutzt den letzten Frame der Quelle als Stil-Anker für eine neue Szene mit eigenem Prompt.',
    bridgeHint: 'Generiert eine Übergangsszene zwischen Quelle und Ziel (morpht von Frame zu Frame).',
    targetScene: 'Ziel-Szene',
    targetPlaceholder: 'Wähle die Szene, in die übergeleitet wird …',
    noTargets: 'Keine weiteren fertigen Szenen verfügbar.',
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
  },
  en: {
    title: 'Hybrid Production',
    desc: 'Connect, extend or reference existing scenes.',
    forward: 'Forward',
    backward: 'Backward',
    bridge: 'Bridge',
    styleRef: 'Style-Ref',
    engine: 'AI Engine',
    backwardOnly: 'Only Kling & Luma support backward extend',
    bridgeOnly: 'Bridge requires Kling or Luma (start + end image)',
    styleRefHint: 'Uses the last frame of the source as a style anchor for a new scene with its own prompt.',
    bridgeHint: 'Generates a transition scene between source and target (morphs frame to frame).',
    targetScene: 'Target scene',
    targetPlaceholder: 'Pick the scene to morph into …',
    noTargets: 'No other completed scenes available.',
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
  },
  es: {
    title: 'Producción Híbrida',
    desc: 'Conecta, extiende o referencia escenas existentes.',
    forward: 'Forward',
    backward: 'Backward',
    bridge: 'Bridge',
    styleRef: 'Style-Ref',
    engine: 'Motor AI',
    backwardOnly: 'Sólo Kling y Luma admiten extensión backward',
    bridgeOnly: 'Bridge requiere Kling o Luma (start + end image)',
    styleRefHint: 'Usa el último frame de la fuente como ancla de estilo para una nueva escena con su propio prompt.',
    bridgeHint: 'Genera una escena de transición entre fuente y destino (morphing frame a frame).',
    targetScene: 'Escena destino',
    targetPlaceholder: 'Elige la escena a la que transicionar …',
    noTargets: 'No hay otras escenas completadas disponibles.',
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
  },
} as const;

export default function HybridExtendDialog({
  open,
  onOpenChange,
  projectId,
  sourceSceneId,
  sourceClipUrl,
  defaultMode = 'forward',
  availableScenes = [],
  onSuccess,
  language = 'de',
}: HybridExtendDialogProps) {
  const t = T[language] ?? T.de;
  const [mode, setMode] = useState<HybridMode>(defaultMode);
  const [engine, setEngine] = useState<HybridEngine>('ai-kling');
  const [quality, setQuality] = useState<ClipQuality>('standard');
  const [duration, setDuration] = useState(5);
  const [prompt, setPrompt] = useState('');
  const [targetSceneId, setTargetSceneId] = useState<string>('');

  const { extendScene, isExtending } = useHybridExtend();

  // Sync mode when defaultMode changes (parent may open dialog for different actions)
  useEffect(() => {
    if (open) setMode(defaultMode);
  }, [defaultMode, open]);

  // Bridge / backward auto-fix engine
  const effectiveEngine: HybridEngine = useMemo(() => {
    if (mode === 'backward' && !HYBRID_BACKWARD_CAPABLE.includes(engine)) return 'ai-kling';
    if (mode === 'bridge' && !HYBRID_BRIDGE_CAPABLE.includes(engine)) return 'ai-kling';
    return engine;
  }, [mode, engine]);

  // Bridge target candidates: any other scene with a clip_url
  const bridgeTargets = useMemo(
    () =>
      availableScenes
        .filter((s) => s.id !== sourceSceneId && !!s.clipUrl)
        .sort((a, b) => a.orderIndex - b.orderIndex),
    [availableScenes, sourceSceneId]
  );

  // Auto-select first available bridge target when entering bridge mode
  useEffect(() => {
    if (mode === 'bridge' && !targetSceneId && bridgeTargets.length > 0) {
      setTargetSceneId(bridgeTargets[0].id);
    }
  }, [mode, targetSceneId, bridgeTargets]);

  const cost = getClipCost(effectiveEngine, quality, duration);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    if (mode === 'bridge' && !targetSceneId) return;

    const result = await extendScene({
      projectId,
      sourceSceneId,
      mode,
      engine: effectiveEngine,
      quality,
      prompt: prompt.trim(),
      durationSeconds: duration,
      targetSceneId: mode === 'bridge' ? targetSceneId : undefined,
    });
    if (result) {
      onSuccess?.(result.newSceneId);
      onOpenChange(false);
      setPrompt('');
    }
  };

  const generateDisabled =
    isExtending ||
    !prompt.trim() ||
    !sourceClipUrl ||
    (mode === 'bridge' && !targetSceneId);

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
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="forward" className="gap-1.5 text-xs">
              <ArrowRight className="w-3.5 h-3.5" /> {t.forward}
            </TabsTrigger>
            <TabsTrigger value="backward" className="gap-1.5 text-xs">
              <ArrowLeft className="w-3.5 h-3.5" /> {t.backward}
            </TabsTrigger>
            <TabsTrigger value="bridge" className="gap-1.5 text-xs">
              <Link2 className="w-3.5 h-3.5" /> {t.bridge}
            </TabsTrigger>
            <TabsTrigger value="style-ref" className="gap-1.5 text-xs">
              <Palette className="w-3.5 h-3.5" /> {t.styleRef}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="forward" className="space-y-4 pt-4">
            <EngineSelectorRow
              t={t}
              engine={engine}
              setEngine={setEngine}
              allowed={ENGINES}
            />
          </TabsContent>

          <TabsContent value="backward" className="space-y-4 pt-4">
            <HintBox tone="amber" icon={<AlertTriangle className="w-4 h-4" />}>
              {t.backwardOnly}
            </HintBox>
            <EngineSelectorRow
              t={t}
              engine={effectiveEngine}
              setEngine={setEngine}
              allowed={HYBRID_BACKWARD_CAPABLE}
            />
          </TabsContent>

          <TabsContent value="bridge" className="space-y-4 pt-4">
            <HintBox tone="primary" icon={<Link2 className="w-4 h-4" />}>
              {t.bridgeHint}
            </HintBox>
            <HintBox tone="amber" icon={<AlertTriangle className="w-4 h-4" />}>
              {t.bridgeOnly}
            </HintBox>

            <div className="space-y-2">
              <Label>{t.targetScene}</Label>
              {bridgeTargets.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">{t.noTargets}</p>
              ) : (
                <Select value={targetSceneId} onValueChange={setTargetSceneId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t.targetPlaceholder} />
                  </SelectTrigger>
                  <SelectContent>
                    {bridgeTargets.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        #{s.orderIndex + 1} — {s.sceneType ?? 'scene'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <EngineSelectorRow
              t={t}
              engine={effectiveEngine}
              setEngine={setEngine}
              allowed={HYBRID_BRIDGE_CAPABLE}
            />
          </TabsContent>

          <TabsContent value="style-ref" className="space-y-4 pt-4">
            <HintBox tone="primary" icon={<Palette className="w-4 h-4" />}>
              {t.styleRefHint}
            </HintBox>
            <EngineSelectorRow
              t={t}
              engine={engine}
              setEngine={setEngine}
              allowed={ENGINES}
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
          <Button onClick={handleGenerate} disabled={generateDisabled}>
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

function HintBox({
  tone,
  icon,
  children,
}: {
  tone: 'amber' | 'primary';
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const cls =
    tone === 'amber'
      ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
      : 'bg-primary/10 border-primary/30 text-primary';
  return (
    <div className={`flex items-start gap-2 rounded-lg border p-2 text-xs ${cls}`}>
      <span className="shrink-0 mt-0.5">{icon}</span>
      <span>{children}</span>
    </div>
  );
}

function EngineSelectorRow({
  t,
  engine,
  setEngine,
  allowed,
}: {
  t: (typeof T)[keyof typeof T];
  engine: HybridEngine;
  setEngine: (e: HybridEngine) => void;
  allowed: HybridEngine[];
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
            const disabled = !allowed.includes(eng);
            return (
              <SelectItem key={eng} value={eng} disabled={disabled}>
                <div className="flex items-center gap-2">
                  {CLIP_SOURCE_LABELS[eng].de}
                  {disabled && (
                    <Badge variant="outline" className="text-xs">
                      n/a
                    </Badge>
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
