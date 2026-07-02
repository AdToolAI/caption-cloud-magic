import React, { useState, useRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Scissors, Sparkles, Loader2, Trash2, Copy, GripVertical, Plus, Pencil, Check, FileVideo, ChevronDown, ChevronUp, X, ArrowRightLeft } from 'lucide-react';
import { SceneAnalysis, TransitionAssignment } from '@/types/directors-cut';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useTranslation } from '@/hooks/useTranslation';
import { TransitionPreviewTile, type TransitionId } from '@/components/studio-visual/TransitionPreviewTile';
import { resolveTransitions, type ResolvedTransition } from '@/utils/transitionResolver';

interface CutPanelProps {
  scenes: SceneAnalysis[];
  transitions: TransitionAssignment[];
  onTransitionsChange?: (transitions: TransitionAssignment[]) => void;
  selectedSceneId: string | null;
  currentTime: number;
  videoDuration: number;
  onSplitAtPlayhead: () => void;
  onDeleteScene: (sceneId: string) => void;
  onDuplicateScene: (sceneId: string) => void;
  onSceneSelect: (sceneId: string | null) => void;
  onAutocut?: () => void;
  isAnalyzing?: boolean;
  onSceneAdd?: () => void;
  onSceneRename?: (sceneId: string, newName: string) => void;
  onTrimScene?: (sceneId: string, newStart: number, newEnd: number) => void;
  onAddVideoAsScene?: (file: File) => void;
  onAddFromLibrary?: () => void;
  /** When set, scenes were imported from a Composer render's EDL — auto-cut is locked. */
  composerLockSource?: 'edl' | 'edl-rebuilt' | 'sceneGeometry-fallback' | 'composer-scenes-fallback' | null;
  composerLockSceneCount?: number;
}

const formatTime = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(2);
  return `${m}:${sec.padStart(5, '0')}`;
};

const TRANSITION_TYPES: { id: TransitionId; name: string }[] = [
  { id: 'none', name: 'Keine' },
  { id: 'fade', name: 'Fade' },
  { id: 'crossfade', name: 'Crossfade' },
  { id: 'slide', name: 'Slide' },
  { id: 'zoom', name: 'Zoom' },
  { id: 'wipe', name: 'Wipe' },
  { id: 'blur', name: 'Blur' },
  { id: 'push', name: 'Push' },
];

const DEFAULT_TRANSITION_DURATION = 1.2;
const MIN_TRANSITION_DURATION = 0.2;
const MAX_TRANSITION_DURATION = 3.0;

const clampDuration = (v: number) =>
  Math.min(MAX_TRANSITION_DURATION, Math.max(MIN_TRANSITION_DURATION, Math.round(v * 10) / 10));

