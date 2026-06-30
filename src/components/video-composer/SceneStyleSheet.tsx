/**
 * SceneStyleSheet — Cleaned-up "Stil ändern" dialog.
 *
 * One single dialog, no nested popovers. Three tabs (Looks / Feintuning /
 * Modifier) share a global status bar at the top (active chips, removable)
 * and a sticky footer with a live cinematography-suffix preview + reset/done.
 */
import { useMemo } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Palette, Sparkles, Sliders, X, RotateCcw } from 'lucide-react';
import DirectorPresetPicker from '@/components/motion-studio/DirectorPresetPicker';
import CinematicStylePresets from '@/components/ai-video/CinematicStylePresets';
import SceneShotDirectorPanel from './SceneShotDirectorPanel';
import {
  CINEMATIC_STYLE_PRESETS,
  matchPresetToSelection,
} from '@/config/cinematicStylePresets';
import {
  SHOT_CATEGORIES,
  findOption,
  type ShotCategory,
  type ShotSelection,
} from '@/config/shotDirector';
import {
  CATEGORY_LABELS,
  getPresetById,
  type DirectorModifiers,
  type PresetCategory,
} from '@/lib/motion-studio/directorPresets';
import { buildShotPromptSuffix } from '@/lib/shotDirector/buildShotPromptSuffix';
import { resolveShotOptionToCatalogId } from '@/config/catalogAdapters';
import type { ComposerScene } from '@/types/video-composer';

/**
 * Wave 3.1 — augment a ShotSelection with Catalog-ID shadow fields
 * (framingId / angleId / movementId / lightingId) so the Briefing-Plan ↔
 * Storyboard ID contract stays intact across every editor write. Zero
 * impact on render prompts — only adds keys onto the JSONB blob.
 */
function withCatalogShadowIds(sel: ShotSelection): ShotSelection & {
  framingId?: string | null;
  angleId?: string | null;
  movementId?: string | null;
  lightingId?: string | null;
} {
  return {
    ...sel,
    framingId: resolveShotOptionToCatalogId('framing', sel.framing),
    angleId: resolveShotOptionToCatalogId('angle', sel.angle),
    movementId: resolveShotOptionToCatalogId('movement', sel.movement),
    lightingId: resolveShotOptionToCatalogId('lighting', sel.lighting),
  };
}

type Lang = 'de' | 'en' | 'es';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scene: ComposerScene;
  language: Lang;
  onUpdate: (updates: Partial<ComposerScene>) => void;
}

const t = {
  de: {
    title: 'Stil ändern',
    looks: 'Looks',
    fine: 'Feintuning',
    modifiers: 'Modifier',
    activeNone: 'Noch kein Stil gesetzt — wähle einen Look oder feinjustiere unten.',
    active: 'Aktiv',
    resetAll: 'Alles zurücksetzen',
    done: 'Fertig',
    preview: 'Vorschau',
    previewEmpty: 'Noch keine Cinematography gesetzt.',
    axisFraming: 'Bildausschnitt',
    axisAngle: 'Winkel',
    axisMovement: 'Bewegung',
    axisLighting: 'Licht',
    axisCamera: 'Kamera',
    axisLens: 'Objektiv',
  },
  en: {
    title: 'Change style',
    looks: 'Looks',
    fine: 'Fine-tune',
    modifiers: 'Modifiers',
    activeNone: 'No style set yet — pick a look or fine-tune below.',
    active: 'Active',
    resetAll: 'Reset all',
    done: 'Done',
    preview: 'Preview',
    previewEmpty: 'No cinematography set yet.',
    axisFraming: 'Framing',
    axisAngle: 'Angle',
    axisMovement: 'Movement',
    axisLighting: 'Lighting',
    axisCamera: 'Camera',
    axisLens: 'Lens',
  },
  es: {
    title: 'Cambiar estilo',
    looks: 'Looks',
    fine: 'Ajuste fino',
    modifiers: 'Modificadores',
    activeNone: 'Sin estilo aún — elige un look o ajusta abajo.',
    active: 'Activo',
    resetAll: 'Restablecer todo',
    done: 'Listo',
    preview: 'Vista previa',
    previewEmpty: 'Aún sin cinematografía.',
    axisFraming: 'Encuadre',
    axisAngle: 'Ángulo',
    axisMovement: 'Movimiento',
    axisLighting: 'Luz',
    axisCamera: 'Cámara',
    axisLens: 'Objetivo',
  },
} as const;

interface ActiveChip {
  key: string;
  label: string;
  emoji?: string;
  source: 'look' | 'shot' | 'modifier';
  onRemove: () => void;
}

