import { useState, useEffect, useRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Play, Pause, RotateCcw, Info, AlertCircle } from 'lucide-react';
import { SubtitleStyle } from './SubtitleStyleEditor';
import { ScriptSegment } from '@/types/video';

interface SegmentAudio {
  segmentId: string;
  audioBlob: Blob;
  audioUrl: string;
  startTime: number;
  duration: number;
}

interface VideoQuickPreviewProps {
  script: string;
  scriptSegments?: ScriptSegment[];
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
  scriptSegments,
  mediaUrls,
  voiceStyle,
  voiceSpeed,
  filters,
  subtitles,
}: VideoQuickPreviewProps) => {
  const [segments, setSegments] = useState<ScriptSegment[]>([]);
  const [segmentAudios, setSegmentAudios] = useState<SegmentAudio[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPlayingSegment, setCurrentPlayingSegment] = useState<SegmentAudio | null>(null);
  
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  const animationFrameRef = useRef<number>();
  const playbackStartTimeRef = useRef<number>(0);
  const isPlayingRef = useRef<boolean>(false);

  // Cleanup function for audio URLs
  useEffect(() => {
    return () => {
      isPlayingRef.current = false;
      segmentAudios.forEach(sa => {
        URL.revokeObjectURL(sa.audioUrl);
      });
      audioRefs.current.forEach(audio => {
        audio.pause();
        audio.src = '';
      });
      audioRefs.current.clear();
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [segmentAudios]);

  // Helper to convert base64 to Blob
  const base64ToBlob = (base64: string, mimeType: string): Blob => {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return new Blob([bytes], { type: mimeType });
  };

  // Initialize preview data
  useEffect(() => {
    const initializePreview = async () => {
      setLoading(true);
      setError(null);
      
      try {
        let finalSegments: ScriptSegment[];
        
        // Use provided scriptSegments or analyze script
        if (scriptSegments && scriptSegments.length > 0) {
          finalSegments = scriptSegments;
        } else {
          // Fallback: analyze script
          const { data, error: analyzeError } = await supabase.functions.invoke('analyze-script-for-video', {
            body: { 
              scriptText: script,
              imageCount: Math.max(mediaUrls.length, 1)
            }
          });
          
          if (analyzeError) throw new Error('Script-Analyse fehlgeschlagen');
          finalSegments = data.segments || [];
        }
        
        setSegments(finalSegments);
        const totalDuration = finalSegments.reduce((sum, seg) => Math.max(sum, seg.startTime + seg.duration), 0);
        setDuration(totalDuration);
        
        // Generate audio for each segment
        const audioPromises = finalSegments.map(async (segment) => {
          const { data, error: voiceError } = await supabase.functions.invoke('preview-voice', {
            body: { 
              text: segment.text,
              voiceId: segment.voiceSettings?.voiceId || voiceStyle,
              speed: segment.voiceSettings?.speed || voiceSpeed
            }
          });
          
          if (voiceError) throw new Error(`Audio-Generierung fehlgeschlagen: ${segment.id}`);
          
          const audioBlob = base64ToBlob(data.audioContent, 'audio/mpeg');
          const audioUrl = URL.createObjectURL(audioBlob);
          
          return {
            segmentId: segment.id,
            audioBlob,
            audioUrl,
            startTime: segment.startTime,
            duration: segment.duration
          };
        });
        
        const audios = await Promise.all(audioPromises);
        setSegmentAudios(audios);
        setLoading(false);
      } catch (err) {
        console.error('Preview initialization error:', err);
        setError(err instanceof Error ? err.message : 'Fehler beim Laden der Vorschau');
        setLoading(false);
      }
    };
    
    initializePreview();
  }, [script, scriptSegments, mediaUrls, voiceStyle, voiceSpeed]);

  // Current segment based on playback time
  const currentSegmentIndex = segments.findIndex((seg, index) => {
    const segmentEnd = seg.startTime + seg.duration;
    return currentTime >= seg.startTime && currentTime < segmentEnd;
  });

  const currentSegment = segments[currentSegmentIndex] || segments[0];

  // Reaktive Berechnung der aktuellen Media URL
  const currentMediaUrl = useMemo(() => {
    if (mediaUrls.length === 0) return null;
    
    // Priority: Segment has specific imageIndex
    if (currentSegment?.imageIndex !== undefined && mediaUrls[currentSegment.imageIndex]) {
      return mediaUrls[currentSegment.imageIndex];
    }
    
    // Time-based distribution across ENTIRE duration for all images
    const progressRatio = duration > 0 ? currentTime / duration : 0;
    const targetIndex = Math.min(
      Math.floor(progressRatio * mediaUrls.length),
      mediaUrls.length - 1
    );
    
    return mediaUrls[targetIndex] || mediaUrls[0] || null;
  }, [currentTime, duration, currentSegment, mediaUrls]);

  // Pre-load next image for smooth transitions
  const nextMediaUrl = useMemo(() => {
    if (mediaUrls.length <= 1) return null;
    const progressRatio = duration > 0 ? currentTime / duration : 0;
    const nextIndex = Math.min(
      Math.floor(progressRatio * mediaUrls.length) + 1,
      mediaUrls.length - 1
    );
    return mediaUrls[nextIndex];
  }, [currentTime, duration, mediaUrls]);

  // Render word-by-word subtitles with tolerance window
  const getCurrentSubtitleText = (): string => {
    if (!currentSegment || !subtitles.enabled) return '';
    
    const relativeTime = currentTime - currentSegment.startTime;
    const wordTimings = currentSegment.subtitleSettings?.wordTiming;
    
    if (wordTimings && wordTimings.length > 0) {
      const TOLERANCE = 0.05; // 50ms tolerance for sync accuracy
      
      const visibleWords = wordTimings
        .filter(wt => {
          const start = wt.start - TOLERANCE;
          const end = wt.start + wt.duration + TOLERANCE;
          return relativeTime >= start && relativeTime < end;
        })
        .map(wt => wt.word);
      
      return visibleWords.join(' ');
    }
    
    return currentSegment.text;
  };

  // Update time during playback
  const updateTime = () => {
    if (!isPlayingRef.current) return;
    
    const elapsed = (performance.now() - playbackStartTimeRef.current) / 1000;
    const newTime = Math.min(elapsed, duration);
    setCurrentTime(newTime);
    
    // Check if we need to start a new segment's audio
    const targetSegmentAudio = segmentAudios.find(
      sa => newTime >= sa.startTime && newTime < sa.startTime + sa.duration
    );
    
    if (targetSegmentAudio && targetSegmentAudio !== currentPlayingSegment) {
      // Stop current audio
      if (currentPlayingSegment) {
        const currentAudio = audioRefs.current.get(currentPlayingSegment.segmentId);
        if (currentAudio) {
          currentAudio.pause();
          currentAudio.currentTime = 0;
        }
      }
      
      // Start new audio
      let audio = audioRefs.current.get(targetSegmentAudio.segmentId);
      if (!audio) {
        audio = new Audio(targetSegmentAudio.audioUrl);
        audioRefs.current.set(targetSegmentAudio.segmentId, audio);
      }
      
      const offsetInSegment = newTime - targetSegmentAudio.startTime;
      audio.currentTime = offsetInSegment;
      audio.play().catch(err => console.error('Audio playback error:', err));
      setCurrentPlayingSegment(targetSegmentAudio);
    }
    
    if (newTime >= duration) {
      handlePause();
      return;
    }
    
    animationFrameRef.current = requestAnimationFrame(updateTime);
  };

  // Play handler
  const handlePlay = () => {
    setIsPlaying(true);
    isPlayingRef.current = true;
    playbackStartTimeRef.current = performance.now() - (currentTime * 1000);
    animationFrameRef.current = requestAnimationFrame(updateTime);
  };

  // Pause handler
  const handlePause = () => {
    setIsPlaying(false);
    isPlayingRef.current = false;
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    
    // Pause all audios
    audioRefs.current.forEach(audio => {
      audio.pause();
    });
  };

  // Restart handler
  const handleRestart = () => {
    handlePause();
    setCurrentTime(0);
    setCurrentPlayingSegment(null);
    audioRefs.current.forEach(audio => {
      audio.currentTime = 0;
    });
  };

  // Build filter style
  const getFilterStyle = () => {
    return {
      filter: `
        brightness(${filters.brightness}%)
        contrast(${filters.contrast}%)
        saturate(${filters.saturation}%)
        grayscale(${filters.grayscale}%)
        sepia(${filters.sepia}%)
        hue-rotate(${filters.hueRotate}deg)
      `.trim()
    };
  };

  
  const subtitleText = getCurrentSubtitleText();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96 bg-muted rounded-lg">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
          <div className="text-sm text-muted-foreground">
            Generiere Vorschau...
            <br />
            <span className="text-xs">Audio wird für {segments.length || '...'} Segmente erstellt</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Fehler</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {/* Info Alert */}
      {mediaUrls.length === 0 && (
        <Alert className="border-yellow-500/50 bg-yellow-500/10">
          <Info className="h-4 w-4 text-yellow-600" />
          <AlertTitle className="text-yellow-600">Text-only Vorschau</AlertTitle>
          <AlertDescription className="text-yellow-600/90">
            Keine Medien vorhanden - Diese Vorschau zeigt nur Text, Audio und Untertitel. Füge Bilder oder Videos hinzu für eine vollständige Vorschau.
          </AlertDescription>
        </Alert>
      )}

      {segments.length > 0 && segmentAudios.length > 0 && (
        <Alert className="border-primary/50 bg-primary/5">
          <Info className="h-4 w-4 text-primary" />
          <AlertTitle className="text-primary">Segment-basierte Vorschau</AlertTitle>
          <AlertDescription className="text-primary/90">
            {segmentAudios.length} Audio-Segmente • {currentSegment?.subtitleSettings?.wordTiming?.length || 0} Wörter mit präzisem Timing
          </AlertDescription>
        </Alert>
      )}

      {/* Video Preview Container */}
      <div className="relative bg-black rounded-lg overflow-hidden aspect-video shadow-2xl">
        {/* Vignette Overlay */}
        <div 
          className="absolute inset-0 pointer-events-none z-10"
          style={{
            background: 'radial-gradient(circle at center, transparent 40%, rgba(0,0,0,0.4) 100%)'
          }}
        />
        
        {currentMediaUrl ? (
          <>
            <img
              key={`media-${Math.floor(currentTime * 10)}`}
              src={currentMediaUrl}
              alt="Preview"
              className="w-full h-full object-contain transition-all duration-500 ease-in-out"
              style={{
                ...getFilterStyle(),
                animation: 'kenBurns 10s infinite alternate'
              }}
            />
            
            {/* Pre-load next image */}
            {nextMediaUrl && (
              <link rel="preload" as="image" href={nextMediaUrl} />
            )}
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center">
            <div className="text-center space-y-4 p-8 max-w-2xl">
              <div className="text-2xl font-bold text-white animate-fade-in">
                {subtitleText || currentSegment?.text || 'Text wird geladen...'}
              </div>
              <div className="text-sm text-white/50">
                📸 Füge Medien hinzu für vollständige Vorschau
              </div>
            </div>
          </div>
        )}

        {/* Subtitles */}
        {subtitles.enabled && subtitleText && (
          <div 
            className="absolute inset-x-0 px-6 py-4 text-center transition-all duration-150 z-20"
            style={{
              [subtitles.style.position === 'top' ? 'top' : 'bottom']: '5rem',
            }}
          >
            <div 
              className="inline-block px-6 py-3 rounded-lg shadow-2xl backdrop-blur-sm"
              style={{
                fontFamily: subtitles.style.font || 'Inter',
                fontSize: `${subtitles.style.fontSize || 28}px`,
                fontWeight: 600,
                color: subtitles.style.color || '#FFFFFF',
                backgroundColor: subtitles.style.backgroundColor 
                  ? `${subtitles.style.backgroundColor}${Math.round((subtitles.style.backgroundOpacity || 0.8) * 255).toString(16).padStart(2, '0')}`
                  : 'rgba(0, 0, 0, 0.8)',
                textShadow: `
                  0 2px 4px rgba(0,0,0,0.8),
                  0 0 8px rgba(0,0,0,0.6),
                  2px 2px 0 ${subtitles.style.outlineColor || '#000000'},
                  -2px -2px 0 ${subtitles.style.outlineColor || '#000000'},
                  2px -2px 0 ${subtitles.style.outlineColor || '#000000'},
                  -2px 2px 0 ${subtitles.style.outlineColor || '#000000'}
                `,
                animation: 'subtitleFadeIn 0.2s ease-out'
              }}
            >
              {subtitleText}
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/90 via-black/50 to-transparent">
          {/* Progress Bar with Hover */}
          <div className="group mb-4">
            <div className="bg-white/20 rounded-full h-1.5 backdrop-blur-sm group-hover:h-2 transition-all cursor-pointer">
              <div 
                className="bg-primary h-full rounded-full transition-all shadow-lg"
                style={{ width: `${(currentTime / duration) * 100}%` }}
              />
            </div>
          </div>
          
          {/* Control Buttons - larger & more visible */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                size="lg"
                variant="secondary"
                onClick={isPlaying ? handlePause : handlePlay}
                disabled={loading || segmentAudios.length === 0}
                className="bg-white/90 hover:bg-white backdrop-blur-sm h-12 w-12 rounded-full p-0 shadow-xl"
              >
                {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 ml-0.5" />}
              </Button>
              <Button
                size="lg"
                variant="secondary"
                onClick={handleRestart}
                className="bg-white/80 hover:bg-white/90 backdrop-blur-sm h-10 w-10 rounded-full p-0 shadow-lg"
              >
                <RotateCcw className="h-5 w-5" />
              </Button>
            </div>
            
            {/* Info Display */}
            <div className="text-white space-y-1 text-right">
              <div className="text-sm font-medium">
                {currentTime.toFixed(1)}s / {duration.toFixed(1)}s
              </div>
              <div className="text-xs text-white/70">
                Segment {currentSegmentIndex + 1}/{segments.length}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Segment Progress */}
      <div className="text-sm text-muted-foreground space-y-1">
        <div>
          Segment {currentSegmentIndex + 1} von {segments.length}
        </div>
        {currentSegment && (
          <div className="text-xs">
            "{currentSegment.text.slice(0, 80)}
{currentSegment.text.length > 80 ? '...' : ''}"
          </div>
        )}
        {currentSegment?.subtitleSettings?.wordTiming && (
          <div className="text-xs text-primary">
            ✨ Word-by-word Timing aktiv ({currentSegment.subtitleSettings.wordTiming.length} Wörter)
          </div>
        )}
      </div>
    </div>
  );
};
