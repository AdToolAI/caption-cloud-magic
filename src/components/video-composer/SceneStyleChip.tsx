/**
 * SceneStyleChip — Phase 2 of the "Studio Set" simplification.
 *
 * Compact inline chip that lives in the SceneCard's prompt area. Shows the
 * currently active cinematic look (or "Auto / no style") and a small
 * "Stil ändern" button that opens SceneStyleSheet. Replaces the three
 * always-visible style tools (DirectorPresetPicker, CinematicStylePresets,
 * SceneShotDirectorPanel) that used to sit below the prompt textarea.
 */
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Palette, X } from 'lucide-react';
import {
  CINEMATIC_STYLE_PRESETS,
  matchPresetToSelection,
} from '@/config/cinematicStylePresets';
import type { ShotSelection } from '@/config/shotDirector';

type Lang = 'de' | 'en' | 'es';

interface Props {
  language: Lang;
  shotDirector?: ShotSelection;
  hasModifiers: boolean;
  onOpen: () => void;
  onReset: () => void;
}

const t = {
  de: { label: 'Stil', auto: 'Kein Stil · Auto', change: 'Stil ändern', mods: 'Modifier aktiv', reset: 'Zurücksetzen' },
  en: { label: 'Style', auto: 'No style · Auto', change: 'Change style', mods: 'Modifiers active', reset: 'Reset' },
  es: { label: 'Estilo', auto: 'Sin estilo · Auto', change: 'Cambiar estilo', mods: 'Modificadores activos', reset: 'Restablecer' },
} as const;

export default function SceneStyleChip({
  language,
  shotDirector,
  hasModifiers,
  onOpen,
  onReset,
}: Props) {
  const L = t[language];
  const activeId = matchPresetToSelection(shotDirector || {});
  const active = activeId
    ? CINEMATIC_STYLE_PRESETS.find((p) => p.id === activeId)
    : null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {L.label}:
      </span>
      {active ? (
        <Badge
          variant="outline"
          className="gap-1.5 border-primary/40 bg-primary/10 text-primary text-[11px] py-0.5"
        >
          <span>{active.emoji}</span>
          <span>{active.name[language]}</span>
          <button
            type="button"
            onClick={onReset}
            className="ml-1 hover:text-primary-foreground/80"
            aria-label={L.reset}
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ) : (
        <Badge variant="outline" className="text-[11px] py-0.5 text-muted-foreground border-border">
          {L.auto}
        </Badge>
      )}
      {hasModifiers && (
        <Badge variant="outline" className="text-[10px] py-0.5 border-amber-500/40 bg-amber-500/10 text-amber-300">
          {L.mods}
        </Badge>
      )}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={onOpen}
        className="h-6 px-2 text-[10px] gap-1 text-primary/80 hover:text-primary"
      >
        <Palette className="h-3 w-3" />
        {L.change}
      </Button>
    </div>
  );
}
