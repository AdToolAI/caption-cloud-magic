import { useRef, useEffect, useCallback } from 'react';
import { AudioTrack, AudioClip } from '@/types/timeline';

interface TimelineVideoPreviewProps {
  videoUrl: string;
  audioTracks: AudioTrack[];
  currentTime: number;
  isPlaying: boolean;
  masterVolume: number;
  onTimeUpdate: (time: number) => void;
  onPlayPause: (playing: boolean) => void;
}

export function TimelineVideoPreview({
  videoUrl,
  audioTracks,
  currentTime,
  isPlaying,
  masterVolume,
  onTimeUpdate,
  onPlayPause,
}: TimelineVideoPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  const animationRef = useRef<number>();

  // Initialize audio elements for clips
  useEffect(() => {
    const allClips = audioTracks.flatMap(track => 
      track.clips.map(clip => ({ ...clip, trackMuted: track.muted, trackVolume: track.volume, trackSolo: track.solo }))
    );
    
    // Check if any track is soloed
    const hasSolo = audioTracks.some(t => t.solo);
    
    allClips.forEach(clip => {
      if (!audioRefs.current.has(clip.id)) {
        const audio = new Audio(clip.url);
        audio.preload = 'metadata';
        audioRefs.current.set(clip.id, audio);
      }
      
      const audio = audioRefs.current.get(clip.id)!;
      
      // Calculate effective volume
      const isMuted = clip.trackMuted || (hasSolo && !clip.trackSolo);
      const effectiveVolume = isMuted ? 0 : 
        (masterVolume / 100) * (clip.trackVolume / 100) * (clip.volume / 100);
      
      audio.volume = effectiveVolume;
    });
    
    // Cleanup removed clips
    const clipIds = new Set(allClips.map(c => c.id));
    audioRefs.current.forEach((audio, id) => {
      if (!clipIds.has(id)) {
        audio.pause();
        audio.src = '';
        audioRefs.current.delete(id);
      }
    });
  }, [audioTracks, masterVolume]);

  // Sync video playback
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    
    if (Math.abs(video.currentTime - currentTime) > 0.1) {
      video.currentTime = currentTime;
    }
    
    if (isPlaying && video.paused) {
      video.play().catch(console.error);
    } else if (!isPlaying && !video.paused) {
      video.pause();
    }
  }, [currentTime, isPlaying]);

  // Sync audio playback
  const syncAudioPlayback = useCallback(() => {
    const allClips = audioTracks.flatMap(track => 
      track.clips.map(clip => ({ ...clip, trackId: track.id }))
    );
    
    allClips.forEach(clip => {
      const audio = audioRefs.current.get(clip.id);
      if (!audio) return;
      
      const clipStart = clip.startTime;
      const clipEnd = clip.startTime + clip.duration;
      const isInRange = currentTime >= clipStart && currentTime < clipEnd;
      
      if (isInRange && isPlaying) {
        const audioTime = currentTime - clipStart + clip.trimStart;
        
        if (audio.paused) {
          audio.currentTime = audioTime;
          audio.play().catch(() => {});
        } else if (Math.abs(audio.currentTime - audioTime) > 0.2) {
          audio.currentTime = audioTime;
        }
      } else {
        if (!audio.paused) {
          audio.pause();
        }
      }
    });
  }, [audioTracks, currentTime, isPlaying]);

  // Animation loop for time sync
  useEffect(() => {
    if (!isPlaying) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      return;
    }
    
    const update = () => {
      const video = videoRef.current;
      if (video && !video.paused) {
        onTimeUpdate(video.currentTime);
        syncAudioPlayback();
      }
      animationRef.current = requestAnimationFrame(update);
    };
    
    animationRef.current = requestAnimationFrame(update);
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying, onTimeUpdate, syncAudioPlayback]);

  // Handle seeking
  useEffect(() => {
    syncAudioPlayback();
  }, [currentTime, syncAudioPlayback]);

  // Handle video end
  const handleVideoEnded = () => {
    onPlayPause(false);
    audioRefs.current.forEach(audio => audio.pause());
  };

  return (
    <div className="w-full h-full flex items-center justify-center bg-black">
      <video
        ref={videoRef}
        src={videoUrl}
        className="max-w-full max-h-full object-contain"
        muted // We handle audio separately
        onEnded={handleVideoEnded}
        playsInline
      />
    </div>
  );
}
