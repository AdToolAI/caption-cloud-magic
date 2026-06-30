/**
 * ScenePerformancePanel — Phase 2 Performance Layer UI.
 *
 * Per-character grid of 4 small dropdowns + a 5-step energy slider. Empty
 * state shows a single muted hint instead of N empty rows. Writes to
 * `scene.performance[characterId]` via `onUpdate`. Lip-sync safe — no
 * audioPlan reads/writes.
 */
import { Sparkles, Eye, Hand, Smile, Zap, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  CharacterShot,
  ComposerScene,
  PerformanceEnergy,
  PerformanceExpression,
  PerformanceGaze,
  PerformanceGesture,
  ScenePerformance,
} from '@/types/video-composer';
import type { DirectorLanguage } from '@/lib/motion-studio/composeFinalPrompt';
import { cn } from '@/lib/utils';
import {
  expressionToCatalogId,
  gestureToCatalogId,
  gazeToCatalogId,
} from '@/config/catalogAdapters';

interface Props {
  scene: Pick<ComposerScene, 'performance' | 'characterShots' | 'characterShot'>;
  characters: Array<{ id: string; name: string }>;
  language: DirectorLanguage;
  onUpdate: (next: Partial<ComposerScene>) => void;
}

const T = {
  en: {
    title: 'Performance per character',
    subtitle: 'Optional — leave empty when the scene action is enough.',
    expression: 'Expression',
    gesture: 'Gesture',
    gaze: 'Gaze',
    energy: 'Energy',
    none: 'No cast in this scene — assign cast in the Cast tab first.',
    clear: 'Clear',
    placeholder: '—',
  },
  de: {
    title: 'Performance pro Charakter',
    subtitle: 'Optional — leer lassen wenn die Scene-Aktion reicht.',
    expression: 'Mimik',
    gesture: 'Gestik',
    gaze: 'Blick',
    energy: 'Energie',
    none: 'Kein Cast in dieser Szene — weise zuerst im Cast-Tab Charaktere zu.',
    clear: 'Leeren',
    placeholder: '—',
  },
  es: {
    title: 'Actuación por personaje',
    subtitle: 'Opcional — déjalo vacío si la acción de la escena basta.',
    expression: 'Expresión',
    gesture: 'Gesto',
    gaze: 'Mirada',
    energy: 'Energía',
    none: 'Sin reparto en esta escena — asigna personajes en la pestaña Reparto.',
    clear: 'Vaciar',
    placeholder: '—',
  },
} as const;

const EXPRESSION_LABELS: Record<DirectorLanguage, Record<PerformanceExpression, string>> = {
  en: {
    neutral: 'Neutral',
    'warm-smile': 'Warm smile',
    curious: 'Curious',
    concerned: 'Concerned',
    confident: 'Confident',
    surprised: 'Surprised',
  },
  de: {
    neutral: 'Neutral',
    'warm-smile': 'Warmes Lächeln',
    curious: 'Neugierig',
    concerned: 'Besorgt',
    confident: 'Souverän',
    surprised: 'Überrascht',
  },
  es: {
    neutral: 'Neutral',
    'warm-smile': 'Sonrisa cálida',
    curious: 'Curioso',
    concerned: 'Preocupado',
    confident: 'Seguro',
    surprised: 'Sorprendido',
  },
};

const GESTURE_LABELS: Record<DirectorLanguage, Record<PerformanceGesture, string>> = {
  en: {
    still: 'Still',
    'hand-on-chin': 'Hand on chin',
    'open-palms': 'Open palms',
    point: 'Pointing',
    'cross-arms': 'Arms crossed',
    'lean-in': 'Leans in',
  },
  de: {
    still: 'Ruhig',
    'hand-on-chin': 'Hand am Kinn',
    'open-palms': 'Offene Handflächen',
    point: 'Zeigt',
    'cross-arms': 'Arme verschränkt',
    'lean-in': 'Beugt sich vor',
  },
  es: {
    still: 'Quieto',
    'hand-on-chin': 'Mano en mentón',
    'open-palms': 'Palmas abiertas',
    point: 'Señalando',
    'cross-arms': 'Brazos cruzados',
    'lean-in': 'Se inclina',
  },
};

const GAZE_LABELS: Record<DirectorLanguage, Record<PerformanceGaze, string>> = {
  en: {
    'to-camera': 'To camera',
    'to-speaker': 'To other speaker',
    away: 'Away',
    'down-thinking': 'Down, thinking',
  },
  de: {
    'to-camera': 'Zur Kamera',
    'to-speaker': 'Zum Gegenüber',
    away: 'Weg',
    'down-thinking': 'Nach unten, denkend',
  },
  es: {
    'to-camera': 'A cámara',
    'to-speaker': 'Al interlocutor',
    away: 'Lejos',
    'down-thinking': 'Abajo, pensando',
  },
};

const UNSET = '__unset__';

function getActiveCast(
  scene: Pick<ComposerScene, 'characterShots' | 'characterShot'>,
): CharacterShot[] {
  const shots = scene.characterShots ?? (scene.characterShot ? [scene.characterShot] : []);
  return shots.filter((s) => s && s.shotType && s.shotType !== 'absent');
}

function clean(perf: ScenePerformance): ScenePerformance | undefined {
  const { expression, gesture, gaze, energy } = perf;
  if (!expression && !gesture && !gaze && !energy) return undefined;
  return perf;
}

