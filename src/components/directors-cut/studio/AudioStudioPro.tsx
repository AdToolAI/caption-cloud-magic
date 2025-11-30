import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
  Plus, Scissors, Trash2, Copy, Undo, ZoomIn, ZoomOut,
  Mic, Music, Sparkles, Film, Palette, Volume1
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { SceneAnalysis, TransitionAssignment } from '@/types/directors-cut';
import { AudioTrack, AudioClip } from '@/types/timeline';
import { FuturisticPreviewPlayer } from './FuturisticPreviewPlayer';
import { FloatingAIPanel } from './FloatingAIPanel';
import { NeonMultiTrackTimeline } from './NeonMultiTrackTimeline';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

interface AudioStudioProProps {
  videoUrl: string;
  videoDuration: number;
  scenes: SceneAnalysis[];
  audioEnhancements: any;
  onAudioChange: (enhancements: any) => void;
  onScenesUpdate: (scenes: SceneAnalysis[]) => void;
  transitions: TransitionAssignment[];
  appliedEffects: any;
  currentTime: number;
  onTimeChange: (time: number) => void;
}

const DEFAULT_TRACKS: AudioTrack[] = [
  {
    id: 'track-original',
    type: 'original',
    name: 'Original Audio',
    clips: [],
    volume: 100,
    muted: false,
    locked: false,
    solo: false,
    color: '#6366f1',
    icon: '🔊',
  },
  {
    id: 'track-voiceover',
    type: 'voiceover',
    name: 'Voiceover',
    clips: [],
    volume: 100,
    muted: false,
    locked: false,
    solo: false,
    color: '#f59e0b',
    icon: '🎤',
  },
  {
    id: 'track-music',
    type: 'background-music',
    name: 'Background Music',
    clips: [],
    volume: 70,
    muted: false,
    locked: false,
    solo: false,
    color: '#10b981',
    icon: '🎵',
  },
  {
    id: 'track-sfx',
    type: 'sound-effect',
    name: 'Sound Effects',
    clips: [],
    volume: 100,
    muted: false,
    locked: false,
    solo: false,
    color: '#ec4899',
    icon: '🔔',
  },
];

