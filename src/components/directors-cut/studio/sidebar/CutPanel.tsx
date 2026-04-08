import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Scissors, Sparkles, Loader2, Trash2, Copy, GripVertical } from 'lucide-react';
import { SceneAnalysis, TransitionAssignment } from '@/types/directors-cut';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

interface CutPanelProps {
  scenes: SceneAnalysis[];
  transitions: TransitionAssignment[];
  selectedSceneId: string | null;
  currentTime: number;
  videoDuration: number;
  onSplitAtPlayhead: () => void;
  onDeleteScene: (sceneId: string) => void;
  onDuplicateScene: (sceneId: string) => void;
  onSceneSelect: (sceneId: string | null) => void;
  onAutocut?: () => void;
  isAnalyzing?: boolean;
}

const formatTime = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

export const CutPanel: React.FC<CutPanelProps> = ({
  scenes,
  transitions,
  selectedSceneId,
  currentTime,
  videoDuration,
  onSplitAtPlayhead,
  onDeleteScene,
  onDuplicateScene,
  onSceneSelect,
  onAutocut,
  isAnalyzing = false,
}) => {
  return (
    <div className="p-3 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Scissors className="h-4 w-4 text-[#00d4ff]" />
        <span className="text-sm font-medium text-white">Schnitt</span>
      </div>

      {/* Split at Playhead */}
      <Button
        onClick={onSplitAtPlayhead}
        disabled={scenes.length === 0}
        className="w-full bg-[#00d4ff] hover:bg-[#00b8e0] text-black font-medium"
        size="sm"
      >
        <Scissors className="h-3.5 w-3.5 mr-2" />
        Am Playhead teilen (S)
      </Button>

      <p className="text-[10px] text-white/40">
        Playhead: {formatTime(currentTime)} — Klicke oder drücke S zum Teilen
      </p>

      {/* Optional Auto-Cut */}
      {onAutocut && (
        <>
          <div className="border-t border-[#3a3a3a]" />
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

      {/* Scene List */}
      <div className="border-t border-[#3a3a3a] pt-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-white/50 font-medium uppercase tracking-wider">
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
            <div className="space-y-1 pr-1">
              {scenes.map((scene, i) => (
                <div
                  key={scene.id}
                  onClick={() => onSceneSelect(scene.id)}
                  className={cn(
                    "flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors group",
                    selectedSceneId === scene.id
                      ? "bg-[#00d4ff]/15 border border-[#00d4ff]/30"
                      : "bg-[#2a2a2a] hover:bg-[#333] border border-transparent"
                  )}
                >
                  <GripVertical className="h-3 w-3 text-white/20 flex-shrink-0" />
                  
                  <div className={cn(
                    "w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold flex-shrink-0",
                    scene.isBlackscreen 
                      ? "bg-zinc-700 text-zinc-400" 
                      : "bg-indigo-600/80 text-white"
                  )}>
                    {i + 1}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-white/80 truncate">
                      {scene.description || `Szene ${i + 1}`}
                    </p>
                    <p className="text-[9px] text-white/40">
                      {formatTime(scene.start_time)} – {formatTime(scene.end_time)} ({(scene.end_time - scene.start_time).toFixed(1)}s)
                    </p>
                  </div>

                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
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
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
};
