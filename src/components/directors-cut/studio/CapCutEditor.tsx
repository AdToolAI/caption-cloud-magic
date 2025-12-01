import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { SceneAnalysis, AudioEnhancements } from '@/types/directors-cut';
import { CapCutSidebar } from './CapCutSidebar';
import { CapCutTimeline } from './CapCutTimeline';
import { CapCutPreviewPlayer } from './CapCutPreviewPlayer';
import { CapCutPropertiesPanel } from './CapCutPropertiesPanel';
import { AudioTrack, AudioClip, SubtitleClip, SubtitleTrack, DEFAULT_SUBTITLE_TRACK } from '@/types/timeline';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { Undo2, Redo2, Settings, Music, Volume2, ArrowRight, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DndContext, DragEndEvent, DragStartEvent, DragOverlay } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { AudioEffects, DEFAULT_AUDIO_EFFECTS } from '@/hooks/useWebAudioEffects';

interface CapCutEditorProps {
  videoUrl: string;
  videoDuration: number;
  scenes: SceneAnalysis[];
  audioEnhancements: AudioEnhancements;
  onAudioChange: (enhancements: AudioEnhancements) => void;
  onScenesUpdate?: (scenes: SceneAnalysis[]) => void;
  voiceOverUrl?: string;
  onNextStep?: () => void;
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
  voiceOverUrl,
  onNextStep,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(100);
  const [isMuted, setIsMuted] = useState(false);
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>(DEFAULT_TRACKS);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(50);
  const [activeDragItem, setActiveDragItem] = useState<{ name: string; type: string; color: string } | null>(null);
  
  // Collapsible panels
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [propertiesCollapsed, setPropertiesCollapsed] = useState(false);
  
  // Audio Effects State (lifted from sidebar for Web Audio API integration)
  const [audioEffects, setAudioEffects] = useState<AudioEffects>(DEFAULT_AUDIO_EFFECTS);
  
  // Subtitle Track State
  const [subtitleTrack, setSubtitleTrack] = useState<SubtitleTrack>({ ...DEFAULT_SUBTITLE_TRACK });
  const [selectedSubtitleId, setSelectedSubtitleId] = useState<string | null>(null);
  
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  // Calculate actual total duration from scenes (for multi-source videos)
  const actualTotalDuration = useMemo(() => {
    if (scenes.length === 0) return videoDuration;
    return scenes.reduce((sum, s) => sum + (s.end_time - s.start_time), 0);
  }, [scenes, videoDuration]);

  // Audio effects change handler
  const handleAudioEffectsChange = useCallback((effects: AudioEffects) => {
    setAudioEffects(effects);
  }, []);

  // Subtitle handlers
  const handleCaptionsGenerated = useCallback((captions: SubtitleClip[]) => {
    setSubtitleTrack(prev => ({
      ...prev,
      clips: captions,
    }));
  }, []);

  const handleSubtitleUpdate = useCallback((clipId: string, updates: Partial<SubtitleClip>) => {
    setSubtitleTrack(prev => ({
      ...prev,
      clips: prev.clips.map(c => 
        c.id === clipId ? { ...c, ...updates } : c
      ),
    }));
  }, []);

  const handleSubtitleDelete = useCallback((clipId: string) => {
    setSubtitleTrack(prev => ({
      ...prev,
      clips: prev.clips.filter(c => c.id !== clipId),
    }));
    setSelectedSubtitleId(null);
  }, []);

  // Calculate if video audio should be muted (when voiceover or music exists)
  const shouldMuteVideoAudio = useMemo(() => {
    const voiceoverTrack = audioTracks.find(t => t.id === 'track-voiceover');
    const musicTrack = audioTracks.find(t => t.id === 'track-music');
    
    const hasVoiceover = voiceoverTrack?.clips && voiceoverTrack.clips.length > 0;
    const hasMusic = musicTrack?.clips && musicTrack.clips.length > 0;
    
    return hasVoiceover || hasMusic;
  }, [audioTracks]);

