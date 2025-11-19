import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Play, Pause, RotateCcw, Info, AlertCircle } from 'lucide-react';
import { SubtitleStyle } from './SubtitleStyleEditor';

interface ScriptSegment {
  imageIndex: number;
  subtitle: string;
  duration: number;
  startTime: number;
}

interface VideoQuickPreviewProps {
  script: string;
  mediaUrls: string[];
  voiceStyle: string;
  voiceSpeed: number;
  filters: {
    brightness: number;
    contrast: number;
    saturation: number;
    grayscale: number;
    sepia: number;
    hueRotate: number;
  };
  subtitles: {
    enabled: boolean;
    style: SubtitleStyle;
  };
}

export const VideoQuickPreview = ({
  script,
  mediaUrls,
  voiceStyle,
  voiceSpeed,
  filters,
  subtitles,
}: VideoQuickPreviewProps) => {
  const [segments, setSegments] = useState<ScriptSegment[]>([]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const animationFrameRef = useRef<number>();

  // Cleanup function for audio URL
  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [audioUrl]);

  // Initialize preview data
  useEffect(() => {
    const analyzeScript = async () => {
      const { data, error } = await supabase.functions.invoke('analyze-script-for-video', {
        body: { 
          scriptText: script,
          imageCount: mediaUrls.length
        }
      });
      
      if (error) throw new Error(error.message || 'Script-Analyse fehlgeschlagen');
      
      // Calculate startTime for each segment
      let cumulativeTime = 0;
      const segmentsWithStartTime = data.segments.map((seg: any) => {
        const segment = { ...seg, startTime: cumulativeTime };
        cumulativeTime += seg.duration;
        return segment;
      });
      
      setSegments(segmentsWithStartTime);
      setDuration(cumulativeTime);
    };

    const generateVoicePreview = async () => {
      // Use first ~500 characters for preview (approx. 30 seconds audio)
      const previewText = script.slice(0, 500);
      
      const { data, error } = await supabase.functions.invoke('preview-voice', {
        body: { 
          text: previewText,
          voiceId: voiceStyle,
          speed: voiceSpeed
        }
      });
      
      if (error) throw new Error(error.message || 'Voiceover-Generierung fehlgeschlagen');
      
      // Convert Base64 to Blob
      const binaryString = atob(data.audioContent);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const blob = new Blob([bytes], { type: 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
    };

    Promise.all([analyzeScript(), generateVoicePreview()])
      .then(() => setLoading(false))
      .catch((err) => {
        console.error('Preview error:', err);
        setError(err.message);
        setLoading(false);
      });
  }, [script, mediaUrls, voiceStyle, voiceSpeed]);

  // Current segment based on playback time
  const currentSegmentIndex = segments.findIndex((seg, index) => {
    const nextSegStart = segments[index + 1]?.startTime || duration;
    return currentTime >= seg.startTime && currentTime < nextSegStart;
  });

  const currentSegment = segments[currentSegmentIndex] || segments[0];

  // Update time during playback
  const updateTime = () => {
    if (audioRef.current && isPlaying) {
      setCurrentTime(audioRef.current.currentTime);
      animationFrameRef.current = requestAnimationFrame(updateTime);
    }
  };

  // Play/Pause handler
  const handlePlayPause = () => {
    if (!audioRef.current) return;
    
    if (isPlaying) {
      audioRef.current.pause();
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    } else {
      audioRef.current.play();
      updateTime();
    }
    
    setIsPlaying(!isPlaying);
  };

  // Reset handler
  const handleReset = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      setCurrentTime(0);
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
      }
    }
  };

  // Audio ended handler
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
    
    audio.addEventListener('ended', handleEnded);
    return () => audio.removeEventListener('ended', handleEnded);
  }, []);

  // Format time helper
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Get animation class for subtitles
  const getAnimationClass = (animation: string): string => {
    switch (animation) {
      case 'fade':
        return 'animate-fade-in';
      case 'slide':
        return 'animate-slide-up';
      default:
        return '';
    }
  };

  if (loading) {
    return (
      <div className="relative w-full aspect-video bg-black rounded-lg flex items-center justify-center">
        <div className="text-center space-y-2">
          <Loader2 className="animate-spin h-8 w-8 mx-auto text-white" />
          <p className="text-white text-sm">Vorschau wird vorbereitet...</p>
          <p className="text-muted-foreground text-xs">Script wird analysiert & Voiceover generiert</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Fehler bei der Vorschau</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {/* Video Preview Container */}
      <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden shadow-xl">
        {/* Image Layer with Transitions */}
        <div className="absolute inset-0">
          {segments.map((segment, index) => (
            <div
              key={index}
              className={`absolute inset-0 transition-opacity duration-500 ${
                index === currentSegmentIndex ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <img
                src={mediaUrls[segment.imageIndex] || mediaUrls[0]}
                alt={`Segment ${index + 1}`}
                className="w-full h-full object-cover"
                style={{
                  filter: `
                    brightness(${filters.brightness}%)
                    contrast(${filters.contrast}%)
                    saturate(${filters.saturation}%)
                    grayscale(${filters.grayscale}%)
                    sepia(${filters.sepia}%)
                    hue-rotate(${filters.hueRotate}deg)
                  `
                }}
              />
            </div>
          ))}
        </div>
        
        {/* Subtitle Overlay */}
        {subtitles.enabled && currentSegment && (
          <div 
            className="absolute left-0 right-0 flex justify-center px-4 z-10"
            style={{
              [subtitles.style.position === 'top' ? 'top' : subtitles.style.position === 'center' ? 'top' : 'bottom']: 
                subtitles.style.position === 'center' ? '50%' : '3rem',
              transform: subtitles.style.position === 'center' ? 'translateY(-50%)' : 'none'
            }}
          >
            <div
              className={`px-6 py-3 rounded-lg font-bold text-center max-w-3xl shadow-lg ${getAnimationClass(subtitles.style.animation)}`}
              style={{
                backgroundColor: subtitles.style.backgroundColor,
                color: subtitles.style.color,
                opacity: subtitles.style.backgroundOpacity,
                fontSize: `${subtitles.style.fontSize}px`,
                fontFamily: subtitles.style.font,
                textShadow: subtitles.style.outline 
                  ? `2px 2px 4px ${subtitles.style.outlineColor}, -1px -1px 2px ${subtitles.style.outlineColor}`
                  : 'none'
              }}
            >
              {currentSegment.subtitle}
            </div>
          </div>
        )}
        
        {/* Audio Player (hidden) */}
        <audio 
          ref={audioRef} 
          src={audioUrl || undefined}
          preload="auto"
        />
        
        {/* Playback Controls Overlay */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-4 space-y-2">
          {/* Progress Bar */}
          <div className="w-full bg-white/20 rounded-full h-1 cursor-pointer" onClick={(e) => {
            if (audioRef.current) {
              const rect = e.currentTarget.getBoundingClientRect();
              const x = e.clientX - rect.left;
              const percentage = x / rect.width;
              const newTime = percentage * duration;
              audioRef.current.currentTime = newTime;
              setCurrentTime(newTime);
            }
          }}>
            <div 
              className="bg-white h-1 rounded-full transition-all"
              style={{ width: `${(currentTime / duration) * 100}%` }}
            />
          </div>
          
          {/* Controls */}
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="icon"
              onClick={handlePlayPause}
              className="text-white hover:bg-white/20"
            >
              {isPlaying ? (
                <Pause className="h-6 w-6" />
              ) : (
                <Play className="h-6 w-6" />
              )}
            </Button>
            
            <div className="text-white text-sm font-mono">
              {formatTime(currentTime)} / {formatTime(duration)}
            </div>
            
            <Button
              variant="ghost"
              size="icon"
              onClick={handleReset}
              className="text-white hover:bg-white/20"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      
      {/* Info Banner */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Vorschau-Hinweis</AlertTitle>
        <AlertDescription>
          Dies ist eine vereinfachte Vorschau. Die finale Version wird in höherer Qualität mit 
          professionellen Transitions und exaktem Timing gerendert.
        </AlertDescription>
      </Alert>
    </div>
  );
};
