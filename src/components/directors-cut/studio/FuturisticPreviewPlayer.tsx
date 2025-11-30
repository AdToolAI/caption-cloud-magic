import { RefObject } from 'react';
import { motion } from 'framer-motion';
import { 
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, 
  Maximize2, Settings
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { SceneAnalysis } from '@/types/directors-cut';

interface FuturisticPreviewPlayerProps {
  videoUrl: string;
  videoRef: RefObject<HTMLVideoElement>;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  volume: number;
  scenes: SceneAnalysis[];
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  onVolumeChange: (volume: number) => void;
  onMuteToggle: () => void;
  isMuted: boolean;
}

export function FuturisticPreviewPlayer({
  videoUrl,
  videoRef,
  currentTime,
  duration,
  isPlaying,
  volume,
  scenes,
  onPlayPause,
  onSeek,
  onVolumeChange,
  onMuteToggle,
  isMuted,
}: FuturisticPreviewPlayerProps) {
  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="h-full flex flex-col gap-3">
      {/* Video Container with Glassmorphism Frame */}
      <div className="flex-1 relative rounded-2xl overflow-hidden">
        {/* Outer Glow */}
        <div className="absolute -inset-1 bg-gradient-to-r from-violet-600/20 via-cyan-500/20 to-purple-600/20 rounded-2xl blur-xl" />
        
        {/* Glass Frame */}
        <div className="relative h-full rounded-2xl overflow-hidden border border-white/10 bg-black/40 backdrop-blur-sm">
          {/* Video */}
          <video
            ref={videoRef}
            src={videoUrl}
            className="w-full h-full object-contain"
            playsInline
          />

          {/* Overlay Gradient */}
          <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/60 via-transparent to-transparent" />

          {/* Center Play Button (when paused) */}
          {!isPlaying && (
            <motion.button
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center"
              onClick={onPlayPause}
            >
              <div className="w-20 h-20 rounded-full bg-white/10 backdrop-blur-xl border border-white/20 flex items-center justify-center hover:bg-white/20 transition-all shadow-[0_0_40px_rgba(255,255,255,0.2)]">
                <Play className="h-8 w-8 text-white ml-1" />
              </div>
            </motion.button>
          )}

          {/* Scene Markers on Timeline */}
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10">
            {scenes.map((scene, index) => (
              <div
                key={scene.id}
                className="absolute h-full bg-violet-500/30"
                style={{
                  left: `${(scene.start_time / duration) * 100}%`,
                  width: `${((scene.end_time - scene.start_time) / duration) * 100}%`,
                }}
              />
            ))}
            {/* Progress Bar */}
            <motion.div
              className="absolute h-full bg-gradient-to-r from-cyan-400 to-violet-500"
              style={{ width: `${progress}%` }}
            />
            {/* Playhead Glow */}
            <motion.div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow-[0_0_15px_rgba(255,255,255,0.8)]"
              style={{ left: `${progress}%`, marginLeft: '-6px' }}
              animate={{
                boxShadow: ['0 0 10px rgba(255,255,255,0.6)', '0 0 20px rgba(255,255,255,1)', '0 0 10px rgba(255,255,255,0.6)']
              }}
              transition={{ repeat: Infinity, duration: 2 }}
            />
          </div>
        </div>
      </div>

      {/* Playback Controls */}
      <div className="relative">
        {/* Glass Control Bar */}
        <div className="relative rounded-xl overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-white/5 to-white/[0.02] backdrop-blur-2xl" />
          <div className="relative flex items-center gap-4 px-4 py-3">
            {/* Transport Controls */}
            <div className="flex items-center gap-1">
              <NeonButton onClick={() => onSeek(Math.max(0, currentTime - 10))} size="sm">
                <SkipBack className="h-4 w-4" />
              </NeonButton>
              <NeonButton onClick={onPlayPause} size="md" primary>
                {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
              </NeonButton>
              <NeonButton onClick={() => onSeek(Math.min(duration, currentTime + 10))} size="sm">
                <SkipForward className="h-4 w-4" />
              </NeonButton>
            </div>

            {/* Timeline Scrubber */}
            <div className="flex-1 group">
              <div 
                className="relative h-2 bg-white/10 rounded-full cursor-pointer overflow-hidden"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const percent = (e.clientX - rect.left) / rect.width;
                  onSeek(percent * duration);
                }}
              >
                {/* Scene Markers */}
                {scenes.map((scene, index) => (
                  <div
                    key={scene.id}
                    className="absolute h-full bg-violet-500/20"
                    style={{
                      left: `${(scene.start_time / duration) * 100}%`,
                      width: `${((scene.end_time - scene.start_time) / duration) * 100}%`,
                    }}
                  />
                ))}
                {/* Progress */}
                <motion.div
                  className="absolute h-full bg-gradient-to-r from-cyan-400 to-violet-500 rounded-full"
                  style={{ width: `${progress}%` }}
                />
                {/* Hover Effect */}
                <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>

            {/* Time Display */}
            <div className="text-sm font-mono text-white/70 min-w-[100px] text-center">
              <span className="text-white">{formatTime(currentTime)}</span>
              <span className="mx-1">/</span>
              <span>{formatTime(duration)}</span>
            </div>

            {/* Volume Control */}
            <div className="flex items-center gap-2 group">
              <NeonButton onClick={onMuteToggle} size="sm">
                {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </NeonButton>
              <div className="w-20 opacity-0 group-hover:opacity-100 transition-opacity">
                <Slider
                  value={[isMuted ? 0 : volume]}
                  onValueChange={([v]) => onVolumeChange(v)}
                  max={100}
                  step={1}
                  className="cursor-pointer"
                />
              </div>
            </div>

            {/* Additional Controls */}
            <NeonButton size="sm">
              <Settings className="h-4 w-4" />
            </NeonButton>
            <NeonButton size="sm">
              <Maximize2 className="h-4 w-4" />
            </NeonButton>
          </div>
        </div>
      </div>

      {/* Scene Thumbnail Strip */}
      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-white/20">
        {scenes.map((scene, index) => {
          const isActive = currentTime >= scene.start_time && currentTime < scene.end_time;
          return (
            <motion.button
              key={scene.id}
              className={cn(
                "relative flex-shrink-0 h-12 rounded-lg overflow-hidden border-2 transition-all",
                isActive 
                  ? "border-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.5)]" 
                  : "border-white/10 hover:border-white/30"
              )}
              style={{ width: Math.max(48, (scene.end_time - scene.start_time) * 8) }}
              onClick={() => onSeek(scene.start_time)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.98 }}
            >
              {scene.thumbnail_url ? (
                <img src={scene.thumbnail_url} className="w-full h-full object-cover" alt="" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-violet-600/30 to-purple-600/30 flex items-center justify-center">
                  <span className="text-xs font-bold text-white/70">{index + 1}</span>
                </div>
              )}
              {isActive && (
                <motion.div 
                  className="absolute inset-0 bg-cyan-400/20"
                  animate={{ opacity: [0.2, 0.4, 0.2] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                />
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

// Neon Button Component
function NeonButton({ 
  children, 
  onClick, 
  size = 'md',
  primary = false 
}: { 
  children: React.ReactNode; 
  onClick?: () => void;
  size?: 'sm' | 'md';
  primary?: boolean;
}) {
  return (
    <motion.button
      onClick={onClick}
      className={cn(
        "rounded-full flex items-center justify-center transition-all",
        size === 'sm' ? "w-8 h-8" : "w-10 h-10",
        primary 
          ? "bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-[0_0_20px_rgba(139,92,246,0.5)] hover:shadow-[0_0_30px_rgba(139,92,246,0.7)]"
          : "bg-white/10 text-white/80 hover:bg-white/20 hover:text-white"
      )}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
    >
      {children}
    </motion.button>
  );
}
