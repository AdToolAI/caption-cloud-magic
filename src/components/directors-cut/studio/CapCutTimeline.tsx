import React, { useRef, useCallback, useState, useEffect } from 'react';
import { AudioTrack, AudioClip, SubtitleClip, SubtitleTrack } from '@/types/timeline';
import { SceneAnalysis } from '@/types/directors-cut';
import { Volume2, VolumeX, Headphones, Plus, Minus, X, PlusCircle, Film, Square, ChevronDown, GripVertical, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface CapCutTimelineProps {
  tracks: AudioTrack[];
  scenes: SceneAnalysis[];
  currentTime: number;
  duration: number;
  zoom: number;
  selectedClipId: string | null;
  selectedSceneId?: string | null;
  subtitleTrack?: SubtitleTrack;
  onSeek: (time: number) => void;
  onZoomChange: (zoom: number) => void;
  onClipSelect: (clipId: string | null) => void;
  onSceneSelect?: (sceneId: string | null) => void;
  onTrackMute: (trackId: string) => void;
  onTrackSolo: (trackId: string) => void;
  onClipDelete?: (clipId: string) => void;
  onClipResize?: (clipId: string, side: 'left' | 'right', newStartTime: number, newDuration: number) => void;
  onSceneDelete?: (sceneId: string) => void;
  onSceneAdd?: () => void;
  onSceneAddFromMedia?: () => void;
  onSubtitleUpdate?: (clipId: string, updates: Partial<SubtitleClip>) => void;
  onSubtitleDelete?: (clipId: string) => void;
  onSubtitleSelect?: (clipId: string | null) => void;
  selectedSubtitleId?: string | null;
}

const TRACK_HEIGHT = 48;
const HEADER_WIDTH = 120;

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// Draggable Scene Component
const DraggableScene: React.FC<{
  scene: SceneAnalysis;
  index: number;
  zoom: number;
  isSelected: boolean;
  onSeek: (time: number) => void;
  onSelect: () => void;
  onDelete?: () => void;
}> = ({ scene, index, zoom, isSelected, onSeek, onSelect, onDelete }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `scene-drag-${scene.id}`,
    data: { scene, index, type: 'scene' },
  });

  const style = {
    left: `${scene.start_time * zoom}px`,
    width: `${(scene.end_time - scene.start_time) * zoom}px`,
    transform: transform ? `translate3d(${transform.x}px, 0, 0)` : undefined,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "absolute top-1 bottom-1 rounded flex items-center cursor-grab active:cursor-grabbing group transition-all",
        isDragging && "opacity-50 ring-2 ring-cyan-400",
        isSelected && "ring-2 ring-[#00d4ff]",
        scene.isBlackscreen 
          ? "bg-zinc-800/80 border border-dashed border-zinc-600 hover:border-zinc-500" 
          : "bg-indigo-600/80 hover:brightness-110"
      )}
      onClick={(e) => { e.stopPropagation(); onSelect(); onSeek(scene.start_time); }}
      {...attributes}
      {...listeners}
    >
      <div className="absolute left-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-60 transition-opacity">
        <GripVertical className="h-3 w-3 text-white" />
      </div>
      
      <span className="text-[10px] text-white/90 font-medium mx-auto">
        {scene.isBlackscreen ? '⬛' : index + 1}
      </span>
      
      {onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 hover:bg-red-600 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-20"
        >
          <X className="h-2.5 w-2.5 text-white" />
        </button>
      )}
    </div>
  );
};

