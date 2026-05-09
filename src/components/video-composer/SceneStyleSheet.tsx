/**
 * SceneStyleSheet — Phase 2 of the "Studio Set" simplification.
 *
 * Replaces the three side-by-side style tools (Director Presets, Cinematic
 * Looks, Shot Director) that used to flood the SceneCard. They now live in a
 * single dialog with three tabs:
 *
 *   1. **Looks** — bundled one-click director styles (CinematicStylePresets).
 *   2. **Feintuning** — per-axis Shot Director (framing/angle/movement/light).
 *   3. **Modifier** — DirectorPresetPicker (loft-film, etc.).
 *
 * The default SceneCard view shows only a chip ("Stil: Cyberpunk Neon") +
 * a small "Stil ändern" button that opens this sheet.
 */
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Palette, Sparkles, Sliders } from 'lucide-react';
import DirectorPresetPicker from '@/components/motion-studio/DirectorPresetPicker';
import CinematicStylePresets from '@/components/ai-video/CinematicStylePresets';
import SceneShotDirectorPanel from './SceneShotDirectorPanel';
import type { ComposerScene } from '@/types/video-composer';

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
    description: 'Wähle einen Look mit einem Klick — oder feinjustiere die einzelnen Achsen.',
    looks: 'Looks',
    fine: 'Feintuning',
    modifiers: 'Modifier',
    looksHint: 'One-Click Director-Styles. Setzt Bildausschnitt, Winkel, Kamerabewegung und Licht in einem Rutsch.',
    fineHint: 'Pro Achse einstellen — überschreibt den gewählten Look.',
    modifierHint: 'Stil-Modifikatoren wie „Loft Film" verändern die Bildsprache deines Prompts.',
  },
  en: {
    title: 'Change style',
    description: 'Pick a look with one click — or fine-tune each axis.',
    looks: 'Looks',
    fine: 'Fine-tune',
    modifiers: 'Modifiers',
    looksHint: 'One-click director styles. Sets framing, angle, camera movement and lighting at once.',
    fineHint: 'Adjust each axis individually — overrides the chosen look.',
    modifierHint: 'Style modifiers like "Loft Film" change the visual language of your prompt.',
  },
  es: {
    title: 'Cambiar estilo',
    description: 'Elige un look con un clic — o ajusta cada eje en detalle.',
    looks: 'Looks',
    fine: 'Ajuste fino',
    modifiers: 'Modificadores',
    looksHint: 'Estilos de director en un clic. Define encuadre, ángulo, movimiento y luz a la vez.',
    fineHint: 'Ajusta cada eje individualmente — anula el look elegido.',
    modifierHint: 'Modificadores de estilo como "Loft Film" cambian el lenguaje visual del prompt.',
  },
} as const;

export default function SceneStyleSheet({
  open,
  onOpenChange,
  scene,
  language,
  onUpdate,
}: Props) {
  const L = t[language];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette className="h-4 w-4 text-primary" />
            {L.title}
          </DialogTitle>
          <DialogDescription>{L.description}</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="looks" className="mt-2">
          <TabsList className="grid grid-cols-3">
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

          <TabsContent value="looks" className="space-y-3 mt-4">
            <p className="text-[11px] text-muted-foreground">{L.looksHint}</p>
            <CinematicStylePresets
              value={scene.shotDirector || {}}
              onApply={(sel) => onUpdate({ shotDirector: sel })}
            />
          </TabsContent>

          <TabsContent value="fine" className="space-y-3 mt-4">
            <p className="text-[11px] text-muted-foreground">{L.fineHint}</p>
            <SceneShotDirectorPanel
              value={scene.shotDirector || {}}
              onChange={(shotDirector) => onUpdate({ shotDirector })}
              language={language}
            />
          </TabsContent>

          <TabsContent value="modifiers" className="space-y-3 mt-4">
            <p className="text-[11px] text-muted-foreground">{L.modifierHint}</p>
            <DirectorPresetPicker
              modifiers={scene.directorModifiers || {}}
              basePrompt={scene.aiPrompt || ''}
              onChange={(directorModifiers) => onUpdate({ directorModifiers })}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
