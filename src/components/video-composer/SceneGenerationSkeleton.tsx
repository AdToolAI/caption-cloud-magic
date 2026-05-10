import { useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { ComposerScene } from '@/types/video-composer';
import { useProviderEta } from '@/hooks/useProviderEta';

interface SceneGenerationSkeletonProps {
  scene: ComposerScene;
}

/**
 * Phase 5.2 — Optimistic generation skeleton.
 *
 * Replaces the legacy "grey box + spinner" with a provider-tinted, animated
 * skeleton that conveys:
 *   - WHO is rendering (provider name + tint)
 *   - HOW LONG it will take (live ETA + filling progress bar)
 *   - WHAT it will look like (cinematic preset badge if set)
 *
 * Pure frontend / zero-API. ETA comes from `useProviderEta` (hardcoded
 * provider medians). Local timer tracks elapsed wall-clock since the
 * scene flipped to `generating`. Bar caps at 95% so the user knows we're
 * waiting on the actual provider, not faking completion.
 */
export function SceneGenerationSkeleton({ scene }: SceneGenerationSkeletonProps) {
  const { etaSeconds, tint, label } = useProviderEta(
    scene.clipSource,
    scene.durationSeconds,
    scene.clipQuality,
  );

  // Track wall-clock elapsed since this scene entered the 'generating'
  // state. Reset whenever the scene id or status changes.
  const startRef = useRef<number>(Date.now());
  const lastKey = useRef<string>(`${scene.id}-${scene.clipStatus}`);
  if (lastKey.current !== `${scene.id}-${scene.clipStatus}`) {
    lastKey.current = `${scene.id}-${scene.clipStatus}`;
    startRef.current = Date.now();
  }

  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => {
      setElapsed(Math.round((Date.now() - startRef.current) / 1000));
    }, 500);
    return () => window.clearInterval(t);
  }, [scene.id]);

  const progress = Math.min(95, Math.round((elapsed / Math.max(1, etaSeconds)) * 100));
  const remaining = Math.max(0, etaSeconds - elapsed);

  return (
    <div
      className="relative w-full h-full overflow-hidden flex flex-col items-center justify-center gap-1.5"
      style={{
        background: `linear-gradient(135deg, hsl(${tint} / 0.18), hsl(var(--background)) 60%, hsl(${tint} / 0.12))`,
      }}
    >
      {/* Shimmer wave */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `linear-gradient(90deg, transparent, hsl(${tint} / 0.28), transparent)`,
          animation: 'composerShimmer 1.6s infinite',
          transform: 'translateX(-100%)',
        }}
      />

      {/* Provider chip */}
      <div
        className="relative z-10 flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium border"
        style={{
          borderColor: `hsl(${tint} / 0.6)`,
          background: `hsl(${tint} / 0.15)`,
          color: `hsl(${tint})`,
        }}
      >
        <Sparkles className="h-2.5 w-2.5" />
        {label}
      </div>

      {/* Cinematic preset (if any) */}
      {scene.cinematicPresetSlug && (
        <div className="relative z-10 text-[8px] text-foreground/60 italic">
          {scene.cinematicPresetSlug.replace(/-/g, ' ')}
        </div>
      )}

      {/* Live ETA */}
      <div className="relative z-10 text-[9px] text-foreground/70 font-mono tabular-nums">
        {elapsed}s · ≈ {remaining}s verbleibend
      </div>

      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-background/40">
        <div
          className="h-full transition-[width] duration-500 ease-out"
          style={{
            width: `${progress}%`,
            background: `linear-gradient(90deg, hsl(${tint} / 0.7), hsl(${tint}))`,
            boxShadow: `0 0 8px hsl(${tint} / 0.5)`,
          }}
        />
      </div>

      <style>{`
        @keyframes composerShimmer {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}
