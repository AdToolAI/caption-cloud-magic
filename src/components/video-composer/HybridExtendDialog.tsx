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
  Rewind,
  FastForward,
  Loader2,
  AlertTriangle,
  Link2,
  Palette,
  Clapperboard,
  Users,
  MapPin,
  Megaphone,
  Check,
} from 'lucide-react';
import { motion } from 'framer-motion';
import {
  useHybridExtend,
  HYBRID_BACKWARD_CAPABLE,
  HYBRID_BRIDGE_CAPABLE,
  type HybridMode,
  type HybridEngine,
} from '@/hooks/useHybridExtend';
import { getClipCost, type ClipQuality } from '@/types/video-composer';

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
  /** Index (1-based) of source scene — for the dialog title. */
  sourceSceneNumber?: number;
  /** Other scenes in the project (used as bridge target candidates). */
  availableScenes?: HybridDialogScene[];
  /** Called after a successful extend so the caller can refetch the storyboard. */
  onSuccess?: (newSceneId: string) => void;
  language?: 'de' | 'en' | 'es';
}

const ENGINES: HybridEngine[] = ['ai-kling', 'ai-luma', 'ai-hailuo', 'ai-wan', 'ai-seedance'];

/* ------------------------------------------------------------------ *
 * 🎬 Director Mode i18n — Cast → Scout → Direct narrative
 * ------------------------------------------------------------------ */
