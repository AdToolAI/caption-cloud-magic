/**
 * SceneStyleMode — Stage 18: inline (non-modal) version of `SceneStyleSheet`.
 *
 * Same logic and tabs (Looks / Feintuning / Modifier) but rendered as a
 * regular column inside the Storyboard left pane rather than inside a Dialog
 * so the user can bounce between Editor / Stil / Avatar without losing focus
 * or dimming the surrounding canvas. The `SceneStyleSheet` Dialog version
 * remains for any caller that still needs a modal (e.g. mobile sheets).
 */
import { useMemo } from 'react';
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
  getPresetById,
  type DirectorModifiers,
  type PresetCategory,
} from '@/lib/motion-studio/directorPresets';
import { buildShotPromptSuffix } from '@/lib/shotDirector/buildShotPromptSuffix';
import type { ComposerScene } from '@/types/video-composer';

type Lang = 'de' | 'en' | 'es';

interface Props {
  scene: ComposerScene;
  language: Lang;
  onUpdate: (updates: Partial<ComposerScene>) => void;
}

const t = {
  de: {
    looks: 'Looks',
    fine: 'Feintuning',
    modifiers: 'Modifier',
    activeNone: 'Noch kein Stil gesetzt — wähle einen Look oder feinjustiere unten.',
    active: 'Aktiv',
    resetAll: 'Alles zurücksetzen',
    preview: 'Vorschau',
    previewEmpty: 'Noch keine Cinematography gesetzt.',
  },
  en: {
    looks: 'Looks',
    fine: 'Fine-tune',
    modifiers: 'Modifiers',
    activeNone: 'No style set yet — pick a look or fine-tune below.',
    active: 'Active',
    resetAll: 'Reset all',
    preview: 'Preview',
    previewEmpty: 'No cinematography set yet.',
  },
  es: {
    looks: 'Looks',
    fine: 'Ajuste fino',
    modifiers: 'Modificadores',
    activeNone: 'Sin estilo aún — elige un look o ajusta abajo.',
    active: 'Activo',
    resetAll: 'Restablecer todo',
    preview: 'Vista previa',
    previewEmpty: 'Aún sin cinematografía.',
  },
} as const;

interface ActiveChip {
  key: string;
  label: string;
  emoji?: string;
  source: 'look' | 'shot' | 'modifier';
  onRemove: () => void;
}

export default function SceneStyleMode({ scene, language, onUpdate }: Props) {
  const L = t[language];
  const shot: ShotSelection = scene.shotDirector || {};
  const mods: DirectorModifiers = scene.directorModifiers || {};
  const activeLookId = useMemo(() => matchPresetToSelection(shot), [shot]);

  const chips: ActiveChip[] = useMemo(() => {
    const out: ActiveChip[] = [];
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
    const MOD_KEYS: Array<{ key: keyof DirectorModifiers; cat: PresetCategory }> = [
      { key: 'camera', cat: 'camera' },
      { key: 'lens', cat: 'lens' },
      { key: 'lighting', cat: 'lighting' },
      { key: 'mood', cat: 'mood' },
      { key: 'filmStock', cat: 'film-stock' },
    ];
    MOD_KEYS.forEach(({ key }) => {
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
  const resetAll = () => onUpdate({ shotDirector: {}, directorModifiers: {} });

  return (
    <div className="flex flex-col gap-3 min-h-0">
      {/* Active chips */}
      <div className="flex flex-wrap items-center gap-1.5 min-h-[26px] px-1">
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

      <Tabs defaultValue="looks" className="flex-1 flex flex-col min-h-0">
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

        <div className="mt-3 flex-1 overflow-y-auto pr-1 min-h-0 max-h-[68vh]">
          <TabsContent value="looks" className="mt-0">
            <CinematicStylePresets
              value={shot}
              onApply={(sel) => onUpdate({ shotDirector: sel })}
              layout="grid"
              hideHeader
            />
          </TabsContent>
          <TabsContent value="fine" className="mt-0">
            <SceneShotDirectorPanel
              value={shot}
              onChange={(shotDirector) => onUpdate({ shotDirector })}
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

      {/* Live preview footer */}
      <div className="border-t border-border/40 pt-2 px-1">
        <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
          {L.preview}
        </div>
        <div className="text-[11px] text-foreground/80 italic line-clamp-2">
          {previewSuffix || L.previewEmpty}
        </div>
      </div>
    </div>
  );
}
