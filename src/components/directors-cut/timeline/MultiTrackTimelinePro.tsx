import { useState, useRef, useCallback } from 'react';
import { DndContext, DragEndEvent, DragStartEvent, DragOverlay, useSensor, useSensors, PointerSensor } from '@dnd-kit/core';
import { motion } from 'framer-motion';
import { Plus, Volume2, VolumeX, Lock, Unlock, Headphones } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SceneAnalysis } from '@/types/directors-cut';
import { AudioTrack, AudioClip } from '@/types/timeline';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { TimelineRuler } from './TimelineRuler';
import { EditableVideoTrack } from './EditableVideoTrack';
import { AudioTrackRow } from './AudioTrackRow';
import { AudioClipComponent } from './AudioClipComponent';

interface MultiTrackTimelineProProps {
  scenes: SceneAnalysis[];
  audioTracks: AudioTrack[];
  currentTime: number;
  videoDuration: number;
  zoom: number;
  selectedClipId: string | null;
  onTimeChange: (time: number) => void;
  onClipSelect: (id: string | null) => void;
  onSceneSplit: () => void;
  onSceneMerge: (sceneIds: string[]) => void;
  onSceneReorder: (fromIndex: number, toIndex: number) => void;
  onAudioTracksChange: (tracks: AudioTrack[]) => void;
  onAddTrack: () => void;
}