const T = {
  de: {
    title: 'Director Mode',
    titleScene: 'Szene #{n} regieren',
    desc: 'In drei Schritten: caste deine Engine, scoute den Blickwinkel, gib die Regie-Anweisung.',
    tagline: 'Du bist der Regisseur. Wir sind die Crew.',
    step1: 'Cast',
    step2: 'Scout',
    step3: 'Direct',
    // Scout (Mode-Tabs)
    sequel: 'Sequel',
    sequelHint: 'Wie geht die Szene weiter?',
    prequel: 'Prequel',
    prequelHint: 'Was passierte davor?',
    crossfade: 'Crossfade',
    crossfadeHint: 'Morphe in eine andere Szene.',
    styleEcho: 'Style-Echo',
    styleEchoHint: 'Neue Szene, gleiche Bildsprache.',
    // Cast
    castLabel: 'Hauptdarsteller (AI-Engine)',
    castOff: 'Im Off',
    castOffTitle: 'Dieser Darsteller spielt in dieser Szene-Art nicht mit.',
    // Crew hints
    prequelOnlyCrew: '🎭 Für Prequels brauchen wir Kling oder Luma — sie können rückwärts denken.',
    crossfadeOnlyCrew: '🎭 Für Crossfades brauchen wir Kling oder Luma — sie kennen Anfang und Ende.',
    crossfadeStory: 'Crossfade morpht Frame für Frame von dieser Szene in die Ziel-Szene.',
    styleEchoStory: 'Style-Echo nutzt den letzten Frame als Stil-Anker für eine komplett neue Szene.',
    // Bridge target
    targetScene: 'Ziel-Szene',
    targetPlaceholder: 'Wähle die Szene, in die übergeleitet wird …',
    noTargets: 'Keine weiteren fertigen Szenen verfügbar.',
    // Direct
    quality: 'Qualität',
    standard: 'Standard',
    pro: 'Pro',
    duration: 'Dauer',
    seconds: 'Sek.',
    prompt: 'Regie-Anweisung',
    promptPh: 'Action! In dieser Szene …',
    cost: 'Drehbudget',
    cancel: 'Abbrechen',
    action: 'Action! — Szene drehen',
    rolling: 'Kamera läuft …',
  },
  en: {
    title: 'Director Mode',
    titleScene: 'Direct scene #{n}',
    desc: 'Three steps: cast your engine, scout your angle, call the shot.',
    tagline: "You're the director. We're the crew.",
    step1: 'Cast',
    step2: 'Scout',
    step3: 'Direct',
    sequel: 'Sequel',
    sequelHint: 'How does the scene continue?',
    prequel: 'Prequel',
    prequelHint: 'What happened before?',
    crossfade: 'Crossfade',
    crossfadeHint: 'Morph into another scene.',
    styleEcho: 'Style-Echo',
    styleEchoHint: 'New scene, same visual language.',
    castLabel: 'Lead Actor (AI Engine)',
    castOff: 'Off-Screen',
    castOffTitle: 'This actor doesn’t perform in this kind of scene.',
    prequelOnlyCrew: '🎭 For prequels we need Kling or Luma — they can think backwards.',
    crossfadeOnlyCrew: '🎭 For crossfades we need Kling or Luma — they know start AND end.',
    crossfadeStory: 'Crossfade morphs frame by frame from this scene into the target scene.',
    styleEchoStory: 'Style-Echo uses the last frame as a style anchor for a brand new scene.',
    targetScene: 'Target scene',
    targetPlaceholder: 'Pick the scene to morph into …',
    noTargets: 'No other completed scenes available.',
    quality: 'Quality',
    standard: 'Standard',
    pro: 'Pro',
    duration: 'Duration',
    seconds: 'sec',
    prompt: 'Director’s Note',
    promptPh: 'Action! In this scene …',
    cost: 'Shoot Budget',
    cancel: 'Cancel',
    action: 'Action! — Roll camera',
    rolling: 'Camera rolling …',
  },
  es: {
    title: 'Director Mode',
    titleScene: 'Dirige la escena #{n}',
    desc: 'En tres pasos: elige tu engine, busca el ángulo, da la orden.',
    tagline: 'Tú eres el director. Nosotros, el equipo.',
    step1: 'Cast',
    step2: 'Scout',
    step3: 'Direct',
    sequel: 'Sequel',
    sequelHint: '¿Cómo continúa la escena?',
    prequel: 'Prequel',
    prequelHint: '¿Qué pasó antes?',
    crossfade: 'Crossfade',
    crossfadeHint: 'Morphing hacia otra escena.',
    styleEcho: 'Style-Echo',
    styleEchoHint: 'Nueva escena, mismo lenguaje visual.',
    castLabel: 'Actor principal (motor AI)',
    castOff: 'Fuera de cámara',
    castOffTitle: 'Este actor no actúa en este tipo de escena.',
    prequelOnlyCrew: '🎭 Para prequels necesitamos Kling o Luma — saben pensar hacia atrás.',
    crossfadeOnlyCrew: '🎭 Para crossfades necesitamos Kling o Luma — conocen inicio y final.',
    crossfadeStory: 'Crossfade hace morphing frame a frame entre esta escena y la destino.',
    styleEchoStory: 'Style-Echo usa el último frame como ancla de estilo para una escena nueva.',
    targetScene: 'Escena destino',
    targetPlaceholder: 'Elige la escena a la que transicionar …',
    noTargets: 'No hay otras escenas completadas disponibles.',
    quality: 'Calidad',
    standard: 'Estándar',
    pro: 'Pro',
    duration: 'Duración',
    seconds: 'seg',
    prompt: 'Nota del director',
    promptPh: '¡Acción! En esta escena …',
    cost: 'Presupuesto de rodaje',
    cancel: 'Cancelar',
    action: '¡Acción! — Rodar escena',
    rolling: 'Cámara grabando …',
  },
} as const;

/** Cast roster — schauspieler-metaphern pro engine, EN als universelle Mikro-Beschreibung. */
const CAST_ROSTER: Record<HybridEngine, { name: string; role: { de: string; en: string; es: string }; initial: string }> = {
  'ai-kling': {
    name: 'Kling',
    initial: 'K',
    role: {
      de: 'der Charakterdarsteller — i2v + Bridge-fähig',
      en: 'the character actor — i2v + bridge-capable',
      es: 'el actor de carácter — i2v + bridge',
    },
  },
  'ai-luma': {
    name: 'Luma',
    initial: 'L',
    role: {
      de: 'die Kamerafrau — sanfte Übergänge',
      en: 'the cinematographer — smooth transitions',
      es: 'la directora de fotografía — transiciones suaves',
    },
  },
  'ai-hailuo': {
    name: 'Hailuo',
    initial: 'H',
    role: {
      de: 'der Realist — natürliche Bewegung',
      en: 'the realist — natural motion',
      es: 'el realista — movimiento natural',
    },
  },
  'ai-wan': {
    name: 'Wan',
    initial: 'W',
    role: {
      de: 'der Allrounder — schnell & flexibel',
      en: 'the all-rounder — fast & flexible',
      es: 'el polifacético — rápido y flexible',
    },
  },
  'ai-seedance': {
    name: 'Seedance',
    initial: 'S',
    role: {
      de: 'der Performer — Tanz & Action',
      en: 'the performer — dance & action',
      es: 'el intérprete — baile y acción',
    },
  },
};

