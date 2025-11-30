import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { SceneAnalysis, AudioEnhancements } from '@/types/directors-cut';
import { CapCutSidebar } from './CapCutSidebar';
import { CapCutTimeline } from './CapCutTimeline';
import { CapCutPreviewPlayer } from './CapCutPreviewPlayer';
import { CapCutPropertiesPanel } from './CapCutPropertiesPanel';
import { AudioTrack, AudioClip } from '@/types/timeline';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { Undo2, Redo2, Save, Settings, Music, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DndContext, DragEndEvent, DragStartEvent, DragOverlay } from '@dnd-kit/core';

interface CapCutEditorProps {
  videoUrl: string;
  videoDuration: number;
  scenes: SceneAnalysis[];
  audioEnhancements: AudioEnhancements;
  onAudioChange: (enhancements: AudioEnhancements) => void;
  onScenesUpdate?: (scenes: SceneAnalysis[]) => void;
}

const DEFAULT_TRACKS: AudioTrack[] = [
  { id: 'track-original', type: 'original', name: 'Original', clips: [], volume: 100, muted: false, locked: false, solo: false, color: '#6366f1', icon: '🎬' },
  { id: 'track-voiceover', type: 'voiceover', name: 'Voiceover', clips: [], volume: 100, muted: false, locked: false, solo: false, color: '#f59e0b', icon: '🎤' },
  { id: 'track-music', type: 'background-music', name: 'Music', clips: [], volume: 70, muted: false, locked: false, solo: false, color: '#10b981', icon: '🎵' },
  { id: 'track-sfx', type: 'sound-effect', name: 'SFX', clips: [], volume: 100, muted: false, locked: false, solo: false, color: '#ec4899', icon: '🔊' },
];

