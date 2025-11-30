import { useRef, useState, useCallback } from 'react';
import { DndContext, DragOverlay, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { motion } from 'framer-motion';
import { AudioTrack, VideoTrackScene, AudioClip } from '@/types/timeline';
import { TimelineRuler } from './TimelineRuler';
import { VideoTrack } from './VideoTrack';
import { AudioTrackRow } from './AudioTrackRow';
import { AudioClipComponent } from './AudioClipComponent';
import { cn } from '@/lib/utils';

interface MultiTrackTimelineProps {
  videoScenes: VideoTrackScene[];
  audioTracks: AudioTrack[];
  currentTime: number;
  duration: number;
  zoom: number;
  selectedClipId: string | null;
  onClipSelect: (clipId: string | null) => void;
  onClipMove: (clipId: string, newTrackId: string, newStartTime: number) => void;
  onClipResize: (clipId: string, newDuration: number, edge: 'start' | 'end') => void;
  onClipDelete: (clipId: string) => void;
  onTrackUpdate: (trackId: string, updates: Partial<AudioTrack>) => void;
  onSeek: (time: number) => void;
}

export function MultiTrackTimeline({
  videoScenes,
  audioTracks,
  currentTime,
  duration,
  zoom,
  selectedClipId,
  onClipSelect,
  onClipMove,
  onClipResize,
  onClipDelete,
  onTrackUpdate,
  onSeek,
}: MultiTrackTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [draggedClip, setDraggedClip] = useState<AudioClip | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );
  
  const timelineWidth = duration * zoom;
  const playheadPosition = currentTime * zoom;
  
  // Handle timeline click to seek
  const handleTimelineClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const scrollLeft = containerRef.current?.scrollLeft || 0;
    const x = e.clientX - rect.left + scrollLeft;
    const time = Math.max(0, Math.min(duration, x / zoom));
    onSeek(time);
  }, [duration, zoom, isDragging, onSeek]);
  
  // Drag handlers
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    const clipId = active.id as string;
    
    // Find the clip
    for (const track of audioTracks) {
      const clip = track.clips.find(c => c.id === clipId);
      if (clip) {
        setDraggedClip(clip);
        setIsDragging(true);
        break;
      }
    }
  }, [audioTracks]);
  
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over, delta } = event;
    setIsDragging(false);
    setDraggedClip(null);
    
    if (!over || !draggedClip) return;
    
    const clipId = active.id as string;
    const targetTrackId = over.id as string;
    
    // Calculate new start time based on drag delta
    const deltaTime = delta.x / zoom;
    const newStartTime = Math.max(0, draggedClip.startTime + deltaTime);
    
    onClipMove(clipId, targetTrackId, newStartTime);
  }, [draggedClip, zoom, onClipMove]);
  
  // Auto-scroll when playhead approaches edges
  // useEffect(() => {
  //   const container = containerRef.current;
  //   if (!container) return;
  //   
  //   const viewportWidth = container.clientWidth;
  //   const scrollLeft = container.scrollLeft;
  //   const buffer = 100;
  //   
  //   if (playheadPosition > scrollLeft + viewportWidth - buffer) {
  //     container.scrollLeft = playheadPosition - viewportWidth + buffer;
  //   } else if (playheadPosition < scrollLeft + buffer) {
  //     container.scrollLeft = Math.max(0, playheadPosition - buffer);
  //   }
  // }, [playheadPosition]);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Track Labels (fixed left column) */}
      <div className="flex h-full">
        {/* Track Labels Column */}
        <div className="w-48 flex-shrink-0 border-r bg-card/50">
          {/* Ruler placeholder */}
          <div className="h-8 border-b bg-muted/30" />
          
          {/* Video Track Label */}
          <div className="h-16 border-b flex items-center px-3 gap-2 bg-card/30">
            <span className="text-lg">🎬</span>
            <div>
              <div className="text-sm font-medium">Video</div>
              <div className="text-xs text-muted-foreground">{videoScenes.length} Szenen</div>
            </div>
          </div>
          
          {/* Audio Track Labels */}
          {audioTracks.map(track => (
            <div 
              key={track.id}
              className="h-14 border-b flex items-center px-3 gap-2 hover:bg-accent/50 transition-colors"
              style={{ borderLeftColor: track.color, borderLeftWidth: 3 }}
            >
              <span className="text-lg">{track.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{track.name}</div>
                <div className="text-xs text-muted-foreground">{track.clips.length} Clips</div>
              </div>
              
              {/* Track Controls */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onTrackUpdate(track.id, { muted: !track.muted })}
                  className={cn(
                    "w-6 h-6 rounded text-xs font-bold transition-colors",
                    track.muted ? "bg-red-500/80 text-white" : "bg-muted hover:bg-muted/80"
                  )}
                >
                  M
                </button>
                <button
                  onClick={() => onTrackUpdate(track.id, { solo: !track.solo })}
                  className={cn(
                    "w-6 h-6 rounded text-xs font-bold transition-colors",
                    track.solo ? "bg-yellow-500/80 text-black" : "bg-muted hover:bg-muted/80"
                  )}
                >
                  S
                </button>
              </div>
            </div>
          ))}
        </div>
        
        {/* Timeline Content (scrollable) */}
        <div 
          ref={containerRef}
          className="flex-1 overflow-x-auto overflow-y-hidden relative"
        >
          <div 
            ref={timelineRef}
            className="relative"
            style={{ width: `${timelineWidth}px`, minWidth: '100%' }}
          >
            {/* Ruler */}
            <TimelineRuler duration={duration} zoom={zoom} />
            
            {/* Video Track */}
            <div 
              className="h-16 border-b relative cursor-pointer"
              onClick={handleTimelineClick}
            >
              <VideoTrack 
                scenes={videoScenes} 
                zoom={zoom} 
                duration={duration}
              />
            </div>
            
            {/* Audio Tracks with DnD */}
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              {audioTracks.map(track => (
                <AudioTrackRow
                  key={track.id}
                  track={track}
                  zoom={zoom}
                  duration={duration}
                  selectedClipId={selectedClipId}
                  onClipSelect={onClipSelect}
                  onClipResize={onClipResize}
                  onClipDelete={onClipDelete}
                  onClick={handleTimelineClick}
                />
              ))}
              
              {/* Drag Overlay */}
              <DragOverlay>
                {draggedClip && (
                  <div 
                    className="h-12 rounded-md opacity-80 shadow-lg"
                    style={{ 
                      width: `${draggedClip.duration * zoom}px`,
                      backgroundColor: audioTracks.find(t => t.id === draggedClip.trackId)?.color || '#666',
                    }}
                  >
                    <div className="px-2 py-1 text-xs text-white truncate">
                      {draggedClip.name}
                    </div>
                  </div>
                )}
              </DragOverlay>
            </DndContext>
            
            {/* Playhead */}
            <motion.div
              className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-50 pointer-events-none"
              style={{ left: playheadPosition }}
              initial={false}
              animate={{ left: playheadPosition }}
              transition={{ type: 'spring', stiffness: 500, damping: 50 }}
            >
              {/* Playhead Handle */}
              <div className="absolute -top-0 left-1/2 -translate-x-1/2 w-3 h-3 bg-red-500 rounded-full" />
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