export default function HybridExtendDialog({
  open,
  onOpenChange,
  projectId,
  sourceSceneId,
  sourceClipUrl,
  defaultMode = 'forward',
  sourceSceneNumber,
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

  // 3-Step indicator state
  const stepCast = !!engine; // cast is always implicitly chosen (default)
  const stepScout = !!mode && (mode !== 'bridge' || !!targetSceneId);
  const stepDirect = prompt.trim().length > 0;

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

  const allowedForMode: HybridEngine[] =
    mode === 'backward' ? HYBRID_BACKWARD_CAPABLE :
    mode === 'bridge' ? HYBRID_BRIDGE_CAPABLE :
    ENGINES;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Clapperboard className="w-5 h-5 text-primary" />
            <span className="font-semibold">{t.title}</span>
            <span className="text-muted-foreground font-normal">
              — {t.titleScene.replace('{n}', String(sourceSceneNumber ?? 1))}
            </span>
          </DialogTitle>
          <DialogDescription className="flex flex-col gap-1">
            <span>{t.desc}</span>
            <span className="text-[11px] italic text-primary/80">„{t.tagline}"</span>
          </DialogDescription>
        </DialogHeader>

        {/* 3-Step indicator: Cast → Scout → Direct */}
        <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/20 bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 px-3 py-2">
          <StepPill icon={<Users className="w-3.5 h-3.5" />} label={t.step1} active done={stepCast} />
          <div className="flex-1 h-px bg-gradient-to-r from-primary/40 to-primary/40" />
          <StepPill icon={<MapPin className="w-3.5 h-3.5" />} label={t.step2} active={!!mode} done={stepScout} />
          <div className="flex-1 h-px bg-gradient-to-r from-primary/40 to-primary/40" />
          <StepPill icon={<Megaphone className="w-3.5 h-3.5" />} label={t.step3} active={stepDirect} done={stepDirect} />
        </div>

        {/* SCOUT — Mode tabs */}
        <Tabs value={mode} onValueChange={(v) => setMode(v as HybridMode)} className="mt-1">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="forward" className="gap-1.5 text-xs">
              <FastForward className="w-3.5 h-3.5" /> {t.sequel}
            </TabsTrigger>
            <TabsTrigger value="backward" className="gap-1.5 text-xs">
              <Rewind className="w-3.5 h-3.5" /> {t.prequel}
            </TabsTrigger>
            <TabsTrigger value="bridge" className="gap-1.5 text-xs">
              <Link2 className="w-3.5 h-3.5" /> {t.crossfade}
            </TabsTrigger>
            <TabsTrigger value="style-ref" className="gap-1.5 text-xs">
              <Palette className="w-3.5 h-3.5" /> {t.styleEcho}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="forward" className="space-y-3 pt-3">
            <ScoutHint icon={<FastForward className="w-4 h-4" />}>{t.sequelHint}</ScoutHint>
          </TabsContent>

          <TabsContent value="backward" className="space-y-3 pt-3">
            <ScoutHint icon={<Rewind className="w-4 h-4" />}>{t.prequelHint}</ScoutHint>
            <CrewHint icon={<AlertTriangle className="w-4 h-4" />}>{t.prequelOnlyCrew}</CrewHint>
          </TabsContent>

          <TabsContent value="bridge" className="space-y-3 pt-3">
            <ScoutHint icon={<Link2 className="w-4 h-4" />}>{t.crossfadeStory}</ScoutHint>
            <CrewHint icon={<AlertTriangle className="w-4 h-4" />}>{t.crossfadeOnlyCrew}</CrewHint>

            <div className="space-y-2">
              <Label className="text-xs">{t.targetScene}</Label>
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
          </TabsContent>

          <TabsContent value="style-ref" className="space-y-3 pt-3">
            <ScoutHint icon={<Palette className="w-4 h-4" />}>{t.styleEchoStory}</ScoutHint>
          </TabsContent>
        </Tabs>

        {/* CAST — Engine picker as actor roster */}
        <CastPicker
          t={t}
          language={language}
          engine={effectiveEngine}
          setEngine={setEngine}
          allowed={allowedForMode}
        />

        {/* DIRECT — Quality / Duration / Prompt / Budget */}
        <div className="space-y-3 pt-1 border-t border-primary/10">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{t.quality}</Label>
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

            <div className="space-y-1.5">
              <div className="flex justify-between">
                <Label className="text-xs">{t.duration}</Label>
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
                className="mt-2"
              />
            </div>
          </div>

          {/* Prompt */}
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5">
              <Megaphone className="w-3 h-3 text-primary" />
              {t.prompt}
            </Label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={t.promptPh}
              rows={3}
              className="text-sm"
            />
          </div>

          {/* Budget */}
          <div className="flex items-center justify-between text-sm rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
            <span className="text-muted-foreground flex items-center gap-1.5">
              💰 {t.cost}
            </span>
            <Badge variant="secondary" className="font-mono">€ {cost.toFixed(2)}</Badge>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isExtending}>
            {t.cancel}
          </Button>
          <Button onClick={handleGenerate} disabled={generateDisabled} className="gap-2">
            {isExtending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t.rolling}
              </>
            ) : (
              <motion.span
                key="action"
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex items-center gap-2"
              >
                <Clapperboard className="w-4 h-4" />
                {t.action}
              </motion.span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ *
 * Sub-components
 * ------------------------------------------------------------------ */

function StepPill({
  icon,
  label,
  active,
  done,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all ${
        done
          ? 'bg-primary/20 text-primary border border-primary/40 shadow-[0_0_12px_hsl(var(--primary)/0.25)]'
          : active
          ? 'bg-primary/10 text-primary/80 border border-primary/20'
          : 'bg-muted/40 text-muted-foreground border border-border'
      }`}
    >
      {done ? <Check className="w-3 h-3" /> : icon}
      <span>{label}</span>
    </div>
  );
}

function ScoutHint({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/10 p-2 text-xs text-primary">
      <span className="shrink-0 mt-0.5">{icon}</span>
      <span>{children}</span>
    </div>
  );
}

function CrewHint({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-600 dark:text-amber-400">
      <span className="shrink-0 mt-0.5">{icon}</span>
      <span>{children}</span>
    </div>
  );
}

function CastPicker({
  t,
  language,
  engine,
  setEngine,
  allowed,
}: {
  t: (typeof T)[keyof typeof T];
  language: 'de' | 'en' | 'es';
  engine: HybridEngine;
  setEngine: (e: HybridEngine) => void;
  allowed: HybridEngine[];
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs flex items-center gap-1.5">
        <Users className="w-3 h-3 text-primary" />
        {t.castLabel}
      </Label>
      <div className="grid grid-cols-1 gap-1.5 max-h-[180px] overflow-y-auto pr-1">
        {ENGINES.map((eng) => {
          const actor = CAST_ROSTER[eng];
          const isActive = engine === eng;
          const isAllowed = allowed.includes(eng);
          return (
            <button
              key={eng}
              type="button"
              onClick={() => isAllowed && setEngine(eng)}
              disabled={!isAllowed}
              title={!isAllowed ? t.castOffTitle : undefined}
              className={`flex items-center gap-3 rounded-md border p-2 text-left transition-all ${
                !isAllowed
                  ? 'border-border bg-muted/30 opacity-50 cursor-not-allowed'
                  : isActive
                  ? 'border-primary bg-primary/10 shadow-[0_0_10px_hsl(var(--primary)/0.2)]'
                  : 'border-border hover:border-primary/40 hover:bg-muted/40'
              }`}
            >
              {/* Avatar initial */}
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full font-bold text-xs shrink-0 ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {actor.initial}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium flex items-center gap-1.5">
                  {actor.name}
                  {!isAllowed && (
                    <Badge variant="outline" className="h-4 px-1 text-[9px] gap-0.5">
                      💤 {t.castOff}
                    </Badge>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground italic line-clamp-1">
                  {actor.role[language]}
                </div>
              </div>
              {isActive && (
                <Badge variant="default" className="h-4 px-1 text-[9px] shrink-0">
                  ★
                </Badge>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