// Draggable Clip Component with resize handles
const DraggableClip: React.FC<{
  clip: AudioClip;
  zoom: number;
  isSelected: boolean;
  onSelect: () => void;
  onDelete?: () => void;
  onResizeStart?: (side: 'left' | 'right') => void;
}> = ({ clip, zoom, isSelected, onSelect, onDelete, onResizeStart }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: clip.id,
    data: { clip },
  });

  const style = {
    left: `${clip.startTime * zoom}px`,
    width: `${clip.duration * zoom}px`,
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "absolute top-1 bottom-1 rounded cursor-pointer transition-all group",
        "flex items-center px-2 overflow-hidden",
        isDragging && "opacity-50 z-50",
        isSelected ? "ring-2 ring-[#00d4ff]" : "hover:brightness-110"
      )}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      {...attributes}
      {...listeners}
    >
      <div 
        className="absolute inset-0 opacity-90"
        style={{ backgroundColor: clip.color || '#6366f1' }}
      />
      
      {/* Left resize handle */}
      <div
        className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 rounded-l z-10"
        onPointerDown={(e) => {
          e.stopPropagation();
          onResizeStart?.('left');
        }}
      />
      
      <span className="relative text-[10px] text-white font-medium truncate z-10 px-1">
        {clip.name}
      </span>
      
      {/* Right resize handle */}
      <div
        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 rounded-r z-10"
        onPointerDown={(e) => {
          e.stopPropagation();
          onResizeStart?.('right');
        }}
      />
      
      {onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          onPointerDown={(e) => e.stopPropagation()}
          className={cn(
            "absolute -top-1 -right-1 w-4 h-4 bg-red-500 hover:bg-red-600 rounded-full transition-opacity flex items-center justify-center z-20",
            clip.source === 'original' || clip.source === 'ai-generated'
              ? "opacity-70 hover:opacity-100"
              : "opacity-0 group-hover:opacity-100"
          )}
        >
          <X className="h-2.5 w-2.5 text-white" />
        </button>
      )}
    </div>
  );
};

