import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Scissors, Sparkles, Loader2, Trash2, Copy, GripVertical, Plus, Pencil, Check, FileVideo, ChevronDown, ChevronUp, X, ArrowRightLeft } from 'lucide-react';
import { SceneAnalysis, TransitionAssignment } from '@/types/directors-cut';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

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
}

const formatTime = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(2);
  return `${m}:${sec.padStart(5, '0')}`;
};

const TRANSITION_TYPES = [
  { id: 'none', name: 'Keine', icon: '✕' },
  { id: 'fade', name: 'Fade', icon: '◐' },
  { id: 'crossfade', name: 'Crossfade', icon: '◑' },
  { id: 'slide', name: 'Slide', icon: '▶' },
  { id: 'zoom', name: 'Zoom', icon: '⊕' },
  { id: 'wipe', name: 'Wipe', icon: '▤' },
  { id: 'blur', name: 'Blur', icon: '◌' },
  { id: 'push', name: 'Push', icon: '⇥' },
] as const;

const TransitionBlock: React.FC<{
  sceneId: string;
  transition?: TransitionAssignment;
  onTransitionChange: (sceneId: string, type: string | null, duration?: number) => void;
}> = ({ sceneId, transition, onTransitionChange }) => {
  const [expanded, setExpanded] = useState(false);
  const hasTransition = transition && transition.transitionType !== 'none';

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
              <span>Übergang</span>
            </>
          )}
        </button>
      ) : (
        <div className="rounded-xl border border-cyan-500/20 bg-[#0a0a1a]/80 p-2.5 space-y-2.5 backdrop-blur-sm">
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

          {/* Transition type grid */}
          <div className="grid grid-cols-4 gap-1">
            {TRANSITION_TYPES.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  if (t.id === 'none') {
                    onTransitionChange(sceneId, null);
                  } else {
                    onTransitionChange(sceneId, t.id, transition?.duration ?? 1.2);
                  }
                }}
                className={cn(
                  "flex flex-col items-center gap-0.5 p-1.5 rounded-lg border text-[9px] transition-all",
                  (hasTransition && transition?.transitionType === t.id) || (!hasTransition && t.id === 'none')
                    ? "border-cyan-500/50 bg-cyan-500/15 text-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.15)]"
                    : "border-white/5 text-white/50 hover:border-white/15 hover:bg-white/5"
                )}
              >
                <span className="text-sm leading-none">{t.icon}</span>
                <span>{t.name}</span>
              </button>
            ))}
          </div>

          {/* Duration slider — only when a transition is active */}
          {hasTransition && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[9px] text-white/40">Dauer</span>
                <span className="text-[9px] text-cyan-300 font-mono">{transition!.duration.toFixed(1)}s</span>
              </div>
              <Slider
                value={[transition!.duration * 10]}
                min={1}
                max={30}
                step={1}
                onValueChange={([v]) => onTransitionChange(sceneId, transition!.transitionType, v / 10)}
                className="w-full"
              />
              <div className="flex justify-between text-[8px] text-white/20">
                <span>0.1s</span>
                <span>3.0s</span>
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
              Übergang entfernen
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
}) => {
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const videoInputRef = useRef<HTMLInputElement>(null);

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
    <div className="p-3 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="w-1 h-4 rounded-full bg-[#F5C76A]" />
        <Scissors className="h-4 w-4 text-cyan-400 drop-shadow-[0_0_6px_rgba(34,211,238,0.4)]" />
        <span className="text-sm font-medium text-white">Schnitt</span>
      </div>

      {/* Split at Playhead */}
      <Button
        onClick={onSplitAtPlayhead}
        disabled={scenes.length === 0}
        className="w-full bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-black font-medium shadow-[0_0_15px_rgba(34,211,238,0.2)]"
        size="sm"
      >
        <Scissors className="h-3.5 w-3.5 mr-2" />
        Am Playhead teilen (S)
      </Button>

      <p className="text-[10px] text-white/40">
        Playhead: {formatTime(currentTime)} — Klicke oder drücke S zum Teilen
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
        {onAddVideoAsScene && (
          <>
            <input
              ref={videoInputRef}
              type="file"
              className="hidden"
              accept="video/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onAddVideoAsScene(file);
                e.target.value = '';
              }}
            />
            <Button
              onClick={() => videoInputRef.current?.click()}
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

      {/* Optional Auto-Cut */}
      {onAutocut && (
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
              <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> Analysiert...</>
            ) : (
              <><Sparkles className="h-3.5 w-3.5 mr-2" /> Auto-Cut (KI-Analyse)</>
            )}
          </Button>
          <p className="text-[10px] text-white/30">
            KI erkennt automatisch Szenenwechsel. Optional.
          </p>
        </>
      )}

      {/* Scene List with Transition Blocks */}
      <div className="border-t border-[#F5C76A]/10 pt-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-[#F5C76A]/60 font-medium uppercase tracking-wider">
            Szenen ({scenes.length})
          </span>
        </div>

        {scenes.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-xs text-white/40">
              Noch keine Szenen. Nutze "Am Playhead teilen" oder "Auto-Cut".
            </p>
          </div>
        ) : (
          <ScrollArea className="max-h-[400px]">
            <div className="pr-1">
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
                            {scene.description || `Szene ${i + 1}`}
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
                            title="Umbenennen"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); onDuplicateScene(scene.id); }}
                          className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-white"
                          title="Duplizieren"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); onDeleteScene(scene.id); }}
                          className="p-1 rounded hover:bg-red-500/20 text-white/40 hover:text-red-400"
                          title="Löschen"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>

                    {/* Inline time editing when selected */}
                    {selectedSceneId === scene.id && onTrimScene && (
                      <div className="flex items-center gap-2 ml-8 mt-1" onClick={(e) => e.stopPropagation()}>
                        <label className="text-[9px] text-white/30">Start:</label>
                        <input
                          type="number"
                          step={0.01}
                          min={0}
                          value={scene.start_time.toFixed(2)}
                          onChange={(e) => {
                            const val = Math.max(0, parseFloat(e.target.value) || 0);
                            if (val < scene.end_time - 0.5) onTrimScene(scene.id, val, scene.end_time);
                          }}
                          className="w-14 h-5 px-1 bg-[#050816] border border-white/10 rounded text-[9px] text-white/80 text-center"
                        />
                        <label className="text-[9px] text-white/30">End:</label>
                        <input
                          type="number"
                          step={0.01}
                          min={0}
                          value={scene.end_time.toFixed(2)}
                          onChange={(e) => {
                            const val = Math.max(scene.start_time + 0.5, parseFloat(e.target.value) || 0);
                            onTrimScene(scene.id, scene.start_time, val);
                          }}
                          className="w-14 h-5 px-1 bg-[#050816] border border-white/10 rounded text-[9px] text-white/80 text-center"
                        />
                      </div>
                    )}
                  </div>

                  {/* Transition Block between scenes (not after last scene) */}
                  {i < scenes.length - 1 && onTransitionsChange && (
                    <TransitionBlock
                      sceneId={scenes[i + 1].id}
                      transition={transitions.find(t => t.sceneId === scenes[i + 1].id)}
                      onTransitionChange={handleTransitionChange}
                    />
                  )}
                </React.Fragment>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
};
