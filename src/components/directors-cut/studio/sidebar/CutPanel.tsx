import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Scissors, Sparkles, Loader2, Trash2, Copy, GripVertical, Plus, Pencil, Check } from 'lucide-react';
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
  onSceneAdd?: () => void;
  onSceneRename?: (sceneId: string, newName: string) => void;
  onTrimScene?: (sceneId: string, newStart: number, newEnd: number) => void;
}

const formatTime = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(2);
  return `${m}:${sec.padStart(5, '0')}`;
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
  onSceneAdd,
  onSceneRename,
  onTrimScene,
}) => {
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

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

      {/* Add new scene */}
      {onSceneAdd && (
        <Button
          onClick={onSceneAdd}
          variant="outline"
          size="sm"
          className="w-full border-[#3a3a3a] text-white/70 hover:bg-white/5"
        >
          <Plus className="h-3.5 w-3.5 mr-2" />
          Neue leere Szene
        </Button>
      )}

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
                    "flex flex-col gap-1 p-2 rounded-lg cursor-pointer transition-colors group",
                    selectedSceneId === scene.id
                      ? "bg-[#00d4ff]/15 border border-[#00d4ff]/30"
                      : "bg-[#2a2a2a] hover:bg-[#333] border border-transparent"
                  )}
                >
                  <div className="flex items-center gap-2">
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
                      {editingSceneId === scene.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingSceneId(null); }}
                            onBlur={commitEdit}
                            autoFocus
                            className="flex-1 bg-[#1a1a1a] border border-[#3a3a3a] rounded px-1.5 py-0.5 text-[11px] text-white/90 outline-none focus:border-[#00d4ff]/50"
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
                          className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-white"
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
                        className="w-14 h-5 px-1 bg-[#1a1a1a] border border-[#3a3a3a] rounded text-[9px] text-white/80 text-center"
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
                        className="w-14 h-5 px-1 bg-[#1a1a1a] border border-[#3a3a3a] rounded text-[9px] text-white/80 text-center"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
};