  // Audio playback for timeline clips
  useEffect(() => {
    audioTracks.forEach(track => {
      // Skip original track - it's handled by video element
      if (track.id === 'track-original') return;
      
      track.clips.forEach(clip => {
        // Create audio element if not exists
        if (!audioElementsRef.current.has(clip.id)) {
          const audio = new Audio();
          audio.preload = 'auto';
          audio.src = clip.url;
          audioElementsRef.current.set(clip.id, audio);
        }
        
        const audio = audioElementsRef.current.get(clip.id)!;
        const clipStart = clip.startTime;
        const clipEnd = clip.startTime + clip.duration;
        const isInRange = currentTime >= clipStart && currentTime < clipEnd;
        
        // Calculate effective volume (track muted, solo, volume levels)
        const hasSoloTracks = audioTracks.some(t => t.solo);
        const shouldPlay = hasSoloTracks ? track.solo : !track.muted;
        const effectiveVolume = !shouldPlay ? 0 : 
          (volume / 100) * (track.volume / 100) * (clip.volume / 100);
        
        audio.volume = Math.min(1, Math.max(0, effectiveVolume));
        
        // Play/Pause based on time position
        if (isInRange && isPlaying && shouldPlay) {
          const audioTime = currentTime - clipStart + clip.trimStart;
          
          // Only update currentTime if significantly different to avoid stuttering
          if (Math.abs(audio.currentTime - audioTime) > 0.3) {
            audio.currentTime = audioTime;
          }
          
          if (audio.paused) {
            audio.play().catch(err => console.log('Audio play error:', err));
          }
        } else {
          if (!audio.paused) {
            audio.pause();
          }
        }
      });
    });
  }, [audioTracks, currentTime, isPlaying, volume]);

  // Cleanup audio elements on unmount
  useEffect(() => {
    return () => {
      audioElementsRef.current.forEach(audio => {
        audio.pause();
        audio.src = '';
      });
      audioElementsRef.current.clear();
    };
  }, []);

  const handlePlayPause = useCallback(() => {
    setIsPlaying(prev => !prev);
  }, []);

  const handleSeek = useCallback((time: number) => {
    setCurrentTime(time);
    // Video sync happens in CapCutPreviewPlayer based on currentTime and scene
  }, []);

