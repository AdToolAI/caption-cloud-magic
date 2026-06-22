/**
 * DirectorConsolePreview — read-only visualization of what the AI provider
 * will actually receive for this scene.
 *
 * Renders the 8-layer "screenplay" prompt assembled by `composeFinalPrompt`
 * plus a deterministic Audio Plan timeline when one has been locked via
 * `SceneDialogStudio` (Voiceover generieren).
 *
 * Why a separate panel?
 *  - The legacy `aiPrompt` textarea conflated subject/cinematography/dialog
 *    into one editable string, which led to the audio-plan race condition.
 *  - This panel is **derived only** (`useMemo`), so toggling characters,
 *    re-running TTS, or switching style presets always shows the live truth
 *    without ever overwriting source state.
 */
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Lock, Sparkles, Volume2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  composeFinalPrompt,
  formatAudioPlan,
  type DirectorLanguage,
} from '@/lib/motion-studio/composeFinalPrompt';
import { derivePerformanceEntries } from '@/lib/motion-studio/buildPerformanceBlock';
import type { ComposerScene, AudioPlan } from '@/types/video-composer';

interface DirectorConsolePreviewProps {
  scene: Pick<
    ComposerScene,
    | 'aiPrompt'
    | 'directorModifiers'
    | 'shotDirector'
    | 'cinematicPresetSlug'
    | 'audioPlan'
    | 'dialogLockedAt'
    | 'characterShot'
    | 'characterShots'
    | 'performance'
  >;
  /** Optional — used to render the [4 PERFORMANCE] block in the preview. */
  characters?: Array<{ id: string; name: string }>;
  language?: DirectorLanguage;
  className?: string;
}


const LAYER_COLORS: Record<string, string> = {
  '[1 SUBJECT]': 'text-amber-300',
  '[2 ACTION]': 'text-cyan-300',
  '[3 SHOT]': 'text-violet-300',
  '[4 PERFORMANCE]': 'text-fuchsia-300',

  '[5 DIALOG]': 'text-emerald-300',
  '[6 SFX]': 'text-pink-300',
  '[6 AMBIENT]': 'text-pink-300',
  '[8 NEGATIVE]': 'text-rose-400',
};

function highlightLayers(prompt: string): React.ReactNode {
  return prompt.split('\n').map((line, i) => {
    const tag = Object.keys(LAYER_COLORS).find((t) => line.startsWith(t));
    if (!tag) {
      return (
        <div key={i} className="pl-4 text-foreground/80">
          {line}
        </div>
      );
    }
    return (
      <div key={i} className="leading-relaxed">
        <span className={cn('font-mono text-[11px]', LAYER_COLORS[tag])}>{tag}</span>
        <span className="text-foreground/90">{line.slice(tag.length)}</span>
      </div>
    );
  });
}

function AudioTimeline({ plan }: { plan: AudioPlan }) {
  const total = Math.max(plan.totalSec || 1, 1);
  const speakerColor = (idx: number) =>
    [
      'bg-amber-400/70 border-amber-400',
      'bg-cyan-400/70 border-cyan-400',
      'bg-violet-400/70 border-violet-400',
      'bg-emerald-400/70 border-emerald-400',
    ][idx % 4];

  return (
    <div className="space-y-1.5">
      <div className="relative h-7 w-full rounded-md border border-border/40 bg-background/40 overflow-hidden">
        {plan.speakers.map((sp, idx) => {
          const left = `${(sp.startSec / total) * 100}%`;
          const width = `${Math.max(2, ((sp.endSec - sp.startSec) / total) * 100)}%`;
          return (
            <motion.div
              key={`${sp.characterId}:${idx}`}
              initial={{ opacity: 0, scaleY: 0.5 }}
              animate={{ opacity: 1, scaleY: 1 }}
              transition={{ duration: 0.25, delay: idx * 0.05 }}
              className={cn(
                'absolute top-0 h-full border-l-2',
                speakerColor(idx),
              )}
              style={{ left, width }}
              title={`${sp.name}: ${sp.text}`}
            >
              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium text-background/90 truncate px-1">
                {sp.name}
              </span>
            </motion.div>
          );
        })}
      </div>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
        <span>0.00s</span>
        <span>{plan.totalSec.toFixed(2)}s</span>
      </div>
    </div>
  );
}

export default function DirectorConsolePreview({
  scene,
  language = 'en',
  className,
}: DirectorConsolePreviewProps) {
  const result = useMemo(
    () =>
      composeFinalPrompt({
        rawPrompt: scene.aiPrompt || '',
        directorModifiers: scene.directorModifiers,
        shotDirector: scene.shotDirector,
        cinematicStylePresetId: scene.cinematicPresetSlug,
        audioPlan: scene.audioPlan,
        language,
      }),
    [
      scene.aiPrompt,
      scene.directorModifiers,
      scene.shotDirector,
      scene.cinematicPresetSlug,
      scene.audioPlan,
      language,
    ],
  );

  const locked = !!scene.dialogLockedAt && !!scene.audioPlan?.speakers?.length;
  const audioPlanText = scene.audioPlan
    ? formatAudioPlan(scene.audioPlan, language)
    : '';

  return (
    <div
      className={cn(
        'rounded-xl border border-amber-500/20 bg-gradient-to-b from-background/60 to-background/30 backdrop-blur-sm overflow-hidden',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/40 bg-amber-500/5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-amber-400" />
          <span className="text-xs font-semibold tracking-wide uppercase text-amber-300/90">
            Director Console — Live Prompt
          </span>
        </div>
        {locked ? (
          <Badge
            variant="outline"
            className="h-5 gap-1 border-amber-400/40 bg-amber-400/10 text-[10px] text-amber-200"
          >
            <Lock className="h-2.5 w-2.5" />
            Audio Plan Locked
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="h-5 border-border/40 text-[10px] text-muted-foreground"
          >
            Draft
          </Badge>
        )}
      </div>

      {/* Audio Timeline (only when locked) */}
      {locked && scene.audioPlan && (
        <div className="px-3 py-3 border-b border-border/30 space-y-2">
          <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <Volume2 className="h-3 w-3" />
            Audio Plan
          </div>
          <AudioTimeline plan={scene.audioPlan} />
          <pre className="mt-1.5 text-[10px] leading-relaxed text-foreground/70 font-mono whitespace-pre-wrap">
            {audioPlanText}
          </pre>
        </div>
      )}

      {/* Final Prompt */}
      <div className="px-3 py-3 space-y-1 max-h-72 overflow-y-auto">
        <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1.5">
          Final Prompt → Provider
        </div>
        <pre className="text-[11px] leading-relaxed font-mono whitespace-pre-wrap">
          {highlightLayers(result.finalPrompt)}
        </pre>
        {result.negativePrompt && (
          <div className="mt-2 pt-2 border-t border-border/30">
            <div className="text-[10px] uppercase text-rose-400/80 mb-0.5">
              negative_prompt (separate channel)
            </div>
            <div className="text-[10px] text-rose-300/80 font-mono">
              {result.negativePrompt}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
