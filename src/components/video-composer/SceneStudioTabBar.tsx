/**
 * SceneStudioTabBar — sticky pill nav inside an expanded SceneCard.
 *
 * Phase B of the "Studio-Set" UX refactor. Doesn't *hide* sections (the
 * expanded SceneCard has tightly-coupled effects across sections that we
 * deliberately keep mounted) — instead it scrolls the chosen section into
 * view, and SceneStudioSectionHeader marks each section so the user can
 * see where they are at any moment.
 */
import { useCallback } from 'react';
import { Film, Palette, Users, Volume2, Settings2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DirectorLanguage } from '@/lib/motion-studio/composeFinalPrompt';

export type SceneStudioTab = 'story' | 'look' | 'cast' | 'performance' | 'audio' | 'advanced';

interface BarProps {
  /** id of the SceneCard root (used to scope the querySelector). */
  cardId: string;
  language: DirectorLanguage;
  className?: string;
  /** Phase 3.1 — optional count chip per tab (only rendered when > 0). */
  badges?: Partial<Record<SceneStudioTab, number>>;
}


const LABELS = {
  en: {
    story: 'Story',
    look: 'Look',
    cast: 'Cast',
    performance: 'Performance',
    audio: 'Audio',
    advanced: 'Advanced',
  },
  de: {
    story: 'Story',
    look: 'Look',
    cast: 'Cast',
    performance: 'Performance',
    audio: 'Audio',
    advanced: 'Erweitert',
  },
  es: {
    story: 'Historia',
    look: 'Estilo',
    cast: 'Reparto',
    performance: 'Actuación',
    audio: 'Audio',
    advanced: 'Avanzado',
  },
} as const;

const ICONS: Record<SceneStudioTab, typeof Film> = {
  story: Film,
  look: Palette,
  cast: Users,
  performance: Sparkles,
  audio: Volume2,
  advanced: Settings2,
};

const TABS: SceneStudioTab[] = ['story', 'cast', 'performance', 'audio', 'look', 'advanced'];


export default function SceneStudioTabBar({ cardId, language, className, badges }: BarProps) {
  const handleScroll = useCallback(
    (tab: SceneStudioTab) => {
      const root = document.getElementById(cardId);
      if (!root) return;
      const target = root.querySelector(`[data-studio-section="${tab}"]`);
      if (!target) return;
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    [cardId],
  );

  return (
    <div
      className={cn(
        'sticky top-0 z-10 flex items-center gap-1 px-1 py-1 -mx-1 mb-2',
        'bg-card/85 backdrop-blur-sm border-b border-border/30',
        className,
      )}
      role="tablist"
      aria-label="Scene studio sections"
    >
      {TABS.map((tab) => {
        const Icon = ICONS[tab];
        const count = badges?.[tab] ?? 0;
        return (
          <button
            key={tab}
            type="button"
            onClick={() => handleScroll(tab)}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium',
              'text-muted-foreground hover:text-primary hover:bg-primary/10',
              'transition-colors border border-transparent hover:border-primary/30',
            )}
            title={LABELS[language][tab]}
          >
            <Icon className="h-3 w-3" />
            {LABELS[language][tab]}
            {count > 0 && (
              <span className="ml-0.5 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-primary/20 text-primary text-[9px] font-semibold tabular-nums">
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}


interface SectionProps {
  tab: SceneStudioTab;
  language: DirectorLanguage;
  /** Optional subtitle shown below the section title. */
  subtitle?: string;
  className?: string;
}

const SECTION_TITLES = {
  en: {
    story: { title: 'Story & Engine', sub: 'Script, duration and which AI model renders the clip' },
    cast: { title: 'Cast', sub: 'Characters appearing in this scene + face-lock anchor' },
    performance: { title: 'Performance', sub: 'Per-character expression, gesture, gaze and energy' },
    audio: { title: 'Audio & Voiceover', sub: 'Dialog studio, lip-sync and Director Score' },
    look: { title: 'Look & Cinematography', sub: 'One-click cinematic styles + reference frame' },
    advanced: { title: 'Advanced', sub: 'Final prompt, negative prompt and engine compare' },
  },
  de: {
    story: { title: 'Story & Engine', sub: 'Skript, Dauer und welches KI-Modell den Clip rendert' },
    cast: { title: 'Cast', sub: 'Charaktere in dieser Szene + Face-Lock-Anker' },
    performance: { title: 'Performance', sub: 'Mimik, Gestik, Blick und Energy pro Charakter' },
    audio: { title: 'Audio & Voiceover', sub: 'Skript-Studio, Lip-Sync und Director Score' },
    look: { title: 'Look & Bildsprache', sub: 'One-Click Cinematic Styles + Referenzbild' },
    advanced: { title: 'Erweitert', sub: 'Final-Prompt, Negative-Prompt und Engine-Vergleich' },
  },
  es: {
    story: { title: 'Historia y Motor', sub: 'Guion, duración y qué modelo IA renderiza el clip' },
    cast: { title: 'Reparto', sub: 'Personajes en esta escena + ancla de face-lock' },
    performance: { title: 'Actuación', sub: 'Expresión, gesto, mirada y energía por personaje' },
    audio: { title: 'Audio y Voz', sub: 'Estudio de guion, lip-sync y Director Score' },
    look: { title: 'Estilo y Cinematografía', sub: 'Estilos cinematográficos en un clic + frame de referencia' },
    advanced: { title: 'Avanzado', sub: 'Prompt final, prompt negativo y comparación de motores' },
  },
} as const;


/**
 * Visual divider that marks the start of a section inside an expanded
 * SceneCard. Provides the anchor target for SceneStudioTabBar.
 */
export function SceneStudioSectionHeader({ tab, language, subtitle, className }: SectionProps) {
  const Icon = ICONS[tab];
  const meta = SECTION_TITLES[language][tab];

  return (
    <div
      data-studio-section={tab}
      className={cn(
        'relative flex items-stretch gap-0 mt-4 mb-2 overflow-hidden rounded-lg',
        'first:mt-0',
        className,
      )}
      style={{
        background:
          'linear-gradient(180deg, hsla(225,32%,12%,0.55) 0%, hsla(228,38%,6%,0.35) 100%)',
        boxShadow:
          'inset 0 1px 0 hsla(43,90%,82%,0.16), inset 0 0 0 1px hsla(43,90%,68%,0.18), 0 0 0 1px hsla(43,90%,68%,0.10)',
      }}
    >
      {/* Hazard-stripe slate edge */}
      <div
        aria-hidden
        className="shrink-0 self-stretch w-1.5"
        style={{
          background:
            'repeating-linear-gradient(135deg, #0b0b0b 0 4px, hsl(43,90%,58%) 4px 8px)',
        }}
      />
      {/* Top filament */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background:
            'linear-gradient(90deg, transparent, hsla(43,90%,68%,0.55), transparent)',
        }}
      />
      <div className="flex flex-1 items-center gap-2.5 px-3 py-2 min-w-0">
        <div
          className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary"
          style={{ boxShadow: 'inset 0 0 0 1px hsla(43,90%,68%,0.25)' }}
        >
          <Icon className="h-3 w-3" />
        </div>
        <div className="flex-1 min-w-0">
          <div
            className="font-mono text-[9px] uppercase tracking-[0.32em] text-primary/85 leading-tight"
          >
            {meta.title}
          </div>
          <div
            className="text-[10px] text-muted-foreground/80 leading-tight truncate"
            style={{ fontFamily: "'Playfair Display', Georgia, serif", fontStyle: 'italic' }}
          >
            {subtitle ?? meta.sub}
          </div>
        </div>
      </div>
    </div>
  );
}

