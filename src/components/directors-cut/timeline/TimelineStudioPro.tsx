import { useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
  Maximize2, Settings, Scissors, Undo, Redo, ZoomIn, ZoomOut
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { SceneAnalysis } from '@/types/directors-cut';
import { AudioTrack, AudioClip, DEFAULT_AUDIO_TRACKS } from '@/types/timeline';
import { TimelineVideoPreview } from './TimelineVideoPreview';
import { SceneThumbnailBar } from './SceneThumbnailBar';
import { EditableVideoTrack } from './EditableVideoTrack';
import { MultiTrackTimelinePro } from './MultiTrackTimelinePro';
import { AIToolsSidebarExpanded } from './AIToolsSidebarExpanded';

interface TimelineStudioProProps {
  videoUrl: string;
  videoDuration: number;
  scenes: SceneAnalysis[];
  onScenesUpdate: (scenes: SceneAnalysis[]) => void;
  appliedEffects?: any;
  onExport?: () => void;
}

export function TimelineStudioPro({
  videoUrl,
  videoDuration,
  scenes,
  onScenesUpdate,
  appliedEffects,
  onExport,
}: TimelineStudioProProps) {
  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [masterVolume, setMasterVolume] = useState(80);
  const [isMuted, setIsMuted] = useState(false);
  
  // Timeline state
  const [zoom, setZoom] = useState(50);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  
  // Audio tracks with default configuration
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>(() => 
    DEFAULT_AUDIO_TRACKS.map(track => ({ ...track, clips: [] }))
  );
  
  // History for undo/redo
  const [history, setHistory] = useState<any[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      switch (e.key) {
        case ' ':
          e.preventDefault();
          setIsPlaying(prev => !prev);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          setCurrentTime(prev => Math.max(0, prev - (e.shiftKey ? 1 : 0.033)));
          break;
        case 'ArrowRight':
          e.preventDefault();
          setCurrentTime(prev => Math.min(videoDuration, prev + (e.shiftKey ? 1 : 0.033)));
          break;
        case 's':
          if (!e.ctrlKey && !e.metaKey) {
            handleSplitScene();
          }
          break;
        case 'z':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            handleUndo();
          }
          break;
        case 'y':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            handleRedo();
          }
          break;
        case 'm':
          setIsMuted(prev => !prev);
          break;
        case '+':
        case '=':
          setZoom(prev => Math.min(200, prev + 10));
          break;
        case '-':
          setZoom(prev => Math.max(10, prev - 10));
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [videoDuration]);

  const handleTimeUpdate = useCallback((time: number) => {
    setCurrentTime(time);
  }, []);

  const handlePlayPause = useCallback((playing: boolean) => {
    setIsPlaying(playing);
  }, []);

  const handleSeek = useCallback((time: number) => {
    setCurrentTime(time);
    setIsPlaying(false);
  }, []);

  const handleSceneClick = useCallback((time: number) => {
    setCurrentTime(time);
    setIsPlaying(false);
  }, []);

  const handleSplitScene = useCallback(() => {
    const currentScene = scenes.find(
      s => currentTime >= s.start_time && currentTime < s.end_time
    );
    if (!currentScene || currentTime <= currentScene.start_time || currentTime >= currentScene.end_time) {
      return;
    }

    const newScenes = scenes.flatMap(scene => {
      if (scene.id === currentScene.id) {
        return [
          { ...scene, end_time: currentTime, id: `${scene.id}-a` },
          { 
            ...scene, 
            start_time: currentTime, 
            id: `${scene.id}-b`,
            description: `${scene.description} (Teil 2)` 
          },
        ];
      }
      return [scene];
    });

    saveToHistory();
    onScenesUpdate(newScenes);
  }, [scenes, currentTime, onScenesUpdate]);

  const handleMergeScenes = useCallback((sceneIds: string[]) => {
    if (sceneIds.length < 2) return;
    
    const sortedScenes = scenes
      .filter(s => sceneIds.includes(s.id))
      .sort((a, b) => a.start_time - b.start_time);
    
    const mergedScene: SceneAnalysis = {
      ...sortedScenes[0],
      end_time: sortedScenes[sortedScenes.length - 1].end_time,
      description: sortedScenes.map(s => s.description).join(' → '),
    };

    const newScenes = scenes.filter(s => !sceneIds.includes(s.id) || s.id === sortedScenes[0].id);
    const index = newScenes.findIndex(s => s.id === sortedScenes[0].id);
    newScenes[index] = mergedScene;

    saveToHistory();
    onScenesUpdate(newScenes);
  }, [scenes, onScenesUpdate]);

  const handleSceneReorder = useCallback((fromIndex: number, toIndex: number) => {
    const newScenes = [...scenes];
    const [moved] = newScenes.splice(fromIndex, 1);
    newScenes.splice(toIndex, 0, moved);
    
    // Recalculate times
    let currentStart = 0;
    const retimedScenes = newScenes.map(scene => {
      const duration = scene.end_time - scene.start_time;
      const newScene = {
        ...scene,
        start_time: currentStart,
        end_time: currentStart + duration,
      };
      currentStart += duration;
      return newScene;
    });

    saveToHistory();
    onScenesUpdate(retimedScenes);
  }, [scenes, onScenesUpdate]);

  const handleAddAudioClip = useCallback((trackId: string, clip: AudioClip) => {
    setAudioTracks(prev => prev.map(track => {
      if (track.id === trackId) {
        return { ...track, clips: [...track.clips, clip] };
      }
      return track;
    }));
  }, []);

  const handleAddTrack = useCallback(() => {
    const newTrack: AudioTrack = {
      id: `track-custom-${Date.now()}`,
      type: 'sound-effect',
      name: `Audio Track ${audioTracks.length + 1}`,
      clips: [],
      volume: 100,
      muted: false,
      locked: false,
      solo: false,
      color: ['#8b5cf6', '#06b6d4', '#f97316', '#84cc16'][audioTracks.length % 4],
      icon: '🎵',
    };
    setAudioTracks(prev => [...prev, newTrack]);
  }, [audioTracks.length]);

  const saveToHistory = useCallback(() => {
    const state = { scenes: [...scenes], audioTracks: [...audioTracks] };
    setHistory(prev => [...prev.slice(0, historyIndex + 1), state]);
    setHistoryIndex(prev => prev + 1);
  }, [scenes, audioTracks, historyIndex]);

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const prevState = history[historyIndex - 1];
      onScenesUpdate(prevState.scenes);
      setAudioTracks(prevState.audioTracks);
      setHistoryIndex(prev => prev - 1);
    }
  }, [history, historyIndex, onScenesUpdate]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextState = history[historyIndex + 1];
      onScenesUpdate(nextState.scenes);
      setAudioTracks(nextState.audioTracks);
      setHistoryIndex(prev => prev + 1);
    }
  }, [history, historyIndex, onScenesUpdate]);

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    const frames = Math.floor((time % 1) * 30);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] bg-background">
      {/* Top Toolbar */}
      <div className="h-12 border-b bg-card/50 flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleUndo} disabled={historyIndex <= 0}>
            <Undo className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleRedo} disabled={historyIndex >= history.length - 1}>
            <Redo className="h-4 w-4" />
          </Button>
          <div className="w-px h-6 bg-border mx-2" />
          <Button variant="ghost" size="sm" onClick={handleSplitScene}>
            <Scissors className="h-4 w-4 mr-1" />
            Splitten (S)
          </Button>
        </div>
        
        <div className="flex items-center gap-4">
          <span className="text-sm font-mono text-muted-foreground">
            {formatTime(currentTime)} / {formatTime(videoDuration)}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setZoom(prev => Math.max(10, prev - 10))}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-xs w-12 text-center">{zoom}%</span>
          <Button variant="ghost" size="sm" onClick={() => setZoom(prev => Math.min(200, prev + 10))}>
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex">
        {/* Left: Preview + Timeline */}
        <div className="flex-1 flex flex-col">
          {/* LARGE Preview Player - 60% */}
          <div className="h-[60%] bg-black relative flex flex-col">
            {/* Video Preview */}
            <div className="flex-1 relative">
              <TimelineVideoPreview
                videoUrl={videoUrl}
                audioTracks={audioTracks}
                currentTime={currentTime}
                isPlaying={isPlaying}
                masterVolume={isMuted ? 0 : masterVolume}
                onTimeUpdate={handleTimeUpdate}
                onPlayPause={handlePlayPause}
              />
            </div>
            
            {/* Playback Controls */}
            <div className="h-14 bg-card/90 backdrop-blur border-t flex items-center justify-center gap-4 px-4">
              <Button variant="ghost" size="sm" onClick={() => setCurrentTime(0)}>
                <SkipBack className="h-4 w-4" />
              </Button>
              <Button 
                variant="default" 
                size="lg"
                className="rounded-full w-12 h-12"
                onClick={() => setIsPlaying(!isPlaying)}
              >
                {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setCurrentTime(videoDuration)}>
                <SkipForward className="h-4 w-4" />
              </Button>
              
              <div className="w-px h-6 bg-border mx-2" />
              
              <Button variant="ghost" size="sm" onClick={() => setIsMuted(!isMuted)}>
                {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </Button>
              <Slider
                value={[isMuted ? 0 : masterVolume]}
                onValueChange={([v]) => {
                  setMasterVolume(v);
                  setIsMuted(false);
                }}
                max={100}
                step={1}
                className="w-24"
              />
            </div>
            
            {/* Scene Thumbnail Bar */}
            <SceneThumbnailBar
              scenes={scenes}
              currentTime={currentTime}
              videoDuration={videoDuration}
              onSceneClick={handleSceneClick}
              selectedSceneId={selectedSceneId}
              onSceneSelect={setSelectedSceneId}
            />
          </div>

          {/* Timeline Area - 40% */}
          <div className="h-[40%] border-t bg-card/30">
            <MultiTrackTimelinePro
              scenes={scenes}
              audioTracks={audioTracks}
              currentTime={currentTime}
              videoDuration={videoDuration}
              zoom={zoom}
              selectedClipId={selectedClipId}
              onTimeChange={handleSeek}
              onClipSelect={setSelectedClipId}
              onSceneSplit={handleSplitScene}
              onSceneMerge={handleMergeScenes}
              onSceneReorder={handleSceneReorder}
              onAudioTracksChange={setAudioTracks}
              onAddTrack={handleAddTrack}
            />
          </div>
        </div>

        {/* Right: AI Tools Sidebar */}
        <AIToolsSidebarExpanded
          videoUrl={videoUrl}
          scenes={scenes}
          audioTracks={audioTracks}
          currentTime={currentTime}
          onAddAudioClip={handleAddAudioClip}
          onScenesUpdate={onScenesUpdate}
          onExport={onExport}
        />
      </div>
    </div>
  );
}