export function MultiTrackTimelinePro({
  scenes,
  audioTracks,
  currentTime,
  videoDuration,
  zoom,
  selectedClipId,
  onTimeChange,
  onClipSelect,
  onSceneSplit,
  onSceneMerge,
  onSceneReorder,
  onAudioTracksChange,
  onAddTrack,
}: MultiTrackTimelineProProps) {
  const [draggedClip, setDraggedClip] = useState<AudioClip | null>(null);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  const handleTimelineClick = useCallback((e: React.MouseEvent) => {
    if (!contentRef.current) return;
    const rect = contentRef.current.getBoundingClientRect();
    const scrollLeft = contentRef.current.scrollLeft;
    const x = e.clientX - rect.left + scrollLeft;
    const time = Math.max(0, Math.min(videoDuration, x / zoom));
    onTimeChange(time);
  }, [zoom, videoDuration, onTimeChange]);

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const clipId = active.id as string;
    
    for (const track of audioTracks) {
      const clip = track.clips.find(c => c.id === clipId);
      if (clip) {
        setDraggedClip(clip);
        break;
      }
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over, delta } = event;
    setDraggedClip(null);
    
    if (!over) return;

    const clipId = active.id as string;
    const targetTrackId = over.id as string;
    const deltaTime = delta.x / zoom;

    const newTracks = audioTracks.map(track => {
      const clipIndex = track.clips.findIndex(c => c.id === clipId);
      
      if (clipIndex !== -1) {
        const clip = track.clips[clipIndex];
        const updatedClip = {
          ...clip,
          startTime: Math.max(0, clip.startTime + deltaTime),
          trackId: targetTrackId.startsWith('track-') ? targetTrackId : track.id,
        };

        if (targetTrackId !== track.id && targetTrackId.startsWith('track-')) {
          return {
            ...track,
            clips: track.clips.filter(c => c.id !== clipId),
          };
        }

        return {
          ...track,
          clips: track.clips.map(c => c.id === clipId ? updatedClip : c),
        };
      }

      if (targetTrackId === track.id && draggedClip) {
        const existingClip = track.clips.find(c => c.id === clipId);
        if (!existingClip) {
          return {
            ...track,
            clips: [...track.clips, { ...draggedClip, trackId: track.id }],
          };
        }
      }

      return track;
    });

    onAudioTracksChange(newTracks);
  };

  const handleTrackMute = (trackId: string) => {
    onAudioTracksChange(
      audioTracks.map(t => t.id === trackId ? { ...t, muted: !t.muted } : t)
    );
  };

  const handleTrackSolo = (trackId: string) => {
    onAudioTracksChange(
      audioTracks.map(t => t.id === trackId ? { ...t, solo: !t.solo } : t)
    );
  };

  const handleTrackLock = (trackId: string) => {
    onAudioTracksChange(
      audioTracks.map(t => t.id === trackId ? { ...t, locked: !t.locked } : t)
    );
  };

  const handleTrackVolume = (trackId: string, volume: number) => {
    onAudioTracksChange(
      audioTracks.map(t => t.id === trackId ? { ...t, volume } : t)
    );
  };

  const handleClipResize = (clipId: string, newDuration: number, edge: 'start' | 'end') => {
    onAudioTracksChange(
      audioTracks.map(track => ({
        ...track,
        clips: track.clips.map(clip => {
          if (clip.id === clipId) {
            if (edge === 'start') {
              const diff = clip.duration - newDuration;
              return { ...clip, startTime: clip.startTime + diff, duration: newDuration };
            }
            return { ...clip, duration: newDuration };
          }
          return clip;
        }),
      }))
    );
  };

  const handleClipDelete = (clipId: string) => {
    onAudioTracksChange(
      audioTracks.map(track => ({
        ...track,
        clips: track.clips.filter(c => c.id !== clipId),
      }))
    );
    if (selectedClipId === clipId) onClipSelect(null);
  };

  const handleSceneResize = (sceneId: string, newStart: number, newEnd: number) => {
    // This would update scenes - handled by parent
    console.log('Scene resize:', sceneId, newStart, newEnd);
  };

  const timelineWidth = Math.max(videoDuration * zoom, 800);

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div ref={timelineRef} className="h-full flex flex-col bg-card/50">
        {/* Timeline Header with Ruler */}
        <div className="flex border-b bg-muted/30">
          {/* Track Labels Header */}
          <div className="w-48 flex-shrink-0 border-r bg-card/50 px-2 py-1">
            <span className="text-xs font-medium text-muted-foreground">Tracks</span>
          </div>
          
          {/* Ruler */}
          <div className="flex-1 overflow-hidden">
            <div 
              ref={contentRef}
              className="overflow-x-auto"
              onClick={handleTimelineClick}
            >
              <TimelineRuler duration={videoDuration} zoom={zoom} />
            </div>
          </div>
        </div>

        {/* Tracks Container */}
        <div className="flex-1 flex overflow-hidden">
          {/* Track Labels */}
          <div className="w-48 flex-shrink-0 border-r bg-card/30 overflow-y-auto">
            {/* Video Track Label */}
            <div className="h-16 border-b flex items-center px-2 gap-2 bg-indigo-500/10">
              <span className="text-lg">🎬</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">Video</div>
                <div className="text-[10px] text-muted-foreground">{scenes.length} Szenen</div>
              </div>
            </div>

            {/* Audio Track Labels */}
            {audioTracks.map(track => (
              <div 
                key={track.id}
                className={cn(
                  "h-14 border-b flex items-center px-2 gap-2",
                  track.muted && "opacity-50"
                )}
                style={{ backgroundColor: `${track.color}10` }}
              >
                <span className="text-base">{track.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{track.name}</div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0"
                      onClick={() => handleTrackMute(track.id)}
                    >
                      {track.muted ? (
                        <VolumeX className="h-3 w-3 text-destructive" />
                      ) : (
                        <Volume2 className="h-3 w-3" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn("h-5 w-5 p-0", track.solo && "text-yellow-500")}
                      onClick={() => handleTrackSolo(track.id)}
                    >
                      <Headphones className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn("h-5 w-5 p-0", track.locked && "text-orange-500")}
                      onClick={() => handleTrackLock(track.id)}
                    >
                      {track.locked ? (
                        <Lock className="h-3 w-3" />
                      ) : (
                        <Unlock className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                </div>
                <Slider
                  value={[track.volume]}
                  onValueChange={([v]) => handleTrackVolume(track.id, v)}
                  max={100}
                  step={1}
                  orientation="vertical"
                  className="h-10"
                />
              </div>
            ))}

            {/* Add Track Button */}
            <div className="h-10 border-b flex items-center justify-center">
              <Button variant="ghost" size="sm" onClick={onAddTrack} className="gap-1 text-xs">
                <Plus className="h-3 w-3" />
                Track hinzufügen
              </Button>
            </div>
          </div>

          {/* Timeline Content */}
          <div className="flex-1 overflow-auto relative">
            <div style={{ width: timelineWidth, minHeight: '100%' }}>
              {/* Video Track */}
              <div className="h-16 border-b relative">
                <EditableVideoTrack
                  scenes={scenes}
                  zoom={zoom}
                  currentTime={currentTime}
                  duration={videoDuration}
                  onSceneSplit={(time) => onSceneSplit()}
                  onSceneMerge={onSceneMerge}
                  onSceneReorder={onSceneReorder}
                  onSceneSelect={setSelectedSceneId}
                  onSceneResize={handleSceneResize}
                  selectedSceneId={selectedSceneId}
                />
              </div>

              {/* Audio Tracks */}
              {audioTracks.map(track => (
                <AudioTrackRow
                  key={track.id}
                  track={track}
                  zoom={zoom}
                  duration={videoDuration}
                  selectedClipId={selectedClipId}
                  onClipSelect={onClipSelect}
                  onClipResize={handleClipResize}
                  onClipDelete={handleClipDelete}
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const time = Math.max(0, Math.min(videoDuration, x / zoom));
                    onTimeChange(time);
                  }}
                />
              ))}
            </div>

            {/* Playhead */}
            <motion.div
              className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-50 pointer-events-none"
              style={{ left: currentTime * zoom }}
              initial={false}
              animate={{ left: currentTime * zoom }}
              transition={{ type: 'tween', duration: 0.05 }}
            >
              <div className="absolute -top-0 left-1/2 -translate-x-1/2 w-3 h-3 bg-red-500 rounded-full" />
            </motion.div>
          </div>
        </div>
      </div>

      {/* Drag Overlay */}
      <DragOverlay>
        {draggedClip && (
          <div 
            className="h-10 rounded opacity-80 flex items-center px-2"
            style={{ 
              width: draggedClip.duration * zoom,
              backgroundColor: draggedClip.color || '#6366f1',
            }}
          >
            <span className="text-xs text-white font-medium truncate">
              {draggedClip.name}
            </span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