export function AudioStudioPro({
  videoUrl,
  videoDuration,
  scenes,
  audioEnhancements,
  onAudioChange,
  onScenesUpdate,
  transitions,
  appliedEffects,
  currentTime,
  onTimeChange,
}: AudioStudioProProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(80);
  const [isMuted, setIsMuted] = useState(false);
  const [zoom, setZoom] = useState(50);
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>(DEFAULT_TRACKS);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [activeAITab, setActiveAITab] = useState<string>('voice');
  const [showAIPanel, setShowAIPanel] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onPlayPause: () => setIsPlaying(!isPlaying),
    onSave: () => console.log('Save triggered'),
    onUndo: () => console.log('Undo triggered'),
  }, true);

  // Video sync
  useEffect(() => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.play();
      } else {
        videoRef.current.pause();
      }
    }
  }, [isPlaying]);

  useEffect(() => {
    if (videoRef.current && !isPlaying) {
      videoRef.current.currentTime = currentTime;
    }
  }, [currentTime, isPlaying]);

  // Time update
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      onTimeChange(video.currentTime);
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    return () => video.removeEventListener('timeupdate', handleTimeUpdate);
  }, [onTimeChange]);

  const handleSeek = useCallback((time: number) => {
    onTimeChange(Math.max(0, Math.min(time, videoDuration)));
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  }, [videoDuration, onTimeChange]);

  const handleAddTrack = () => {
    const newTrack: AudioTrack = {
      id: `track-custom-${Date.now()}`,
      type: 'sound-effect',
      name: `Audio Track ${audioTracks.length + 1}`,
      clips: [],
      volume: 100,
      muted: false,
      locked: false,
      solo: false,
      color: ['#8b5cf6', '#06b6d4', '#84cc16', '#f97316'][audioTracks.length % 4],
      icon: '🎵',
    };
    setAudioTracks(prev => [...prev, newTrack]);
  };

  const handleTrackVolumeChange = (trackId: string, newVolume: number) => {
    setAudioTracks(prev => prev.map(t => 
      t.id === trackId ? { ...t, volume: newVolume } : t
    ));
  };

  const handleTrackMute = (trackId: string) => {
    setAudioTracks(prev => prev.map(t => 
      t.id === trackId ? { ...t, muted: !t.muted } : t
    ));
  };

  const handleTrackSolo = (trackId: string) => {
    setAudioTracks(prev => prev.map(t => 
      t.id === trackId ? { ...t, solo: !t.solo } : t
    ));
  };

  const handleClipMove = (clipId: string, newTrackId: string, newStartTime: number) => {
    setAudioTracks(prev => {
      const allClips = prev.flatMap(t => t.clips);
      const clip = allClips.find(c => c.id === clipId);
      if (!clip) return prev;

      return prev.map(track => ({
        ...track,
        clips: track.id === newTrackId
          ? [...track.clips.filter(c => c.id !== clipId), { ...clip, trackId: newTrackId, startTime: newStartTime }]
          : track.clips.filter(c => c.id !== clipId)
      }));
    });
  };

  const handleAddClipToTrack = (trackId: string, clip: Omit<AudioClip, 'id' | 'trackId'>) => {
    const newClip: AudioClip = {
      ...clip,
      id: `clip-${Date.now()}`,
      trackId,
    };
    setAudioTracks(prev => prev.map(t => 
      t.id === trackId ? { ...t, clips: [...t.clips, newClip] } : t
    ));
  };

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 overflow-hidden">
      {/* Animated Background Mesh */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-violet-600/10 rounded-full blur-[128px] animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-cyan-600/10 rounded-full blur-[128px] animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-600/5 rounded-full blur-[150px]" />
      </div>

      {/* Main Content */}
      <div className="relative flex-1 flex flex-col z-10">
        {/* Preview Player Section - 55% */}
        <div className="h-[55%] p-4 pb-2">
          <FuturisticPreviewPlayer
            videoUrl={videoUrl}
            videoRef={videoRef}
            currentTime={currentTime}
            duration={videoDuration}
            isPlaying={isPlaying}
            volume={isMuted ? 0 : volume}
            scenes={scenes}
            onPlayPause={() => setIsPlaying(!isPlaying)}
            onSeek={handleSeek}
            onVolumeChange={setVolume}
            onMuteToggle={() => setIsMuted(!isMuted)}
            isMuted={isMuted}
          />
        </div>

        {/* Timeline Section - 45% */}
        <div className="h-[45%] flex">
          {/* Timeline */}
          <div className="flex-1 p-4 pt-2">
            <NeonMultiTrackTimeline
              audioTracks={audioTracks}
              scenes={scenes}
              currentTime={currentTime}
              duration={videoDuration}
              zoom={zoom}
              selectedClipId={selectedClipId}
              onSeek={handleSeek}
              onClipSelect={setSelectedClipId}
              onClipMove={handleClipMove}
              onTrackVolumeChange={handleTrackVolumeChange}
              onTrackMute={handleTrackMute}
              onTrackSolo={handleTrackSolo}
              onAddTrack={handleAddTrack}
              onZoomChange={setZoom}
            />
          </div>

          {/* Floating AI Panel */}
          <AnimatePresence>
            {showAIPanel && (
              <FloatingAIPanel
                activeTab={activeAITab}
                onTabChange={setActiveAITab}
                onClose={() => setShowAIPanel(false)}
                audioEnhancements={audioEnhancements}
                onAudioChange={onAudioChange}
                scenes={scenes}
                currentTime={currentTime}
                onAddClip={handleAddClipToTrack}
              />
            )}
          </AnimatePresence>
        </div>

        {/* Toggle AI Panel Button */}
        {!showAIPanel && (
          <motion.button
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-gradient-to-r from-violet-600 to-purple-600 shadow-[0_0_20px_rgba(139,92,246,0.5)] hover:shadow-[0_0_30px_rgba(139,92,246,0.7)] transition-all"
            onClick={() => setShowAIPanel(true)}
          >
            <Sparkles className="h-5 w-5 text-white" />
          </motion.button>
        )}
      </div>
    </div>
  );
}