// Draggable Subtitle Clip Component with single-click editing and time inputs
const DraggableSubtitleClip: React.FC<{
  clip: SubtitleClip;
  zoom: number;
  isSelected: boolean;
  onSelect: () => void;
  onUpdate: (updates: Partial<SubtitleClip>) => void;
  onDelete?: () => void;
}> = ({ clip, zoom, isSelected, onSelect, onUpdate, onDelete }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(clip.text);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `subtitle-${clip.id}`,
    data: { clip, type: 'subtitle' },
  });

  const style = {
    left: `${clip.startTime * zoom}px`,
    width: `${Math.max((clip.endTime - clip.startTime) * zoom, 60)}px`,
    transform: transform ? `translate3d(${transform.x}px, 0, 0)` : undefined,
  };

  // Single-click activates edit mode after selection
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isSelected) {
      onSelect();
    } else if (!isEditing) {
      // Already selected, activate edit mode
      setIsEditing(true);
      setEditText(clip.text);
    }
  };

  const handleBlur = () => {
    onUpdate({ text: editText });
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    }
    if (e.key === 'Escape') {
      setEditText(clip.text);
      setIsEditing(false);
    }
  };

  // Auto-focus and select text when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Auto-activate edit when selected (after short delay)
  useEffect(() => {
    if (isSelected && !isEditing) {
      const timer = setTimeout(() => {
        setIsEditing(true);
        setEditText(clip.text);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [isSelected]);

  return (
    <div className="relative">
      <div
        ref={setNodeRef}
        style={style}
        className={cn(
          "absolute top-1 rounded cursor-grab active:cursor-grabbing group transition-all flex items-center",
          isDragging && "opacity-50 z-50",
          isSelected ? "ring-2 ring-[#00d4ff] h-[38px]" : "hover:brightness-110 h-[38px]"
        )}
        onClick={handleClick}
        {...(!isEditing ? attributes : {})}
        {...(!isEditing ? listeners : {})}
      >
        <div 
          className="absolute inset-0 opacity-90 rounded"
          style={{ backgroundColor: '#8b5cf6' }}
        />
        
        {isEditing ? (
          <input
            ref={inputRef}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className="relative z-10 w-full h-full bg-transparent text-[10px] text-white px-1.5 outline-none border-none"
            placeholder="Text eingeben..."
          />
        ) : (
          <span className="relative z-10 text-[10px] text-white/90 truncate px-1.5 font-medium">
            {clip.text || 'Klicken zum Bearbeiten...'}
          </span>
        )}
        
        {/* Resize Handles */}
        <div 
          className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-white/30 rounded-l" 
          onPointerDown={(e) => e.stopPropagation()}
        />
        <div 
          className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-white/30 rounded-r" 
          onPointerDown={(e) => e.stopPropagation()}
        />
        
        {onDelete && !isEditing && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 hover:bg-red-600 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-20"
          >
            <X className="h-2.5 w-2.5 text-white" />
          </button>
        )}
      </div>
      
      {/* Time inputs below clip when selected */}
      {isSelected && (
        <div 
          className="absolute flex gap-1 items-center"
          style={{ left: `${clip.startTime * zoom}px`, top: '44px' }}
        >
          <input
            type="number"
            step={0.1}
            min={0}
            value={clip.startTime.toFixed(1)}
            onChange={(e) => {
              const newStart = Math.max(0, parseFloat(e.target.value) || 0);
              if (newStart < clip.endTime) {
                onUpdate({ startTime: newStart });
              }
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className="w-12 h-5 px-1 bg-[#2a2a2a] border border-[#3a3a3a] rounded text-[9px] text-white/80 text-center"
            title="Startzeit (Sek)"
          />
          <span className="text-[9px] text-white/40">-</span>
          <input
            type="number"
            step={0.1}
            min={0}
            value={clip.endTime.toFixed(1)}
            onChange={(e) => {
              const newEnd = Math.max(clip.startTime + 0.5, parseFloat(e.target.value) || 0);
              onUpdate({ endTime: newEnd });
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className="w-12 h-5 px-1 bg-[#2a2a2a] border border-[#3a3a3a] rounded text-[9px] text-white/80 text-center"
            title="Endzeit (Sek)"
          />
        </div>
      )}
    </div>
  );
};

// Droppable Track Component
const DroppableTrack: React.FC<{
  track: AudioTrack;
  zoom: number;
  duration: number;
  selectedClipId: string | null;
  onClipSelect: (clipId: string | null) => void;
  onClipDelete?: (clipId: string) => void;
  onClipResizeStart?: (clipId: string, side: 'left' | 'right') => void;
}> = ({ track, zoom, duration, selectedClipId, onClipSelect, onClipDelete, onClipResizeStart }) => {
  const { setNodeRef, isOver } = useDroppable({
    id: track.id,
    data: { track },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "relative h-full",
        track.muted && "opacity-50",
        isOver && "bg-[#00d4ff]/10"
      )}
      style={{ width: `${duration * zoom}px` }}
      onClick={() => onClipSelect(null)}
    >
      {/* Grid lines */}
      {Array.from({ length: Math.ceil(duration) }).map((_, i) => (
        <div
          key={i}
          className="absolute top-0 bottom-0 w-px bg-[#2a2a2a]"
          style={{ left: `${i * zoom}px` }}
        />
      ))}

      {/* Clips */}
      {track.clips.map(clip => (
        <DraggableClip
          key={clip.id}
          clip={clip}
          zoom={zoom}
          isSelected={clip.id === selectedClipId}
          onSelect={() => onClipSelect(clip.id)}
          onDelete={onClipDelete ? () => onClipDelete(clip.id) : undefined}
          onResizeStart={onClipResizeStart ? (side) => onClipResizeStart(clip.id, side) : undefined}
        />
      ))}
    </div>
  );
};

export const CapCutTimeline: React.FC<CapCutTimelineProps> = ({
  tracks,
  scenes,
  currentTime,
  duration,
  zoom,
  selectedClipId,
  selectedSceneId,
  subtitleTrack,
  onSeek,
  onZoomChange,
  onClipSelect,
  onSceneSelect,
  onTrackMute,
  onTrackSolo,
  onClipDelete,
  onClipResize,
  onSceneDelete,
  onSceneAdd,
  onSceneAddFromMedia,
  onSubtitleUpdate,
  onSubtitleDelete,
  onSubtitleSelect,
  selectedSubtitleId,
}) => {
  const musicTrackIndex = tracks.findIndex(t => t.id === 'track-music');
  const tracksBeforeSubtitle = musicTrackIndex >= 0 ? tracks.slice(0, musicTrackIndex + 1) : tracks.slice(0, -1);
  const tracksAfterSubtitle = musicTrackIndex >= 0 ? tracks.slice(musicTrackIndex + 1) : tracks.slice(-1);
  const timelineRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  
  // Resize state
  const [resizingClip, setResizingClip] = useState<{ id: string; side: 'left' | 'right'; startX: number; originalClip: AudioClip } | null>(null);
  
  // Playhead drag state
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);

  const handleTimelineClick = useCallback((e: React.MouseEvent) => {
    if (!contentRef.current) return;
    const rect = contentRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = Math.max(0, Math.min(duration, x / zoom));
    onSeek(time);
  }, [duration, zoom, onSeek]);
  
  // Handle playhead drag
  useEffect(() => {
    if (!isDraggingPlayhead) return;
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!contentRef.current) return;
      const rect = contentRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const newTime = Math.max(0, Math.min(duration, x / zoom));
      onSeek(newTime);
    };
    
    const handleMouseUp = () => {
      setIsDraggingPlayhead(false);
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingPlayhead, duration, zoom, onSeek]);

  // Handle clip resize start
  const handleClipResizeStart = useCallback((clipId: string, side: 'left' | 'right') => {
    const clip = tracks.flatMap(t => t.clips).find(c => c.id === clipId);
    if (!clip) return;
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!contentRef.current) return;
      const rect = contentRef.current.getBoundingClientRect();
      const currentX = e.clientX - rect.left;
      const timeAtCursor = Math.max(0, currentX / zoom);
      
      if (side === 'left') {
        const newStartTime = Math.max(0, Math.min(timeAtCursor, clip.startTime + clip.duration - 0.5));
        const deltaTime = newStartTime - clip.startTime;
        const newDuration = clip.duration - deltaTime;
        if (newDuration >= 0.5) {
          onClipResize?.(clipId, side, newStartTime, newDuration);
        }
      } else {
        const newEndTime = Math.max(clip.startTime + 0.5, timeAtCursor);
        const newDuration = newEndTime - clip.startTime;
        if (newDuration >= 0.5) {
          onClipResize?.(clipId, side, clip.startTime, newDuration);
        }
      }
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      setResizingClip(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    setResizingClip({ id: clipId, side, startX: 0, originalClip: clip });
  }, [tracks, zoom, onClipResize]);

  const playheadPosition = currentTime * zoom;
  const timelineWidth = duration * zoom + 100; // Extra space at the end

  return (
    <div className="h-full flex flex-col bg-[#1a1a1a]">
      {/* Toolbar */}
      <div className="h-10 flex items-center justify-between px-3 border-b border-[#2a2a2a] bg-[#242424]">
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/60">Timeline</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-white/60 hover:text-white hover:bg-white/10"
            onClick={() => onZoomChange(Math.max(20, zoom - 10))}
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <div className="w-16 h-1.5 bg-[#2a2a2a] rounded-full overflow-hidden">
            <div 
              className="h-full bg-[#00d4ff]"
              style={{ width: `${((zoom - 20) / 80) * 100}%` }}
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-white/60 hover:text-white hover:bg-white/10"
            onClick={() => onZoomChange(Math.min(100, zoom + 10))}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Timeline Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Track Headers */}
        <div className="flex-shrink-0 overflow-y-auto" style={{ width: HEADER_WIDTH }}>
          {/* Ruler placeholder */}
          <div className="h-6 border-b border-[#2a2a2a] bg-[#242424]" />

          {/* Video track header */}
          <div 
            className="flex items-center gap-2 px-2 border-b border-[#2a2a2a] bg-[#242424]"
            style={{ height: TRACK_HEIGHT }}
          >
            <span className="text-xs">🎬</span>
            <span className="text-xs text-white/80 truncate">Video</span>
          </div>

          {/* Audio track headers - before subtitle */}
          {tracksBeforeSubtitle.map(track => (
            <div
              key={track.id}
              className="flex items-center gap-1 px-2 border-b border-[#2a2a2a] bg-[#242424]"
              style={{ height: TRACK_HEIGHT }}
            >
              <span className="text-xs">{track.icon}</span>
              <span className="text-xs text-white/80 truncate flex-1">{track.name}</span>
              <button
                className={cn(
                  "w-5 h-5 flex items-center justify-center rounded hover:bg-white/10",
                  track.muted && "text-red-400"
                )}
                onClick={() => onTrackMute(track.id)}
              >
                {track.muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3 text-white/40" />}
              </button>
              <button
                className={cn(
                  "w-5 h-5 flex items-center justify-center rounded hover:bg-white/10",
                  track.solo && "text-yellow-400"
                )}
                onClick={() => onTrackSolo(track.id)}
              >
                <Headphones className="h-3 w-3 text-white/40" />
              </button>
            </div>
          ))}
          
          {/* Subtitle track header */}
          {subtitleTrack && (
            <div
              className="flex items-center gap-1 px-2 border-b border-[#2a2a2a] bg-[#242424]"
              style={{ height: TRACK_HEIGHT }}
            >
              <span className="text-xs">{subtitleTrack.icon}</span>
              <span className="text-xs text-white/80 truncate flex-1">{subtitleTrack.name}</span>
              <MessageSquare className="h-3 w-3 text-purple-400" />
            </div>
          )}
          
          {/* Audio track headers - after subtitle (SFX) */}
          {tracksAfterSubtitle.map(track => (
            <div
              key={track.id}
              className="flex items-center gap-1 px-2 border-b border-[#2a2a2a] bg-[#242424]"
              style={{ height: TRACK_HEIGHT }}
            >
              <span className="text-xs">{track.icon}</span>
              <span className="text-xs text-white/80 truncate flex-1">{track.name}</span>
              <button
                className={cn(
                  "w-5 h-5 flex items-center justify-center rounded hover:bg-white/10",
                  track.muted && "text-red-400"
                )}
                onClick={() => onTrackMute(track.id)}
              >
                {track.muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3 text-white/40" />}
              </button>
              <button
                className={cn(
                  "w-5 h-5 flex items-center justify-center rounded hover:bg-white/10",
                  track.solo && "text-yellow-400"
                )}
                onClick={() => onTrackSolo(track.id)}
              >
                <Headphones className="h-3 w-3 text-white/40" />
              </button>
            </div>
          ))}
        </div>

        {/* Timeline Area with horizontal and vertical scroll */}
        <ScrollArea className="flex-1">
          <div 
            ref={contentRef}
            className="relative"
            style={{ width: `${timelineWidth}px`, minWidth: '100%' }}
            onClick={handleTimelineClick}
          >
            {/* Time Ruler */}
            <div className="h-6 border-b border-[#2a2a2a] bg-[#1e1e1e] sticky top-0 z-20">
              {Array.from({ length: Math.ceil(duration) + 1 }).map((_, i) => (
                <div
                  key={i}
                  className="absolute top-0 h-full flex flex-col items-center"
                  style={{ left: `${i * zoom}px` }}
                >
                  <div className="w-px h-2 bg-[#4a4a4a]" />
                  {i % 5 === 0 && (
                    <span className="text-[9px] text-white/40 mt-0.5">{formatTime(i)}</span>
                  )}
                </div>
              ))}
            </div>

            {/* Video Track */}
            <div
              className="relative border-b border-[#2a2a2a]"
              style={{ height: TRACK_HEIGHT }}
              onClick={() => onSceneSelect?.(null)}
            >
              {scenes.map((scene, i) => (
                <DraggableScene
                  key={scene.id}
                  scene={scene}
                  index={i}
                  zoom={zoom}
                  isSelected={scene.id === selectedSceneId}
                  onSeek={onSeek}
                  onSelect={() => onSceneSelect?.(scene.id)}
                  onDelete={onSceneDelete ? () => onSceneDelete(scene.id) : undefined}
                />
              ))}
              {/* Add Scene Button with Dropdown */}
              {(onSceneAdd || onSceneAddFromMedia) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="absolute top-1 bottom-1 w-10 flex items-center justify-center gap-0.5 bg-white/5 hover:bg-white/10 border border-dashed border-white/20 hover:border-white/40 rounded transition-colors"
                      style={{ left: `${(scenes[scenes.length - 1]?.end_time || 0) * zoom + 4}px` }}
                      title="Neue Szene hinzufügen"
                    >
                      <PlusCircle className="h-3.5 w-3.5 text-white/40" />
                      <ChevronDown className="h-2.5 w-2.5 text-white/40" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="bg-[#242424] border-[#3a3a3a]">
                    {onSceneAdd && (
                      <DropdownMenuItem 
                        onClick={onSceneAdd}
                        className="text-white/80 hover:bg-white/10 focus:bg-white/10 cursor-pointer"
                      >
                        <Square className="h-4 w-4 mr-2 text-zinc-400" />
                        Leere Szene (Blackscreen)
                      </DropdownMenuItem>
                    )}
                    {onSceneAddFromMedia && (
                      <DropdownMenuItem 
                        onClick={onSceneAddFromMedia}
                        className="text-white/80 hover:bg-white/10 focus:bg-white/10 cursor-pointer"
                      >
                        <Film className="h-4 w-4 mr-2 text-indigo-400" />
                        Video aus Mediathek
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            {/* Audio Tracks - before subtitle */}
            {tracksBeforeSubtitle.map(track => (
              <div
                key={track.id}
                className="relative border-b border-[#2a2a2a]"
                style={{ height: TRACK_HEIGHT }}
              >
                <DroppableTrack
                  track={track}
                  zoom={zoom}
                  duration={duration}
                  selectedClipId={selectedClipId}
                  onClipSelect={onClipSelect}
                  onClipDelete={onClipDelete}
                  onClipResizeStart={handleClipResizeStart}
                />
              </div>
            ))}
            
            {/* Subtitle Track */}
            {subtitleTrack && (
              <div
                className="relative border-b border-[#2a2a2a]"
                style={{ height: TRACK_HEIGHT, width: `${duration * zoom}px` }}
                onClick={() => onSubtitleSelect?.(null)}
              >
                {/* Grid lines */}
                {Array.from({ length: Math.ceil(duration) }).map((_, i) => (
                  <div
                    key={i}
                    className="absolute top-0 bottom-0 w-px bg-[#2a2a2a]"
                    style={{ left: `${i * zoom}px` }}
                  />
                ))}
                
                {/* Subtitle Clips */}
                {subtitleTrack.clips.map(clip => (
                  <DraggableSubtitleClip
                    key={clip.id}
                    clip={clip}
                    zoom={zoom}
                    isSelected={clip.id === selectedSubtitleId}
                    onSelect={() => onSubtitleSelect?.(clip.id)}
                    onUpdate={(updates) => onSubtitleUpdate?.(clip.id, updates)}
                    onDelete={onSubtitleDelete ? () => onSubtitleDelete(clip.id) : undefined}
                  />
                ))}
              </div>
            )}
            
            {/* Audio Tracks - after subtitle (SFX) */}
            {tracksAfterSubtitle.map(track => (
              <div
                key={track.id}
                className="relative border-b border-[#2a2a2a]"
                style={{ height: TRACK_HEIGHT }}
              >
                <DroppableTrack
                  track={track}
                  zoom={zoom}
                  duration={duration}
                  selectedClipId={selectedClipId}
                  onClipSelect={onClipSelect}
                  onClipDelete={onClipDelete}
                  onClipResizeStart={handleClipResizeStart}
                />
              </div>
            ))}

            {/* Playhead - Draggable */}
            <div
              className="absolute top-0 bottom-0 z-30 cursor-ew-resize group"
              style={{ left: `${playheadPosition}px` }}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDraggingPlayhead(true);
              }}
            >
              {/* Wide invisible hit area for easier grabbing */}
              <div className="absolute top-0 bottom-0 -left-3 w-7 cursor-ew-resize" />
              
              {/* Visible playhead line */}
              <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-[#00d4ff] -translate-x-1/2 group-hover:w-1 transition-all" />
              
              {/* Larger draggable triangle/handle */}
              <div 
                className="absolute -top-0 left-1/2 -translate-x-1/2 w-4 h-4 bg-[#00d4ff] group-hover:scale-110 transition-transform" 
                style={{ clipPath: 'polygon(50% 100%, 0 0, 100% 0)' }} 
              />
            </div>
          </div>
          <ScrollBar orientation="horizontal" />
          <ScrollBar orientation="vertical" />
        </ScrollArea>
      </div>
    </div>
  );
};
