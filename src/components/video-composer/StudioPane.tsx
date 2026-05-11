/**
 * StudioPane — sticky right column that hosts the **persistent scene editor**
 * for the currently selected scene from the StoryboardSceneStrip.
 *
 * The actual editor UI (prompt, cast, style, render controls) lives in the
 * existing <SceneCard /> component and is mounted as `children`. This wrapper
 * adds a clear "Editor" header so users immediately understand they can edit
 * here — fixing the previous "Studio öffnen" discoverability problem.
 */
import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Sparkles } from 'lucide-react';

interface StudioPaneProps {
  sceneNumber?: number;
  totalScenes?: number;
  sceneTypeLabel?: string;
  children: ReactNode;
  className?: string;
}

export function StudioPane({
  sceneNumber,
  totalScenes,
  sceneTypeLabel,
  children,
  className,
}: StudioPaneProps) {
  return (
    <div className={cn('flex flex-col gap-3 min-w-0', className)}>
      {/* Editor header — visually fuses the strip selection with the editor below */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 border border-primary/30">
            <Sparkles className="h-3 w-3 text-primary" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-primary font-bold leading-none">
              Editor
            </div>
            {sceneNumber !== undefined && (
              <div className="text-[10px] text-muted-foreground mt-0.5">
                Szene {sceneNumber}
                {totalScenes ? ` / ${totalScenes}` : ''}
                {sceneTypeLabel ? ` · ${sceneTypeLabel}` : ''}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Pane body — host for the existing SceneCard */}
      <div className="rounded-2xl bg-card/30 border border-border/40 backdrop-blur-sm shadow-soft p-2 sm:p-3">
        {children}
      </div>
    </div>
  );
}

export default StudioPane;
