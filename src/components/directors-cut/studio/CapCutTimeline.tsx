import React, { useRef, useCallback, useState } from 'react';
import { AudioTrack, AudioClip } from '@/types/timeline';
import { SceneAnalysis } from '@/types/directors-cut';
import { Volume2, VolumeX, Headphones, Lock, Plus, Minus, ZoomIn, X, PlusCircle, Film, Square, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  onSeek: (time: number) => void;
  onZoomChange: (zoom: number) => void;
  onClipSelect: (clipId: string | null) => void;
  onTrackMute: (trackId: string) => void;
  onTrackSolo: (trackId: string) => void;
  onClipDelete?: (clipId: string) => void;
  onSceneDelete?: (sceneId: string) => void;
  onSceneAdd?: () => void;
  onSceneAddFromMedia?: () => void;
}

const TRACK_HEIGHT = 48;
const HEADER_WIDTH = 120;

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// Draggable Clip Component
const DraggableClip: React.FC<{
  clip: AudioClip;
  zoom: number;
  isSelected: boolean;
  onSelect: () => void;
  onDelete?: () => void;
}> = ({ clip, zoom, isSelected, onSelect, onDelete }) => {
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
      <span className="relative text-[10px] text-white font-medium truncate z-10">
        {clip.name}
      </span>
      {/* Delete Button */}
      {onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 hover:bg-red-600 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-20"
        >
          <X className="h-2.5 w-2.5 text-white" />
        </button>
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
}> = ({ track, zoom, duration, selectedClipId, onClipSelect, onClipDelete }) => {
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
  onSeek,
  onZoomChange,
  onClipSelect,
  onTrackMute,
  onTrackSolo,
  onClipDelete,
  onSceneDelete,
  onSceneAdd,
  onSceneAddFromMedia,
}) => {
  const timelineRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const handleTimelineClick = useCallback((e: React.MouseEvent) => {
    if (!contentRef.current) return;
    const rect = contentRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = Math.max(0, Math.min(duration, x / zoom));
    onSeek(time);
  }, [duration, zoom, onSeek]);

  const playheadPosition = currentTime * zoom;

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
        <div className="flex-shrink-0" style={{ width: HEADER_WIDTH }}>
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

          {/* Audio track headers */}
          {tracks.map(track => (
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

        {/* Timeline Area */}
        <div 
          ref={timelineRef}
          className="flex-1 overflow-auto relative"
        >
          <div 
            ref={contentRef}
            className="relative"
            style={{ width: `${duration * zoom}px`, minWidth: '100%' }}
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
            >
              {scenes.map((scene, i) => (
                <div
                  key={scene.id}
                  className={cn(
                    "absolute top-1 bottom-1 rounded flex items-center justify-center cursor-pointer hover:brightness-110 group",
                    scene.isBlackscreen 
                      ? "bg-zinc-800/80 border border-dashed border-zinc-600" 
                      : "bg-indigo-600/80"
                  )}
                  style={{
                    left: `${scene.start_time * zoom}px`,
                    width: `${(scene.end_time - scene.start_time) * zoom}px`,
                  }}
                  onClick={() => onSeek(scene.start_time)}
                >
                  <span className="text-[10px] text-white/90 font-medium">
                    {scene.isBlackscreen ? '⬛' : i + 1}
                  </span>
                  {/* Delete Scene Button */}
                  {onSceneDelete && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onSceneDelete(scene.id); }}
                      className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 hover:bg-red-600 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-20"
                    >
                      <X className="h-2.5 w-2.5 text-white" />
                    </button>
                  )}
                </div>
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

            {/* Audio Tracks */}
            {tracks.map(track => (
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
                />
              </div>
            ))}

            {/* Playhead */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-[#00d4ff] z-30 pointer-events-none"
              style={{ left: `${playheadPosition}px` }}
            >
              <div className="absolute -top-0 left-1/2 -translate-x-1/2 w-3 h-3 bg-[#00d4ff]" 
                style={{ clipPath: 'polygon(50% 100%, 0 0, 100% 0)' }} 
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
