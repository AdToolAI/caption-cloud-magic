import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
  ZoomIn, ZoomOut, Undo2, Redo2, Scissors, Copy, Trash2,
  Maximize2, Minimize2, Grid3X3
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Toggle } from '@/components/ui/toggle';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { TimelineVideoPreview } from './TimelineVideoPreview';
import { MultiTrackTimeline } from './MultiTrackTimeline';
import { AIToolsSidebar } from './AIToolsSidebar';
import { 
  AudioTrack, AudioClip, VideoTrackScene, TimelineState,
  DEFAULT_AUDIO_TRACKS, ZOOM_PRESETS, TIMELINE_SHORTCUTS
} from '@/types/timeline';
import { SceneAnalysis } from '@/types/directors-cut';
import { cn } from '@/lib/utils';

interface TimelineStudioProps {
  videoUrl: string;
  videoDuration: number;
  scenes: SceneAnalysis[];
  onExport?: () => void;
}

export function TimelineStudio({ 
  videoUrl, 
  videoDuration, 
  scenes,
  onExport 
}: TimelineStudioProps) {
  // Timeline State
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>(
    DEFAULT_AUDIO_TRACKS.map(track => ({ ...track, clips: [] }))
  );
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoom, setZoom] = useState(50); // 50px per second
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [masterVolume, setMasterVolume] = useState(100);
  const [isMuted, setIsMuted] = useState(false);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  
  // History for undo/redo
  const [history, setHistory] = useState<AudioTrack[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  
  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  // Convert scenes to video track format
  const videoTrackScenes: VideoTrackScene[] = scenes.map((scene, index) => ({
    id: scene.id || `scene-${index}`,
    startTime: scene.start_time,
    endTime: scene.end_time,
    thumbnailUrl: scene.thumbnail_url,
    name: scene.description?.substring(0, 30) || `Szene ${index + 1}`,
  }));

  // Save to history
  const saveToHistory = useCallback((newTracks: AudioTrack[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(JSON.parse(JSON.stringify(newTracks)));
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [history, historyIndex]);

  // Undo
  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setAudioTracks(JSON.parse(JSON.stringify(history[historyIndex - 1])));
    }
  }, [history, historyIndex]);

  // Redo
  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setAudioTracks(JSON.parse(JSON.stringify(history[historyIndex + 1])));
    }
  }, [history, historyIndex]);

  // Add clip to track
  const handleAddClip = useCallback((trackId: string, clip: Omit<AudioClip, 'id' | 'trackId'>) => {
    const newClip: AudioClip = {
      ...clip,
      id: `clip-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      trackId,
    };
    
    setAudioTracks(prev => {
      const updated = prev.map(track => 
        track.id === trackId 
          ? { ...track, clips: [...track.clips, newClip] }
          : track
      );
      saveToHistory(updated);
      return updated;
    });
    
    return newClip;
  }, [saveToHistory]);

  // Move clip
  const handleMoveClip = useCallback((
    clipId: string, 
    newTrackId: string, 
    newStartTime: number
  ) => {
    setAudioTracks(prev => {
      let movedClip: AudioClip | null = null;
      
      // Remove from old track
      const withoutClip = prev.map(track => {
        const clipIndex = track.clips.findIndex(c => c.id === clipId);
        if (clipIndex !== -1) {
          movedClip = { ...track.clips[clipIndex] };
          return {
            ...track,
            clips: track.clips.filter(c => c.id !== clipId),
          };
        }
        return track;
      });
      
      if (!movedClip) return prev;
      
      // Snap to grid if enabled
      const snappedTime = snapToGrid 
        ? Math.round(newStartTime * 2) / 2 // Snap to 0.5s
        : newStartTime;
      
      // Add to new track
      const updated = withoutClip.map(track => 
        track.id === newTrackId
          ? { 
              ...track, 
              clips: [...track.clips, { 
                ...movedClip!, 
                trackId: newTrackId, 
                startTime: Math.max(0, snappedTime) 
              }] 
            }
          : track
      );
      
      saveToHistory(updated);
      return updated;
    });
  }, [snapToGrid, saveToHistory]);

  // Resize clip
  const handleResizeClip = useCallback((
    clipId: string, 
    newDuration: number,
    edge: 'start' | 'end'
  ) => {
    setAudioTracks(prev => {
      const updated = prev.map(track => ({
        ...track,
        clips: track.clips.map(clip => {
          if (clip.id !== clipId) return clip;
          
          if (edge === 'end') {
            return { ...clip, duration: Math.max(0.5, newDuration) };
          } else {
            const diff = clip.duration - newDuration;
            return { 
              ...clip, 
              startTime: clip.startTime + diff,
              duration: Math.max(0.5, newDuration),
              trimStart: clip.trimStart + diff,
            };
          }
        }),
      }));
      saveToHistory(updated);
      return updated;
    });
  }, [saveToHistory]);

  // Delete clip
  const handleDeleteClip = useCallback((clipId: string) => {
    setAudioTracks(prev => {
      const updated = prev.map(track => ({
        ...track,
        clips: track.clips.filter(c => c.id !== clipId),
      }));
      saveToHistory(updated);
      return updated;
    });
    setSelectedClipId(null);
  }, [saveToHistory]);

  // Update track settings
  const handleTrackUpdate = useCallback((trackId: string, updates: Partial<AudioTrack>) => {
    setAudioTracks(prev => 
      prev.map(track => 
        track.id === trackId ? { ...track, ...updates } : track
      )
    );
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;
      
      switch (e.key) {
        case TIMELINE_SHORTCUTS.PLAY_PAUSE:
          e.preventDefault();
          setIsPlaying(p => !p);
          break;
        case TIMELINE_SHORTCUTS.FRAME_BACK:
          setCurrentTime(t => Math.max(0, t - (e.shiftKey ? 1 : 0.1)));
          break;
        case TIMELINE_SHORTCUTS.FRAME_FORWARD:
          setCurrentTime(t => Math.min(videoDuration, t + (e.shiftKey ? 1 : 0.1)));
          break;
        case TIMELINE_SHORTCUTS.DELETE:
          if (selectedClipId) handleDeleteClip(selectedClipId);
          break;
        case TIMELINE_SHORTCUTS.UNDO:
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            handleUndo();
          }
          break;
        case TIMELINE_SHORTCUTS.REDO:
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            handleRedo();
          }
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedClipId, videoDuration, handleDeleteClip, handleUndo, handleRedo]);

  // Format time display
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  return (
    <div 
      ref={containerRef}
      className={cn(
        "flex flex-col bg-background",
        isFullscreen ? "fixed inset-0 z-50" : "h-[calc(100vh-120px)]"
      )}
    >
      {/* Top Toolbar */}
      <div className="h-12 border-b bg-card/50 backdrop-blur-sm flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          {/* Undo/Redo */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={handleUndo}
                disabled={historyIndex <= 0}
              >
                <Undo2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Rückgängig (Ctrl+Z)</TooltipContent>
          </Tooltip>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={handleRedo}
                disabled={historyIndex >= history.length - 1}
              >
                <Redo2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Wiederholen (Ctrl+Y)</TooltipContent>
          </Tooltip>
          
          <div className="w-px h-6 bg-border mx-2" />
          
          {/* Edit Tools */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon">
                <Scissors className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Schneiden</TooltipContent>
          </Tooltip>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon">
                <Copy className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Duplizieren (Ctrl+D)</TooltipContent>
          </Tooltip>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => selectedClipId && handleDeleteClip(selectedClipId)}
                disabled={!selectedClipId}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Löschen (Entf)</TooltipContent>
          </Tooltip>
        </div>
        
        {/* Center: Time Display */}
        <div className="flex items-center gap-4">
          <span className="font-mono text-lg tabular-nums">
            {formatTime(currentTime)}
          </span>
          <span className="text-muted-foreground">/</span>
          <span className="font-mono text-sm text-muted-foreground tabular-nums">
            {formatTime(videoDuration)}
          </span>
        </div>
        
        {/* Right: View Controls */}
        <div className="flex items-center gap-2">
          <Toggle
            pressed={snapToGrid}
            onPressedChange={setSnapToGrid}
            size="sm"
          >
            <Grid3X3 className="h-4 w-4 mr-1" />
            Raster
          </Toggle>
          
          <div className="w-px h-6 bg-border mx-2" />
          
          {/* Zoom */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={() => setZoom(z => Math.max(5, z - 10))}>
                <ZoomOut className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Herauszoomen</TooltipContent>
          </Tooltip>
          
          <div className="w-24">
            <Slider
              value={[zoom]}
              onValueChange={([v]) => setZoom(v)}
              min={5}
              max={100}
              step={5}
            />
          </div>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={() => setZoom(z => Math.min(100, z + 10))}>
                <ZoomIn className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Hineinzoomen</TooltipContent>
          </Tooltip>
          
          <div className="w-px h-6 bg-border mx-2" />
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={() => setIsFullscreen(f => !f)}>
                {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isFullscreen ? 'Vollbild beenden' : 'Vollbild'}</TooltipContent>
          </Tooltip>
        </div>
      </div>
      
      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Video Preview + Timeline */}
        <div className={cn("flex-1 flex flex-col", showSidebar ? "mr-80" : "")}>
          {/* Video Preview - 45% */}
          <div className="h-[45%] bg-black relative">
            <TimelineVideoPreview
              videoUrl={videoUrl}
              audioTracks={audioTracks}
              currentTime={currentTime}
              isPlaying={isPlaying}
              masterVolume={isMuted ? 0 : masterVolume}
              onTimeUpdate={setCurrentTime}
              onPlayPause={setIsPlaying}
            />
            
            {/* Playback Controls Overlay */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/60 backdrop-blur-sm rounded-full px-4 py-2">
              <Button variant="ghost" size="icon" onClick={() => setCurrentTime(0)}>
                <SkipBack className="h-4 w-4" />
              </Button>
              
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-10 w-10"
                onClick={() => setIsPlaying(p => !p)}
              >
                {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
              </Button>
              
              <Button variant="ghost" size="icon" onClick={() => setCurrentTime(videoDuration)}>
                <SkipForward className="h-4 w-4" />
              </Button>
              
              <div className="w-px h-6 bg-white/20 mx-2" />
              
              <Button variant="ghost" size="icon" onClick={() => setIsMuted(m => !m)}>
                {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </Button>
              
              <div className="w-20">
                <Slider
                  value={[masterVolume]}
                  onValueChange={([v]) => setMasterVolume(v)}
                  max={100}
                  className="[&_[role=slider]]:bg-white"
                />
              </div>
            </div>
          </div>
          
          {/* Timeline - 55% */}
          <div className="h-[55%] border-t overflow-hidden">
            <MultiTrackTimeline
              videoScenes={videoTrackScenes}
              audioTracks={audioTracks}
              currentTime={currentTime}
              duration={videoDuration}
              zoom={zoom}
              selectedClipId={selectedClipId}
              onClipSelect={setSelectedClipId}
              onClipMove={handleMoveClip}
              onClipResize={handleResizeClip}
              onClipDelete={handleDeleteClip}
              onTrackUpdate={handleTrackUpdate}
              onSeek={setCurrentTime}
            />
          </div>
        </div>
        
        {/* AI Tools Sidebar */}
        <AnimatePresence>
          {showSidebar && (
            <motion.div
              initial={{ x: 320, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 320, opacity: 0 }}
              className="fixed right-0 top-12 bottom-0 w-80 border-l bg-card/95 backdrop-blur-sm overflow-y-auto"
            >
              <AIToolsSidebar
                onAddVoiceover={(clip) => handleAddClip('track-voiceover', clip)}
                onAddMusic={(clip) => handleAddClip('track-music', clip)}
                onAddSoundEffect={(clip) => handleAddClip('track-sfx', clip)}
                currentTime={currentTime}
                videoDuration={videoDuration}
              />
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Toggle Sidebar Button */}
        <Button
          variant="secondary"
          size="sm"
          className="fixed right-2 top-16 z-50"
          onClick={() => setShowSidebar(s => !s)}
        >
          {showSidebar ? 'Sidebar ausblenden' : 'AI Tools'}
        </Button>
      </div>
    </div>
  );
}
