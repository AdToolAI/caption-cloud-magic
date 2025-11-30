import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { 
  Plus, Volume2, VolumeX, Headphones, Lock, Unlock,
  ZoomIn, ZoomOut, Scissors, Trash2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { AudioTrack, AudioClip } from '@/types/timeline';
import { SceneAnalysis } from '@/types/directors-cut';

interface NeonMultiTrackTimelineProps {
  audioTracks: AudioTrack[];
  scenes: SceneAnalysis[];
  currentTime: number;
  duration: number;
  zoom: number;
  selectedClipId: string | null;
  onSeek: (time: number) => void;
  onClipSelect: (clipId: string | null) => void;
  onClipMove: (clipId: string, newTrackId: string, newStartTime: number) => void;
  onTrackVolumeChange: (trackId: string, volume: number) => void;
  onTrackMute: (trackId: string) => void;
  onTrackSolo: (trackId: string) => void;
  onAddTrack: () => void;
  onZoomChange: (zoom: number) => void;
}

export function NeonMultiTrackTimeline({
  audioTracks,
  scenes,
  currentTime,
  duration,
  zoom,
  selectedClipId,
  onSeek,
  onClipSelect,
  onClipMove,
  onTrackVolumeChange,
  onTrackMute,
  onTrackSolo,
  onAddTrack,
  onZoomChange,
}: NeonMultiTrackTimelineProps) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const pixelsPerSecond = zoom;
  const totalWidth = duration * pixelsPerSecond;

  const handleTimelineClick = (e: React.MouseEvent) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const scrollLeft = timelineRef.current.scrollLeft;
    const clickX = e.clientX - rect.left + scrollLeft;
    const time = clickX / pixelsPerSecond;
    onSeek(Math.max(0, Math.min(time, duration)));
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Generate time markers
  const markerInterval = zoom > 30 ? 5 : zoom > 15 ? 10 : 30;
  const markers = [];
  for (let t = 0; t <= duration; t += markerInterval) {
    markers.push(t);
  }

  return (
    <div className="h-full flex flex-col rounded-xl overflow-hidden border border-white/10 bg-gradient-to-br from-white/5 to-white/[0.02] backdrop-blur-xl">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 bg-black/20">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-white/70 hover:text-white hover:bg-white/10"
          >
            <Scissors className="h-3.5 w-3.5 mr-1" />
            Split
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-white/70 hover:text-white hover:bg-white/10"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Delete
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-white/70 hover:text-white hover:bg-white/10"
            onClick={() => onZoomChange(Math.max(10, zoom - 10))}
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <div className="w-24">
            <Slider
              value={[zoom]}
              onValueChange={([v]) => onZoomChange(v)}
              min={10}
              max={100}
              step={5}
              className="cursor-pointer"
            />
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-white/70 hover:text-white hover:bg-white/10"
            onClick={() => onZoomChange(Math.min(100, zoom + 10))}
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Timeline Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Track Headers */}
        <div className="w-48 flex-shrink-0 border-r border-white/10 bg-black/20">
          {/* Ruler Header */}
          <div className="h-8 border-b border-white/10 flex items-center px-3">
            <span className="text-xs text-white/50 font-medium">TRACKS</span>
          </div>

          {/* Video Track Header */}
          <div className="h-16 border-b border-white/10 flex items-center gap-2 px-3">
            <span className="text-lg">🎬</span>
            <span className="text-sm text-white/80 font-medium">Video</span>
          </div>

          {/* Audio Track Headers */}
          {audioTracks.map((track) => (
            <GlassTrackHeader
              key={track.id}
              track={track}
              onVolumeChange={(v) => onTrackVolumeChange(track.id, v)}
              onMute={() => onTrackMute(track.id)}
              onSolo={() => onTrackSolo(track.id)}
            />
          ))}

          {/* Add Track Button */}
          <motion.button
            className="w-full h-10 flex items-center justify-center gap-2 text-white/50 hover:text-white hover:bg-white/5 transition-colors border-b border-white/10"
            onClick={onAddTrack}
            whileHover={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
          >
            <Plus className="h-4 w-4" />
            <span className="text-xs">Add Track</span>
          </motion.button>
        </div>

        {/* Timeline Tracks */}
        <div 
          ref={timelineRef}
          className="flex-1 overflow-x-auto overflow-y-hidden relative"
          onClick={handleTimelineClick}
        >
          <div style={{ width: totalWidth, minWidth: '100%' }}>
            {/* Time Ruler */}
            <div className="h-8 border-b border-white/10 relative bg-black/20">
              {markers.map((time) => (
                <div
                  key={time}
                  className="absolute top-0 bottom-0 flex flex-col items-center"
                  style={{ left: time * pixelsPerSecond }}
                >
                  <div className="h-2 w-px bg-white/30" />
                  <span className="text-[10px] text-white/50 mt-0.5">{formatTime(time)}</span>
                </div>
              ))}
            </div>

            {/* Video Track */}
            <div className="h-16 border-b border-white/10 relative bg-black/10">
              <div className="absolute inset-0 flex">
                {scenes.map((scene, index) => (
                  <motion.div
                    key={scene.id}
                    className="h-full border-r border-white/10 flex items-center justify-center relative overflow-hidden group"
                    style={{
                      left: scene.start_time * pixelsPerSecond,
                      width: (scene.end_time - scene.start_time) * pixelsPerSecond,
                      position: 'absolute',
                    }}
                    whileHover={{ scale: 1.02, zIndex: 10 }}
                  >
                    {scene.thumbnail_url ? (
                      <img src={scene.thumbnail_url} className="w-full h-full object-cover opacity-80" alt="" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-r from-violet-600/30 to-purple-600/30" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    <span className="absolute bottom-1 left-2 text-xs text-white/80 font-medium">
                      Scene {index + 1}
                    </span>
                    {/* Hover Glow */}
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-violet-500/10 border border-violet-500/30" />
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Audio Tracks */}
            {audioTracks.map((track) => (
              <NeonAudioTrack
                key={track.id}
                track={track}
                pixelsPerSecond={pixelsPerSecond}
                duration={duration}
                selectedClipId={selectedClipId}
                onClipSelect={onClipSelect}
              />
            ))}

            {/* Playhead */}
            <motion.div
              className="absolute top-0 bottom-0 w-0.5 pointer-events-none z-50"
              style={{ left: currentTime * pixelsPerSecond }}
              animate={{
                boxShadow: ['0 0 10px rgba(34,211,238,0.6)', '0 0 20px rgba(34,211,238,1)', '0 0 10px rgba(34,211,238,0.6)']
              }}
              transition={{ repeat: Infinity, duration: 2 }}
            >
              <div className="w-full h-full bg-gradient-to-b from-cyan-400 via-cyan-500 to-cyan-400" />
              {/* Playhead Top Marker */}
              <div className="absolute -top-0 left-1/2 -translate-x-1/2 w-3 h-3 bg-cyan-400 rotate-45 shadow-[0_0_10px_rgba(34,211,238,0.8)]" />
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Glass Track Header
function GlassTrackHeader({
  track,
  onVolumeChange,
  onMute,
  onSolo,
}: {
  track: AudioTrack;
  onVolumeChange: (volume: number) => void;
  onMute: () => void;
  onSolo: () => void;
}) {
  const [showVolume, setShowVolume] = useState(false);

  return (
    <div 
      className="h-12 border-b border-white/10 flex items-center gap-2 px-2 group"
      onMouseEnter={() => setShowVolume(true)}
      onMouseLeave={() => setShowVolume(false)}
    >
      <span className="text-base">{track.icon}</span>
      <span className="text-xs text-white/80 font-medium flex-1 truncate">{track.name}</span>
      
      <div className="flex items-center gap-1">
        <motion.button
          className={cn(
            "w-6 h-6 rounded flex items-center justify-center text-xs transition-all",
            track.muted ? "bg-red-500/30 text-red-400" : "text-white/50 hover:text-white hover:bg-white/10"
          )}
          onClick={onMute}
          whileTap={{ scale: 0.9 }}
        >
          {track.muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
        </motion.button>
        <motion.button
          className={cn(
            "w-6 h-6 rounded flex items-center justify-center text-xs transition-all",
            track.solo ? "bg-yellow-500/30 text-yellow-400" : "text-white/50 hover:text-white hover:bg-white/10"
          )}
          onClick={onSolo}
          whileTap={{ scale: 0.9 }}
        >
          <Headphones className="h-3 w-3" />
        </motion.button>
      </div>

      {/* Volume Slider (on hover) */}
      {showVolume && (
        <motion.div 
          initial={{ opacity: 0, width: 0 }}
          animate={{ opacity: 1, width: 60 }}
          exit={{ opacity: 0, width: 0 }}
          className="overflow-hidden"
        >
          <Slider
            value={[track.volume]}
            onValueChange={([v]) => onVolumeChange(v)}
            max={100}
            step={1}
            className="cursor-pointer"
          />
        </motion.div>
      )}
    </div>
  );
}

// Neon Audio Track
function NeonAudioTrack({
  track,
  pixelsPerSecond,
  duration,
  selectedClipId,
  onClipSelect,
}: {
  track: AudioTrack;
  pixelsPerSecond: number;
  duration: number;
  selectedClipId: string | null;
  onClipSelect: (clipId: string | null) => void;
}) {
  return (
    <div 
      className={cn(
        "h-12 border-b border-white/10 relative",
        track.muted && "opacity-50"
      )}
      style={{ backgroundColor: `${track.color}10` }}
    >
      {/* Waveform Background Pattern */}
      <div className="absolute inset-0 opacity-20">
        {Array.from({ length: Math.ceil(duration * 2) }).map((_, i) => (
          <div
            key={i}
            className="absolute bottom-0 w-px bg-white/30"
            style={{
              left: `${(i / (duration * 2)) * 100}%`,
              height: `${20 + Math.random() * 60}%`,
            }}
          />
        ))}
      </div>

      {/* Audio Clips */}
      {track.clips.map((clip) => (
        <motion.div
          key={clip.id}
          className={cn(
            "absolute top-1 bottom-1 rounded-md cursor-pointer overflow-hidden",
            selectedClipId === clip.id 
              ? "ring-2 ring-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.5)]"
              : "hover:ring-1 hover:ring-white/30"
          )}
          style={{
            left: clip.startTime * pixelsPerSecond,
            width: clip.duration * pixelsPerSecond,
            backgroundColor: track.color,
          }}
          onClick={(e) => {
            e.stopPropagation();
            onClipSelect(clip.id);
          }}
          whileHover={{ scale: 1.02 }}
          layoutId={clip.id}
        >
          {/* Clip Content */}
          <div className="h-full flex items-center px-2">
            <span className="text-[10px] text-white font-medium truncate">{clip.name}</span>
          </div>

          {/* Waveform Visualization */}
          <div className="absolute inset-0 flex items-end opacity-40">
            {clip.waveformData?.map((v, i) => (
              <div
                key={i}
                className="flex-1 bg-white/60"
                style={{ height: `${v}%` }}
              />
            )) || (
              // Fake waveform if no data
              Array.from({ length: 30 }).map((_, i) => (
                <div
                  key={i}
                  className="flex-1 bg-white/60"
                  style={{ height: `${20 + Math.random() * 60}%` }}
                />
              ))
            )}
          </div>

          {/* Resize Handles */}
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-white/30 cursor-ew-resize hover:bg-white/60" />
          <div className="absolute right-0 top-0 bottom-0 w-1 bg-white/30 cursor-ew-resize hover:bg-white/60" />
        </motion.div>
      ))}
    </div>
  );
}