export const CapCutEditor: React.FC<CapCutEditorProps> = ({
  videoUrl,
  videoDuration,
  scenes,
  audioEnhancements,
  onAudioChange,
  onScenesUpdate,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(100);
  const [isMuted, setIsMuted] = useState(false);
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>(DEFAULT_TRACKS);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(50);
  const [activeDragItem, setActiveDragItem] = useState<{ name: string; type: string; color: string } | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);

  // Sync video with state
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = isMuted ? 0 : volume / 100;
    }
  }, [volume, isMuted]);

  const handlePlayPause = useCallback(async () => {
    if (!videoRef.current) return;
    try {
      if (isPlaying) {
        videoRef.current.pause();
        setIsPlaying(false);
      } else {
        await videoRef.current.play();
        setIsPlaying(true);
      }
    } catch (error) {
      console.error('Video play error:', error);
    }
  }, [isPlaying]);

  const handleSeek = useCallback((time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  }, []);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onPlayPause: handlePlayPause,
    onUndo: () => console.log('Undo'),
    onRedo: () => console.log('Redo'),
  }, true);

  const handleAddClip = useCallback((trackId: string, clip: Omit<AudioClip, 'id'>) => {
    const newClip: AudioClip = {
      ...clip,
      id: `clip-${Date.now()}`,
    };
    setAudioTracks(prev => prev.map(track => 
      track.id === trackId 
        ? { ...track, clips: [...track.clips, newClip] }
        : track
    ));
  }, []);

  const handleTrackMute = useCallback((trackId: string) => {
    setAudioTracks(prev => prev.map(track =>
      track.id === trackId ? { ...track, muted: !track.muted } : track
    ));
  }, []);

  const handleTrackSolo = useCallback((trackId: string) => {
    setAudioTracks(prev => prev.map(track =>
      track.id === trackId ? { ...track, solo: !track.solo } : track
    ));
  }, []);

  // Drag & Drop Handlers for shared DndContext
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current;
    if (data?.source === 'sidebar') {
      setActiveDragItem({
        name: data.clip?.name || 'Unknown',
        type: data.type || 'audio',
        color: data.clip?.color || '#6366f1',
      });
    } else if (data?.clip) {
      setActiveDragItem({
        name: data.clip.name,
        type: 'clip',
        color: data.clip.color || '#6366f1',
      });
    }
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragItem(null);

    if (!over) return;

    const activeData = active.data.current;
    const targetTrackId = over.id as string;

    // Handle sidebar drops
    if (activeData?.source === 'sidebar' && activeData?.clip) {
      const clip = activeData.clip;
      handleAddClip(targetTrackId, {
        trackId: targetTrackId,
        name: clip.name,
        url: clip.url || '',
        startTime: 0,
        duration: clip.duration,
        trimStart: 0,
        trimEnd: clip.duration,
        volume: clip.volume || 100,
        fadeIn: clip.fadeIn || 0,
        fadeOut: clip.fadeOut || 0,
        source: clip.source || 'library',
        color: clip.color,
      });
      return;
    }

    // Handle internal timeline drag
    if (activeData?.clip) {
      const clipId = active.id as string;
      const dragData = activeData as { clip: AudioClip };
      const sourceTrack = audioTracks.find(t => t.clips.some(c => c.id === clipId));
      if (!sourceTrack) return;

      const newStartTime = Math.max(0, dragData.clip.startTime + (event.delta.x / zoom));

      if (sourceTrack.id === targetTrackId) {
        // Same track - just update position
        setAudioTracks(prev => prev.map(track => {
          if (track.id === sourceTrack.id) {
            return {
              ...track,
              clips: track.clips.map(c =>
                c.id === clipId ? { ...c, startTime: newStartTime } : c
              ),
            };
          }
          return track;
        }));
      } else {
        // Move to different track
        setAudioTracks(prev => prev.map(track => {
          if (track.id === sourceTrack.id) {
            return { ...track, clips: track.clips.filter(c => c.id !== clipId) };
          }
          if (track.id === targetTrackId) {
            const updatedClip = { ...dragData.clip, startTime: newStartTime, trackId: targetTrackId };
            return { ...track, clips: [...track.clips, updatedClip] };
          }
          return track;
        }));
      }
    }
  }, [audioTracks, zoom, handleAddClip]);

  const selectedClip = audioTracks
    .flatMap(t => t.clips)
    .find(c => c.id === selectedClipId);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#1a1a1a]">
      {/* Header Bar */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-[#2a2a2a] bg-[#242424]">
        <div className="flex items-center gap-2">
          <span className="text-white font-semibold text-sm">Audio Studio</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-white/60 hover:text-white hover:bg-white/10">
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-white/60 hover:text-white hover:bg-white/10">
            <Redo2 className="h-4 w-4" />
          </Button>
          <div className="w-px h-6 bg-[#3a3a3a] mx-2" />
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-white/60 hover:text-white hover:bg-white/10">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Main Content with shared DndContext */}
      <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex-1 flex overflow-hidden">
          {/* Left Sidebar - AI Tools */}
          <CapCutSidebar 
            onAddClip={handleAddClip}
            audioEnhancements={audioEnhancements}
            onAudioChange={onAudioChange}
          />

          {/* Center Area */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Preview Player */}
            <div className="h-[38%] min-h-[200px] p-3 bg-[#1a1a1a]">
              <CapCutPreviewPlayer
                videoRef={videoRef}
                videoUrl={videoUrl}
                isPlaying={isPlaying}
                currentTime={currentTime}
                duration={videoDuration}
                volume={volume}
                isMuted={isMuted}
                scenes={scenes}
                onPlayPause={handlePlayPause}
                onSeek={handleSeek}
                onTimeUpdate={handleTimeUpdate}
                onVolumeChange={setVolume}
                onMuteToggle={() => setIsMuted(!isMuted)}
              />
            </div>

            {/* Timeline */}
            <div className="flex-1 border-t border-[#2a2a2a] overflow-hidden">
              <CapCutTimeline
                tracks={audioTracks}
                scenes={scenes}
                currentTime={currentTime}
                duration={videoDuration}
                zoom={zoom}
                selectedClipId={selectedClipId}
                onSeek={handleSeek}
                onZoomChange={setZoom}
                onClipSelect={setSelectedClipId}
                onTrackMute={handleTrackMute}
                onTrackSolo={handleTrackSolo}
              />
            </div>
          </div>

          {/* Right Sidebar - Properties */}
          <CapCutPropertiesPanel
            selectedClip={selectedClip}
            audioTracks={audioTracks}
            onTracksChange={setAudioTracks}
            audioEnhancements={audioEnhancements}
            onAudioChange={onAudioChange}
          />
        </div>

        {/* Drag Overlay */}
        <DragOverlay>
          {activeDragItem && (
            <div 
              className="px-3 py-2 rounded shadow-lg border flex items-center gap-2"
              style={{ 
                backgroundColor: activeDragItem.color,
                borderColor: '#00d4ff',
              }}
            >
              {activeDragItem.type === 'music' ? (
                <Music className="h-4 w-4 text-white" />
              ) : (
                <Volume2 className="h-4 w-4 text-white" />
              )}
              <span className="text-sm text-white font-medium">{activeDragItem.name}</span>
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
};