export default function ScenePerformancePanel({ scene, characters, language, onUpdate }: Props) {
  const L = T[language] ?? T.en;
  const cast = getActiveCast(scene);

  if (cast.length === 0) {
    return (
      <div className="rounded-lg border border-border/30 bg-muted/20 px-3 py-4 text-[11px] text-muted-foreground italic">
        {L.none}
      </div>
    );
  }

  const performance = scene.performance ?? {};

  function updateChar(charId: string, patch: Partial<ScenePerformance>) {
    const current = performance[charId] ?? {};
    const mergedRaw = { ...current, ...patch } as ScenePerformance & {
      mimikId?: string | null;
      gestikId?: string | null;
      blickId?: string | null;
    };
    // Wave 3.1 — keep Catalog-ID shadow fields in sync with the enum
    // selection. Zero impact on render prompts (they read enum mirrors).
    if ('expression' in patch) mergedRaw.mimikId = expressionToCatalogId(mergedRaw.expression);
    if ('gesture' in patch) mergedRaw.gestikId = gestureToCatalogId(mergedRaw.gesture);
    if ('gaze' in patch) mergedRaw.blickId = gazeToCatalogId(mergedRaw.gaze);
    const merged = clean(mergedRaw);
    const next = { ...performance };
    if (merged) next[charId] = merged;
    else delete next[charId];
    onUpdate({ performance: next });
  }

  function clearChar(charId: string) {
    const next = { ...performance };
    delete next[charId];
    onUpdate({ performance: next });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-primary/80" />
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-semibold leading-tight">{L.title}</div>
          <div className="text-[10px] text-muted-foreground/80 leading-tight">{L.subtitle}</div>
        </div>
      </div>

      <div className="space-y-2">
        {cast.map((slot, slotIdx) => {
          const lookup = characters.find((c) => c.id === slot.characterId);
          // v177.1 — Cast fallback: render the row even when the global
          // character library lookup fails (e.g. briefing referenced a
          // character that has not been persisted to brand_characters yet).
          // Performance lives on the scene by characterId, so we still want
          // editable Mimik/Gestik/Blick/Energy fields here.
          const fallbackId = slot.characterId || `__cast_${slotIdx}__`;
          const fallbackName =
            slot.characterId
              ? `Charakter ${slot.characterId.slice(0, 6)}`
              : `Sprecher ${slotIdx + 1}`;
          const ch = lookup ?? { id: fallbackId, name: fallbackName };
          const perf = performance[ch.id] ?? {};
          const hasAny = !!(perf.expression || perf.gesture || perf.gaze || perf.energy);

          return (
            <div
              key={ch.id}
              className="rounded-md border border-border/40 bg-card/40 px-2.5 py-2 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium truncate">{ch.name}</span>
                {hasAny && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-5 px-1.5 text-[9px] gap-1 text-muted-foreground hover:text-rose-400"
                    onClick={() => clearChar(ch.id)}
                    title={L.clear}
                  >
                    <Trash2 className="h-2.5 w-2.5" />
                    {L.clear}
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                {/* Expression */}
                <DropdownField
                  icon={Smile}
                  label={L.expression}
                  value={perf.expression ?? UNSET}
                  placeholder={L.placeholder}
                  options={(Object.keys(EXPRESSION_LABELS[language]) as PerformanceExpression[]).map(
                    (k) => ({ value: k, label: EXPRESSION_LABELS[language][k] }),
                  )}
                  onChange={(v) =>
                    updateChar(ch.id, {
                      expression: v === UNSET ? undefined : (v as PerformanceExpression),
                    })
                  }
                />
                {/* Gesture */}
                <DropdownField
                  icon={Hand}
                  label={L.gesture}
                  value={perf.gesture ?? UNSET}
                  placeholder={L.placeholder}
                  options={(Object.keys(GESTURE_LABELS[language]) as PerformanceGesture[]).map(
                    (k) => ({ value: k, label: GESTURE_LABELS[language][k] }),
                  )}
                  onChange={(v) =>
                    updateChar(ch.id, {
                      gesture: v === UNSET ? undefined : (v as PerformanceGesture),
                    })
                  }
                />
                {/* Gaze */}
                <DropdownField
                  icon={Eye}
                  label={L.gaze}
                  value={perf.gaze ?? UNSET}
                  placeholder={L.placeholder}
                  options={(Object.keys(GAZE_LABELS[language]) as PerformanceGaze[]).map((k) => ({
                    value: k,
                    label: GAZE_LABELS[language][k],
                  }))}
                  onChange={(v) =>
                    updateChar(ch.id, { gaze: v === UNSET ? undefined : (v as PerformanceGaze) })
                  }
                />
                {/* Energy slider — five compact pills */}
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-[9px] text-muted-foreground uppercase tracking-wide font-medium">
                    <Zap className="h-2.5 w-2.5" />
                    {L.energy}
                  </div>
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((n) => {
                      const active = perf.energy === n;
                      return (
                        <button
                          key={n}
                          type="button"
                          onClick={() =>
                            updateChar(ch.id, {
                              energy: active ? undefined : (n as PerformanceEnergy),
                            })
                          }
                          className={cn(
                            'flex-1 h-6 rounded-sm border text-[10px] font-mono transition-colors',
                            active
                              ? 'border-primary/60 bg-primary/15 text-primary'
                              : 'border-border/40 text-muted-foreground hover:border-primary/40 hover:text-primary/80',
                          )}
                          title={`${L.energy} ${n}/5`}
                        >
                          {n}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

interface DropdownProps {
  icon: typeof Sparkles;
  label: string;
  value: string;
  placeholder: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
}

function DropdownField({ icon: Icon, label, value, placeholder, options, onChange }: DropdownProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1 text-[9px] text-muted-foreground uppercase tracking-wide font-medium">
        <Icon className="h-2.5 w-2.5" />
        {label}
      </div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-7 text-[10.5px] px-2">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={UNSET} className="text-[10.5px] italic text-muted-foreground">
            {placeholder}
          </SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} className="text-[10.5px]">
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