const TransitionBlock: React.FC<{
  t: (key: string, params?: Record<string, string | number>) => any;
  sceneId: string;
  transition?: TransitionAssignment;
  resolvedTransition?: ResolvedTransition;
  onTransitionChange: (sceneId: string, type: string | null, duration?: number) => void;
}> = ({ t, sceneId, transition, resolvedTransition, onTransitionChange }) => {
  const [expanded, setExpanded] = useState(false);
  const hasTransition = transition && transition.transitionType !== 'none';
  const activeDuration = hasTransition ? transition!.duration : DEFAULT_TRANSITION_DURATION;
  const [durationInput, setDurationInput] = useState<string>(activeDuration.toFixed(1));

  // Keep input in sync when parent state changes
  React.useEffect(() => {
    setDurationInput(activeDuration.toFixed(1));
  }, [activeDuration]);

  const applyDuration = (next: number) => {
    if (!hasTransition) return;
    const clamped = clampDuration(next);
    onTransitionChange(sceneId, transition!.transitionType, clamped);
  };

  return (
    <div className="my-1 mx-2">
      {!expanded ? (
        <button
          onClick={() => setExpanded(true)}
          className={cn(
            "w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-dashed transition-all text-[10px]",
            hasTransition
              ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20"
              : "border-white/10 text-white/30 hover:border-white/20 hover:text-white/50 hover:bg-white/5"
          )}
        >
          {hasTransition ? (
            <>
              <ArrowRightLeft className="h-3 w-3" />
              <span className="capitalize font-medium">{transition!.transitionType}</span>
              <span className="text-white/40">({transition!.duration.toFixed(1)}s)</span>
            </>
          ) : (
            <>
              <Plus className="h-3 w-3" />
              <span>{t('dc.transition')}</span>
            </>
          )}
        </button>
      ) : (
        <div className="rounded-xl border border-cyan-500/20 bg-[#0a0a1a]/80 p-2.5 space-y-2.5 backdrop-blur-sm min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-cyan-300 font-medium uppercase tracking-wider flex items-center gap-1">
              <ArrowRightLeft className="h-3 w-3" />
              Übergang
            </span>
            <button
              onClick={() => setExpanded(false)}
              className="p-0.5 rounded hover:bg-white/10 text-white/40 hover:text-white"
            >
              <ChevronUp className="h-3 w-3" />
            </button>
          </div>

          {/* Transition type grid (animated mini-loops) */}
          <div className="grid grid-cols-4 gap-1.5">
            {TRANSITION_TYPES.map((tr) => {
              const active = (hasTransition && transition?.transitionType === tr.id)
                || (!hasTransition && tr.id === 'none');
              return (
                <TransitionPreviewTile
                  key={tr.id}
                  transitionId={tr.id}
                  label={tr.id === 'none' ? t('dc.transitionNone') : tr.name}
                  isActive={active}
                  size="sm"
                  onClick={() => {
                    if (tr.id === 'none') {
                      onTransitionChange(sceneId, null);
                    } else {
                      // Normalize: if existing duration is absurdly small (<0.3s), reset to default.
                      const existing = transition?.duration ?? 0;
                      const nextDur = existing >= 0.3 ? existing : DEFAULT_TRANSITION_DURATION;
                      onTransitionChange(sceneId, tr.id, clampDuration(nextDur));
                    }
                  }}
                />
              );
            })}
          </div>

          {/* Duration controls — only when a transition is active */}
          {hasTransition && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[9px] text-white/40 uppercase tracking-wider">{t('dc.duration')}</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => applyDuration(activeDuration - 0.1)}
                    disabled={activeDuration <= MIN_TRANSITION_DURATION}
                    className="w-6 h-6 rounded bg-white/5 hover:bg-white/10 text-white/70 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed text-sm leading-none flex items-center justify-center"
                    aria-label="Kürzer"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={MIN_TRANSITION_DURATION}
                    max={MAX_TRANSITION_DURATION}
                    step={0.1}
                    value={durationInput}
                    onChange={(e) => setDurationInput(e.target.value)}
                    onBlur={() => {
                      const parsed = parseFloat(durationInput);
                      if (Number.isFinite(parsed)) applyDuration(parsed);
                      else setDurationInput(activeDuration.toFixed(1));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const parsed = parseFloat(durationInput);
                        if (Number.isFinite(parsed)) applyDuration(parsed);
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    className="w-14 h-6 px-1.5 text-center text-[11px] font-mono bg-black/40 border border-cyan-500/20 rounded text-cyan-200 focus:border-cyan-400 focus:outline-none"
                  />
                  <span className="text-[10px] text-white/40">s</span>
                  <button
                    onClick={() => applyDuration(activeDuration + 0.1)}
                    disabled={activeDuration >= MAX_TRANSITION_DURATION}
                    className="w-6 h-6 rounded bg-white/5 hover:bg-white/10 text-white/70 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed text-sm leading-none flex items-center justify-center"
                    aria-label="Länger"
                  >
                    +
                  </button>
                </div>
              </div>
              <Slider
                value={[Math.round(activeDuration * 10)]}
                min={Math.round(MIN_TRANSITION_DURATION * 10)}
                max={Math.round(MAX_TRANSITION_DURATION * 10)}
                step={1}
                onValueChange={([v]) => applyDuration(v / 10)}
                className="w-full"
              />
              <div className="flex justify-between text-[8px] text-white/30">
                <span>{MIN_TRANSITION_DURATION.toFixed(1)}s</span>
                <span>{((MIN_TRANSITION_DURATION + MAX_TRANSITION_DURATION) / 2).toFixed(1)}s</span>
                <span>{MAX_TRANSITION_DURATION.toFixed(1)}s</span>
              </div>

              {/* Visual transition window preview */}
              <div className="pt-1">
                <div className="flex items-center justify-between text-[8px] text-white/30 mb-1 uppercase tracking-wider">
                  <span>Übergangsfenster</span>
                  <span className={cn(
                    "rounded px-1 py-0.5 normal-case tracking-normal",
                    resolvedTransition?.placement === 'centered'
                      ? "bg-emerald-500/10 text-emerald-300"
                      : "bg-cyan-500/10 text-cyan-300"
                  )}>
                    {resolvedTransition?.placement === 'centered' ? 'NLE-zentriert' : 'ab Schnittkante'}
                  </span>
                </div>
                <div className="relative h-4 rounded overflow-hidden bg-black/40 border border-white/5">
                  <div
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-fuchsia-500/40 to-cyan-500/40"
                    style={{ width: `${(activeDuration / MAX_TRANSITION_DURATION) * 100}%` }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center text-[9px] font-mono text-white/90">
                    {resolvedTransition?.placement === 'centered'
                      ? `-${(activeDuration / 2).toFixed(1)}s | Cut | +${(activeDuration / 2).toFixed(1)}s`
                      : `Cut | +${activeDuration.toFixed(1)}s Übergang`}
                  </div>
                </div>
                {resolvedTransition?.placement !== 'centered' && (
                  <p className="mt-1 text-[8px] leading-snug text-white/35">
                    Keine freien Handles erkannt – deshalb sauberer Edge-Übergang statt zu frühem Vorziehen.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Remove button */}
          {hasTransition && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { onTransitionChange(sceneId, null); setExpanded(false); }}
              className="w-full h-6 text-[10px] text-red-400/70 hover:text-red-400 hover:bg-red-500/10"
            >
              <X className="h-3 w-3 mr-1" />
              {t('dc.removeTransition')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

export const CutPanel: React.FC<CutPanelProps> = ({
  scenes,
  transitions,
  onTransitionsChange,
  selectedSceneId,
  currentTime,
  videoDuration,
  onSplitAtPlayhead,
  onDeleteScene,
  onDuplicateScene,
  onSceneSelect,
  onAutocut,
  isAnalyzing = false,
  onSceneAdd,
  onSceneRename,
  onTrimScene,
  onAddVideoAsScene,
  onAddFromLibrary,
  composerLockSource = null,
  composerLockSceneCount = 0,
}) => {
  const { t } = useTranslation();
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const videoInputRef = useRef<HTMLInputElement>(null);

  const resolvedTransitions = useMemo(
    () => resolveTransitions([...scenes].sort((a, b) => a.start_time - b.start_time), transitions),
    [scenes, transitions],
  );

  const startEditing = (scene: SceneAnalysis) => {
    setEditingSceneId(scene.id);
    setEditName(scene.description || '');
  };

  const commitEdit = () => {
    if (editingSceneId && onSceneRename) {
      onSceneRename(editingSceneId, editName);
    }
    setEditingSceneId(null);
  };

  const handleTransitionChange = (sceneId: string, type: string | null, duration?: number) => {
    if (!onTransitionsChange) return;
    
    if (!type || type === 'none') {
      // Remove transition
      onTransitionsChange(transitions.filter(t => t.sceneId !== sceneId));
    } else {
      const existing = transitions.find(t => t.sceneId === sceneId);
      if (existing) {
        onTransitionsChange(transitions.map(t =>
          t.sceneId === sceneId ? { ...t, transitionType: type, duration: duration ?? t.duration } : t
        ));
      } else {
        onTransitionsChange([...transitions, {
          sceneId,
          transitionType: type,
          duration: duration ?? 1.2,
          aiSuggested: false,
        }]);
      }
    }
  };

  return (
    <div className="p-3 pb-32 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="w-1 h-4 rounded-full bg-[#F5C76A]" />
        <Scissors className="h-4 w-4 text-cyan-400 drop-shadow-[0_0_6px_rgba(34,211,238,0.4)]" />
        <span className="text-sm font-medium text-white">{t('dc.cutTitle')}</span>
      </div>

      {/* Split at Playhead */}
      <Button
        onClick={onSplitAtPlayhead}
        disabled={scenes.length === 0}
        className="w-full bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-black font-medium shadow-[0_0_15px_rgba(34,211,238,0.2)]"
        size="sm"
      >
        <Scissors className="h-3.5 w-3.5 mr-2" />
        {t('dc.splitAtPlayhead')}
      </Button>

      <p className="text-[10px] text-white/40">
        {t('dc.playheadInfo', { time: formatTime(currentTime) })}
      </p>

      {/* Add new scene */}
      <div className="flex gap-2">
        {onSceneAdd && (
          <Button
            onClick={onSceneAdd}
            variant="outline"
            size="sm"
            className="flex-1 border-white/10 text-white/70 hover:bg-white/5 hover:border-cyan-500/30"
          >
            <Plus className="h-3.5 w-3.5 mr-2" />
            Leere Szene
          </Button>
        )}
        {(onAddVideoAsScene || onAddFromLibrary) && (
          <>
            <input
              ref={videoInputRef}
              type="file"
              className="hidden"
              accept="video/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file && onAddVideoAsScene) onAddVideoAsScene(file);
                e.target.value = '';
              }}
            />
            <Button
              onClick={() => {
                if (onAddFromLibrary) {
                  onAddFromLibrary();
                } else {
                  videoInputRef.current?.click();
                }
              }}
              variant="outline"
              size="sm"
              className="flex-1 border-white/10 text-white/70 hover:bg-white/5 hover:border-cyan-500/30"
            >
              <FileVideo className="h-3.5 w-3.5 mr-2" />
              Video hinzufügen
            </Button>
          </>
        )}
      </div>

      {/* Composer EDL Lock badge */}
      {composerLockSource && (
        <div className="rounded-md border border-[#F5C76A]/30 bg-[#F5C76A]/5 px-3 py-2">
          <div className="flex items-center gap-2 text-[11px] font-medium text-[#F5C76A]">
            <Sparkles className="h-3.5 w-3.5" />
            <span>
              Composer{' '}
              {composerLockSource === 'edl'
                ? 'EDL (frame-genau)'
                : composerLockSource === 'edl-rebuilt'
                  ? 'EDL rekonstruiert'
                  : composerLockSource === 'sceneGeometry-fallback'
                    ? 'Geometrie'
                    : 'Nur Dauern'}{' '}
              · {composerLockSceneCount} Szenen
            </span>
          </div>
          <p className="mt-1 text-[10px] text-white/40 leading-snug">
            Diese Szenen kommen direkt aus deinem Composer-Render – Auto-Cut
            ist deaktiviert, damit die echten Schnittpunkte nicht überschrieben
            werden.
          </p>
        </div>
      )}

      {/* Optional Auto-Cut */}
      {onAutocut && !composerLockSource && (
        <>
          <div className="border-t border-[#F5C76A]/10" />
          <Button
            onClick={onAutocut}
            disabled={isAnalyzing}
            variant="outline"
            size="sm"
            className="w-full border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
          >
            {isAnalyzing ? (
              <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> {t('dc.analyzing')}</>
            ) : (
              <><Sparkles className="h-3.5 w-3.5 mr-2" /> {t('dc.autoCutAI')}</>
            )}
          </Button>
          <p className="text-[10px] text-white/30">
            {t('dc.autoCutDesc')}
          </p>
        </>
      )}

      {/* Scene List with Transition Blocks */}
      <div className="border-t border-[#F5C76A]/10 pt-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-[#F5C76A]/60 font-medium uppercase tracking-wider">
            {t('dc.scenesCount', { count: scenes.length })}
          </span>
        </div>

        {scenes.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-xs text-white/40">
              {t('dc.noScenesYet')}
            </p>
          </div>
        ) : (
          <div className="pr-1 pb-4">
            {scenes.map((scene, i) => (
                <React.Fragment key={scene.id}>
                  {/* Scene Card */}
                  <div
                    onClick={() => onSceneSelect(scene.id)}
                    className={cn(
                      "flex flex-col gap-1 p-2 rounded-xl cursor-pointer transition-all group border backdrop-blur-sm",
                      selectedSceneId === scene.id
                        ? "bg-cyan-500/10 border-cyan-500/30 shadow-[0_0_12px_rgba(34,211,238,0.1)]"
                        : "bg-[#0a0a1a]/60 hover:bg-white/5 border-white/5 hover:border-white/10"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <GripVertical className="h-3 w-3 text-white/20 flex-shrink-0" />
                      
                      <div className={cn(
                        "w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold flex-shrink-0",
                        scene.isBlackscreen 
                          ? "bg-zinc-700 text-zinc-400" 
                          : "bg-cyan-500/20 text-cyan-300"
                      )}>
                        {i + 1}
                      </div>

                      <div className="flex-1 min-w-0">
                        {editingSceneId === scene.id ? (
                          <div className="flex items-center gap-1">
                            <input
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingSceneId(null); }}
                              onBlur={commitEdit}
                              autoFocus
                              className="flex-1 bg-[#050816] border border-cyan-500/30 rounded px-1.5 py-0.5 text-[11px] text-white/90 outline-none focus:border-cyan-400/60"
                              onClick={(e) => e.stopPropagation()}
                            />
                            <button onClick={(e) => { e.stopPropagation(); commitEdit(); }} className="p-0.5 text-green-400">
                              <Check className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <p className="text-[11px] text-white/80 truncate">
                            {scene.description || t('dc.scene', { n: i + 1 })}
                          </p>
                        )}
                        <p className="text-[9px] text-white/40">
                          {formatTime(scene.start_time)} – {formatTime(scene.end_time)} ({(scene.end_time - scene.start_time).toFixed(2)}s)
                        </p>
                      </div>

                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        {onSceneRename && editingSceneId !== scene.id && (
                          <button
                            onClick={(e) => { e.stopPropagation(); startEditing(scene); }}
                            className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-cyan-300"
                            title={t('dc.rename')}
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); onDuplicateScene(scene.id); }}
                          className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-white"
                          title={t('dc.duplicate')}
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); onDeleteScene(scene.id); }}
                          className="p-1 rounded hover:bg-red-500/20 text-white/40 hover:text-red-400"
                          title={t('dc.deleteLabel')}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>

                    {/* Inline-Mini-Trim entfernt — Trim erfolgt jetzt komfortabel
                        im Inspector rechts über den SceneTrimInspector. */}
                  </div>

                  {/* Transition Block between scenes (not after last scene) */}
                  {i < scenes.length - 1 && onTransitionsChange && (
                    <TransitionBlock
                      t={t}
                      sceneId={scene.id}
                      transition={transitions.find(t => t.sceneId === scene.id)}
                      resolvedTransition={resolvedTransitions.find(t => t.outgoingSceneId === scene.id)}
                      onTransitionChange={handleTransitionChange}
                    />
                  )}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