export default function SceneStyleSheet({
  open,
  onOpenChange,
  scene,
  language,
  onUpdate,
}: Props) {
  const L = t[language];
  const shot: ShotSelection = scene.shotDirector || {};
  const mods: DirectorModifiers = scene.directorModifiers || {};
  const activeLookId = useMemo(() => matchPresetToSelection(shot), [shot]);

  // Build the unified active-chip list.
  const chips: ActiveChip[] = useMemo(() => {
    const out: ActiveChip[] = [];

    // 1. Look (one entry, replaces all 4 axes when matched)
    if (activeLookId) {
      const look = CINEMATIC_STYLE_PRESETS.find((p) => p.id === activeLookId);
      if (look) {
        out.push({
          key: `look-${look.id}`,
          label: look.name[language],
          emoji: look.emoji,
          source: 'look',
          onRemove: () => onUpdate({ shotDirector: {} }),
        });
      }
    }

    // 2. Individual shot-director axes (only those NOT covered by the look)
    if (!activeLookId) {
      (Object.keys(SHOT_CATEGORIES) as ShotCategory[]).forEach((cat) => {
        const opt = findOption(cat, shot[cat]);
        if (opt) {
          out.push({
            key: `shot-${cat}`,
            label: opt.label[language],
            source: 'shot',
            onRemove: () => {
              const next = { ...shot };
              delete next[cat];
              onUpdate({ shotDirector: next });
            },
          });
        }
      });
    }

    // 3. Director modifiers
    const MOD_KEYS: Array<{ key: keyof DirectorModifiers; cat: PresetCategory }> = [
      { key: 'camera', cat: 'camera' },
      { key: 'lens', cat: 'lens' },
      { key: 'lighting', cat: 'lighting' },
      { key: 'mood', cat: 'mood' },
      { key: 'filmStock', cat: 'film-stock' },
    ];
    MOD_KEYS.forEach(({ key, cat }) => {
      const id = mods[key];
      if (!id) return;
      const preset = getPresetById(id);
      if (!preset) return;
      out.push({
        key: `mod-${key}`,
        label: preset.label,
        emoji: preset.icon,
        source: 'modifier',
        onRemove: () => {
          const next = { ...mods };
          delete next[key];
          onUpdate({ directorModifiers: next });
        },
      });
    });

    return out;
  }, [activeLookId, shot, mods, language, onUpdate]);

  const previewSuffix = buildShotPromptSuffix(shot);

  const resetAll = () => {
    onUpdate({ shotDirector: {}, directorModifiers: {} });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[95vw] h-[92vh] max-h-[92vh] p-0 gap-0 overflow-hidden flex flex-col">
        {/* Header */}
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/40">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Palette className="h-4 w-4 text-primary" />
            {L.title}
          </DialogTitle>

          {/* Status bar */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5 min-h-[24px]">
            {chips.length === 0 ? (
              <span className="text-[11px] text-muted-foreground italic">{L.activeNone}</span>
            ) : (
              <>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1">
                  {L.active}:
                </span>
                {chips.map((chip) => (
                  <Badge
                    key={chip.key}
                    variant="outline"
                    className={`gap-1 pr-1 text-[10px] py-0.5 ${
                      chip.source === 'look'
                        ? 'border-primary/50 bg-primary/10 text-primary'
                        : chip.source === 'modifier'
                        ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                        : 'border-border bg-muted/40'
                    }`}
                  >
                    {chip.emoji && <span>{chip.emoji}</span>}
                    <span className="truncate max-w-[140px]">{chip.label}</span>
                    <button
                      type="button"
                      onClick={chip.onRemove}
                      className="ml-0.5 rounded-sm hover:bg-background/40 p-0.5"
                      aria-label="Remove"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </Badge>
                ))}
                <button
                  type="button"
                  onClick={resetAll}
                  className="ml-auto text-[10px] text-muted-foreground hover:text-destructive flex items-center gap-1"
                >
                  <RotateCcw className="h-3 w-3" />
                  {L.resetAll}
                </button>
              </>
            )}
          </div>
        </DialogHeader>

        {/* Tabs */}
        <Tabs defaultValue="looks" className="flex-1 flex flex-col min-h-0">
          <div className="px-5 pt-3">
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="looks" className="gap-1.5">
                <Sparkles className="h-3 w-3" /> {L.looks}
              </TabsTrigger>
              <TabsTrigger value="fine" className="gap-1.5">
                <Sliders className="h-3 w-3" /> {L.fine}
              </TabsTrigger>
              <TabsTrigger value="modifiers" className="gap-1.5">
                <Palette className="h-3 w-3" /> {L.modifiers}
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">
            <TabsContent value="looks" className="mt-0">
              <CinematicStylePresets
                value={shot}
                onApply={(sel) => onUpdate({ shotDirector: withCatalogShadowIds(sel) })}
                layout="grid"
                hideHeader
              />
            </TabsContent>

            <TabsContent value="fine" className="mt-0">
              <SceneShotDirectorPanel
                value={shot}
                onChange={(shotDirector) =>
                  onUpdate({ shotDirector: withCatalogShadowIds(shotDirector) })
                }
                language={language}
                layout="master-detail"
              />
            </TabsContent>

            <TabsContent value="modifiers" className="mt-0 overflow-visible">
              <DirectorPresetPicker
                modifiers={mods}
                basePrompt={scene.aiPrompt || ''}
                onChange={(directorModifiers) => onUpdate({ directorModifiers })}
                embedded
              />
            </TabsContent>
          </div>
        </Tabs>

        {/* Sticky footer */}
        <div className="border-t border-border/40 px-5 py-3 bg-background/60 backdrop-blur-sm flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
              {L.preview}
            </div>
            <div className="text-[11px] text-foreground/80 italic truncate">
              {previewSuffix || L.previewEmpty}
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={resetAll} className="h-8 text-[11px]">
            <RotateCcw className="h-3 w-3 mr-1" />
            {L.resetAll}
          </Button>
          <Button size="sm" onClick={() => onOpenChange(false)} className="h-8 text-[11px]">
            {L.done}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