  const handleTimeUpdate = useCallback(() => {
    // This is called from CapCutPreviewPlayer with the correct global time
  }, []);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onPlayPause: handlePlayPause,
    onUndo: () => console.log('Undo'),
    onRedo: () => console.log('Redo'),
  }, true);

  // Initialize audio tracks with original video audio AND voiceover
  useEffect(() => {
    console.log('[CapCutEditor] Initializing audio tracks');
    console.log('[CapCutEditor] videoUrl:', videoUrl);
    console.log('[CapCutEditor] videoDuration:', videoDuration);
    console.log('[CapCutEditor] voiceOverUrl:', voiceOverUrl);

    if (!videoUrl || videoDuration <= 0) {
      console.log('[CapCutEditor] Missing videoUrl or invalid duration, skipping');
      return;
    }

    setAudioTracks(prev => {
      let updatedTracks = [...prev];
      let hasVoiceover = false;

      // 1. Load Original Video Audio into Original track
      updatedTracks = updatedTracks.map(track => {
        if (track.id === 'track-original') {
          const hasOriginal = track.clips.some(c => c.source === 'original');
          if (!hasOriginal) {
            console.log('[CapCutEditor] Adding original audio clip from video');
            const originalClip: AudioClip = {
              id: `original-${Date.now()}`,
              trackId: 'track-original',
              name: 'Original Audio',
              url: videoUrl,
              startTime: 0,
              duration: videoDuration,
              trimStart: 0,
              trimEnd: videoDuration,
              volume: 100,
              fadeIn: 0,
              fadeOut: 0,
              source: 'original',
              color: '#6366f1',
            };
            return { ...track, clips: [...track.clips, originalClip] };
          }
        }
        return track;
      });

      // 2. Load Voiceover (if exists)
      if (voiceOverUrl && voiceOverUrl.trim() !== '') {
        hasVoiceover = true;
        updatedTracks = updatedTracks.map(track => {
          if (track.id === 'track-voiceover') {
            const hasVoiceoverClip = track.clips.some(c => c.url === voiceOverUrl);
            if (!hasVoiceoverClip) {
              console.log('[CapCutEditor] Adding voiceover clip');
              const voiceoverClip: AudioClip = {
                id: `voiceover-${Date.now() + 1}`,
                trackId: 'track-voiceover',
                name: 'KI Voice-Over',
                url: voiceOverUrl,
                startTime: 0,
                duration: videoDuration,
                trimStart: 0,
                trimEnd: videoDuration,
                volume: 100,
                fadeIn: 0.2,
                fadeOut: 0.2,
                source: 'ai-generated',
                color: '#f59e0b',
              };
              return { ...track, clips: [...track.clips, voiceoverClip] };
            }
          }
          return track;
        });
      }

      // 3. Apply Voiceover Priority - reduce original audio when voiceover exists
      if (hasVoiceover) {
        updatedTracks = updatedTracks.map(track => {
          if (track.id === 'track-original') {
            return { ...track, volume: 30 }; // Reduce to 30% when voiceover present
          }
          return track;
        });
        console.log('[CapCutEditor] Voiceover priority applied - Original Audio reduced to 30%');
      }

      console.log('[CapCutEditor] Updated tracks with audio:', updatedTracks);
      return updatedTracks;
    });
  }, [videoUrl, videoDuration, voiceOverUrl]);

  // Delete clip handler
  const handleDeleteClip = useCallback((clipId: string) => {
    setAudioTracks(prev => prev.map(track => ({
      ...track,
      clips: track.clips.filter(c => c.id !== clipId)
    })));
    setSelectedClipId(null);
  }, []);

  // Delete scene handler
  const handleSceneDelete = useCallback((sceneId: string) => {
    if (!onScenesUpdate) return;
    const updatedScenes = scenes.filter(s => s.id !== sceneId);
    // Recalculate times
    let currentTime = 0;
    const recalculatedScenes = updatedScenes.map(scene => {
      const duration = scene.end_time - scene.start_time;
      const newScene = { ...scene, start_time: currentTime, end_time: currentTime + duration };
      currentTime += duration;
      return newScene;
    });
    onScenesUpdate(recalculatedScenes);
  }, [scenes, onScenesUpdate]);

  // Add scene handler
  const handleSceneAdd = useCallback(() => {
    if (!onScenesUpdate) return;
    const lastScene = scenes[scenes.length - 1];
    const newStartTime = lastScene ? lastScene.end_time : 0;
    const newScene: SceneAnalysis = {
      id: `scene-${Date.now()}`,
      start_time: newStartTime,
      end_time: newStartTime + 5, // 5 seconds blackscreen
      description: 'Neue Szene (Blackscreen)',
      content_description: 'Leere Szene - Video oder Bild hinzufügen',
      suggested_effects: [],
      isBlackscreen: true,
    };
    onScenesUpdate([...scenes, newScene]);
  }, [scenes, onScenesUpdate]);

  // Add video as new scene handler
  const handleAddVideoAsScene = useCallback((videoUrl: string, duration: number, name: string) => {
    if (!onScenesUpdate) return;
    const lastScene = scenes[scenes.length - 1];
    const newStartTime = lastScene ? lastScene.end_time : 0;
    const newScene: SceneAnalysis = {
      id: `scene-${Date.now()}`,
      start_time: newStartTime,
      end_time: newStartTime + duration,
      description: name || 'Hochgeladenes Video',
      content_description: 'Video aus Upload',
      suggested_effects: [],
      isBlackscreen: false,
      additionalMedia: {
        type: 'video',
        url: videoUrl,
        duration: duration,
      },
    };
    onScenesUpdate([...scenes, newScene]);
  }, [scenes, onScenesUpdate]);

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

  // File type validation helpers
  const isAudioFile = (url: string): boolean => {
    const audioExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.webm'];
    return audioExtensions.some(ext => url.toLowerCase().includes(ext));
  };

  const isVideoFile = (url: string): boolean => {
    const videoExtensions = ['.mp4', '.mov', '.webm', '.avi', '.mkv', '.wmv'];
    return videoExtensions.some(ext => url.toLowerCase().includes(ext));
  };

  // Drag & Drop Handlers for shared DndContext
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current;
    if (data?.type === 'scene') {
      setActiveDragItem({
        name: `Szene ${data.index + 1}`,
        type: 'scene',
        color: data.scene?.isBlackscreen ? '#3f3f46' : '#6366f1',
      });
    } else if (data?.source === 'sidebar') {
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

    const activeData = active.data.current as any;
    const targetTrackId = over.id as string;

    // Handle scene reordering
    if (activeData?.type === 'scene' && onScenesUpdate) {
      const draggedIndex = activeData.index;
      const deltaX = event.delta.x;
      const timeDelta = deltaX / zoom;
      
      // Calculate new position based on drag distance
      const newStartTime = Math.max(0, activeData.scene.start_time + timeDelta);
      
      // Create a new scenes array and remove the dragged scene
      const newScenes = [...scenes];
      const [movedScene] = newScenes.splice(draggedIndex, 1);
      
      // Find new index based on the new start time
      let newIndex = newScenes.findIndex(s => s.start_time > newStartTime);
      if (newIndex === -1) newIndex = newScenes.length;
      
      // Insert at new position
      newScenes.splice(newIndex, 0, movedScene);
      
      // Recalculate all scene times sequentially
      let currentSceneTime = 0;
      const reorderedScenes = newScenes.map(scene => {
        const duration = scene.end_time - scene.start_time;
        const updatedScene = {
          ...scene,
          start_time: currentSceneTime,
          end_time: currentSceneTime + duration,
        };
        currentSceneTime += duration;
        return updatedScene;
      });
      
      onScenesUpdate(reorderedScenes);
      toast.success('Szenen-Reihenfolge aktualisiert');
      return;
    }

    // Audio tracks that should only accept audio files
    const audioOnlyTracks = ['track-voiceover', 'track-music', 'track-sfx'];
    const isAudioOnlyTrack = audioOnlyTracks.includes(targetTrackId);

    // Handle sidebar drops
    if (activeData?.source === 'sidebar' && activeData?.clip) {
      const clip = activeData.clip;
      const fileUrl = clip.url || '';

      // Block video files from being dropped into audio-only tracks
      if (isAudioOnlyTrack && isVideoFile(fileUrl) && !isAudioFile(fileUrl)) {
        toast.error('Videodateien können nicht in Audio-Tracks gezogen werden. Bitte verwende nur Audio-Dateien.');
        return;
      }

      handleAddClip(targetTrackId, {
        trackId: targetTrackId,
        name: clip.name,
        url: fileUrl,
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

      const fileUrl = dragData.clip.url || '';

      // Block video files from being moved to audio-only tracks
      if (isAudioOnlyTrack && isVideoFile(fileUrl) && !isAudioFile(fileUrl)) {
        toast.error('Videodateien können nicht in Audio-Tracks verschoben werden.');
        return;
      }

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
  }, [audioTracks, scenes, zoom, handleAddClip, onScenesUpdate]);

  const selectedClip = audioTracks
    .flatMap(t => t.clips)
    .find(c => c.id === selectedClipId);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#1a1a1a]">
      {/* Header Bar */}
      <div className="h-10 flex items-center justify-between px-3 border-b border-[#2a2a2a] bg-[#242424]">
        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-7 w-7 p-0 text-white/60 hover:text-white hover:bg-white/10"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            title={sidebarCollapsed ? "Sidebar öffnen" : "Sidebar schließen"}
          >
            {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </Button>
          <span className="text-white font-semibold text-sm">Audio Studio</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-white/60 hover:text-white hover:bg-white/10">
            <Undo2 className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-white/60 hover:text-white hover:bg-white/10">
            <Redo2 className="h-3.5 w-3.5" />
          </Button>
          <div className="w-px h-5 bg-[#3a3a3a] mx-1" />
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-7 w-7 p-0 text-white/60 hover:text-white hover:bg-white/10"
            onClick={() => setPropertiesCollapsed(!propertiesCollapsed)}
            title={propertiesCollapsed ? "Eigenschaften öffnen" : "Eigenschaften schließen"}
          >
            {propertiesCollapsed ? <PanelRightOpen className="h-4 w-4" /> : <PanelRightClose className="h-4 w-4" />}
          </Button>
          {onNextStep && (
            <>
              <div className="w-px h-5 bg-[#3a3a3a] mx-1" />
              <Button 
                onClick={onNextStep}
                size="sm"
                className="gap-1.5 h-7 bg-primary hover:bg-primary/90 text-xs"
              >
                Export
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Main Content with shared DndContext */}
      <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex-1 flex overflow-hidden">
          {/* Left Sidebar - Collapsible */}
          <div className={cn(
            "flex flex-col border-r border-[#2a2a2a] bg-[#1e1e1e] transition-all duration-200",
            sidebarCollapsed ? "w-12" : "w-64"
          )}>
            {sidebarCollapsed ? (
              <div className="flex flex-col items-center gap-3 py-4">
                <button
                  onClick={() => setSidebarCollapsed(false)}
                  className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                  title="Voiceover"
                >
                  <Mic className="h-5 w-5" />
                </button>
                <button 
                  onClick={() => setSidebarCollapsed(false)}
                  className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                  title="Musik"
                >
                  <Music className="h-5 w-5" />
                </button>
                <button 
                  onClick={() => setSidebarCollapsed(false)}
                  className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                  title="Sound Effects"
                >
                  <Volume2 className="h-5 w-5" />
                </button>
              </div>
            ) : (
              <CapCutSidebar 
                onAddClip={handleAddClip}
                audioEnhancements={audioEnhancements}
                onAudioChange={onAudioChange}
                videoUrl={videoUrl}
                videoDuration={actualTotalDuration}
                voiceOverUrl={voiceOverUrl}
                onAddVideoAsScene={handleAddVideoAsScene}
                audioEffects={audioEffects}
                onAudioEffectsChange={handleAudioEffectsChange}
                onCaptionsGenerated={handleCaptionsGenerated}
              />
            )}
          </div>

          {/* Center Area */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Preview Player */}
            <div className="h-[40%] min-h-[180px] p-2 bg-[#1a1a1a]">
              <CapCutPreviewPlayer
                videoUrl={videoUrl}
                isPlaying={isPlaying}
                currentTime={currentTime}
                duration={actualTotalDuration}
                volume={volume}
                isMuted={isMuted}
                autoMuteVideo={shouldMuteVideoAudio}
                scenes={scenes}
                audioEffects={audioEffects}
                onPlayPause={handlePlayPause}
                onSeek={handleSeek}
                onTimeUpdate={setCurrentTime}
                onVolumeChange={setVolume}
                onMuteToggle={() => setIsMuted(!isMuted)}
                onPlayingChange={setIsPlaying}
              />
            </div>

            {/* Timeline */}
            <div className="flex-1 border-t border-[#2a2a2a] overflow-hidden">
              <CapCutTimeline
                tracks={audioTracks}
                scenes={scenes}
                currentTime={currentTime}
                duration={actualTotalDuration}
                zoom={zoom}
                selectedClipId={selectedClipId}
                selectedSceneId={selectedSceneId}
                subtitleTrack={subtitleTrack}
                selectedSubtitleId={selectedSubtitleId}
                onSeek={handleSeek}
                onZoomChange={setZoom}
                onClipSelect={setSelectedClipId}
                onSceneSelect={setSelectedSceneId}
                onTrackMute={handleTrackMute}
                onTrackSolo={handleTrackSolo}
                onClipDelete={handleDeleteClip}
                onSceneDelete={handleSceneDelete}
                onSceneAdd={handleSceneAdd}
                onSceneAddFromMedia={() => toast.info('Mediathek-Integration kommt bald! Nutze für jetzt den Upload in der Sidebar.')}
                onSubtitleUpdate={handleSubtitleUpdate}
                onSubtitleDelete={handleSubtitleDelete}
                onSubtitleSelect={setSelectedSubtitleId}
              />
            </div>
          </div>

          {/* Right Sidebar - Collapsible */}
          <div className={cn(
            "border-l border-[#2a2a2a] bg-[#1e1e1e] transition-all duration-200",
            propertiesCollapsed ? "w-12" : "w-72"
          )}>
            {propertiesCollapsed ? (
              <div className="flex flex-col items-center py-4">
                <button 
                  onClick={() => setPropertiesCollapsed(false)}
                  className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                  title="Eigenschaften öffnen"
                >
                  <Settings className="h-5 w-5" />
                </button>
              </div>
            ) : (
              <CapCutPropertiesPanel
                selectedClip={selectedClip}
                audioTracks={audioTracks}
                onTracksChange={setAudioTracks}
                audioEnhancements={audioEnhancements}
                onAudioChange={onAudioChange}
              />
            )}
          </div>
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
