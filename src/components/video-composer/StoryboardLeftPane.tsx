/**
 * StoryboardLeftPane — Stage 18: 3-mode segmented switcher that wraps the
 * entire scene-editing experience (Editor / Stil / Avatar).
 *
 * Each mode renders inline (no modal), so the user never loses sight of
 * their scene while bouncing between writing the prompt, choosing a look,
 * and dressing the character.
 */
import { ReactNode, useState } from 'react';
import { Pencil, Palette, UserSquare2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type LeftPaneMode = 'editor' | 'style' | 'avatar';

interface Props {
  mode: LeftPaneMode;
  onModeChange: (mode: LeftPaneMode) => void;
  sceneNumber?: number;
  totalScenes?: number;
  sceneTypeLabel?: string;
  editorSlot: ReactNode;
  styleSlot: ReactNode;
  avatarSlot: ReactNode;
  className?: string;
}

const TABS: Array<{
  id: LeftPaneMode;
  label: string;
  icon: typeof Pencil;
  hint: string;
}> = [
  { id: 'editor', label: 'Editor', icon: Pencil, hint: 'Prompt · Cast · Audio · Look · Erweitert' },
  { id: 'style', label: 'Stil', icon: Palette, hint: 'Looks · Feintuning · Modifier' },
  { id: 'avatar', label: 'Avatar', icon: UserSquare2, hint: 'Character Workshop · Wardrobe · Voice' },
];

export default function StoryboardLeftPane({
  mode,
  onModeChange,
  sceneNumber,
  totalScenes,
  sceneTypeLabel,
  editorSlot,
  styleSlot,
  avatarSlot,
  className,
}: Props) {
  const activeHint = TABS.find((t) => t.id === mode)?.hint;

  return (
    <div className={cn('flex flex-col gap-3 min-w-0', className)}>
      {/* Header row: scene chip + segmented switch */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        {sceneNumber !== undefined && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.18em] text-primary font-bold">
              Studio
            </span>
            <span className="text-[10px] text-muted-foreground">
              Szene {sceneNumber}
              {totalScenes ? ` / ${totalScenes}` : ''}
              {sceneTypeLabel ? ` · ${sceneTypeLabel}` : ''}
            </span>
          </div>
        )}

        <div className="ml-auto inline-flex items-center rounded-xl border border-border/40 bg-card/50 backdrop-blur-md p-0.5 shadow-soft">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = mode === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onModeChange(tab.id)}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all duration-200',
                  active
                    ? 'bg-primary/15 text-primary shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.45)]'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/40',
                )}
                aria-pressed={active}
              >
                <Icon className="h-3 w-3" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {activeHint && (
        <p className="text-[10px] text-muted-foreground/80 px-1 -mt-1">{activeHint}</p>
      )}

      {/* Body */}
      <div className="rounded-2xl bg-card/30 border border-border/40 backdrop-blur-sm shadow-soft p-3">
        {mode === 'editor' && editorSlot}
        {mode === 'style' && styleSlot}
        {mode === 'avatar' && avatarSlot}
      </div>
    </div>
  );
}
