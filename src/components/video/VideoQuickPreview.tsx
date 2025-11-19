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

  // Cleanup function for audio URLs
  useEffect(() => {
    return () => {
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
    
    // Wenn Segment einen spezifischen Bild-Index hat, verwende diesen
    if (currentSegment?.imageIndex !== undefined && mediaUrls[currentSegment.imageIndex]) {
      return mediaUrls[currentSegment.imageIndex];
    }
    
    // Intelligenter Fallback: Verwende Segment-Progress für Bild-Index
    const progressRatio = segments.length > 0 && currentSegmentIndex >= 0
      ? currentSegmentIndex / segments.length 
      : 0;
    const targetIndex = Math.floor(progressRatio * mediaUrls.length);
    return mediaUrls[targetIndex] || mediaUrls[0] || null;
  }, [currentTime, currentSegmentIndex, currentSegment, mediaUrls, segments.length]);

  // Render word-by-word subtitles
  const getCurrentSubtitleText = (): string => {
    if (!currentSegment || !subtitles.enabled) return '';
    
    const relativeTime = currentTime - currentSegment.startTime;
    const wordTimings = currentSegment.subtitleSettings?.wordTiming;
    
    if (wordTimings && wordTimings.length > 0) {
      // Show only words that should be visible at current time
      const visibleWords = wordTimings
        .filter(wt => relativeTime >= wt.start && relativeTime < wt.start + wt.duration)
        .map(wt => wt.word);
      
      return visibleWords.join(' ');
    }
    
    // Fallback to full text
    return currentSegment.text;
  };

  // Update time during playback
  const updateTime = () => {
    if (isPlaying) {
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
    }
  };

  // Play handler
  const handlePlay = () => {
    setIsPlaying(true);
    playbackStartTimeRef.current = performance.now() - (currentTime * 1000);
    animationFrameRef.current = requestAnimationFrame(updateTime);
  };

  // Pause handler
  const handlePause = () => {
    setIsPlaying(false);
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
      <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
        {/* Background Media or Fallback */}
            {currentMediaUrl ? (
              <img
                key={`media-${currentSegmentIndex}-${currentMediaUrl}`}
                src={currentMediaUrl}
                alt="Preview"
                className="w-full h-full object-cover transition-opacity duration-300"
                style={getFilterStyle()}
              />
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

        {/* Word-by-Word Subtitles Overlay */}
        {subtitles.enabled && subtitleText && (
          <div 
            className="absolute inset-x-0 px-4 py-3 text-center transition-all duration-200"
            style={{
              [subtitles.style.position === 'top' ? 'top' : 'bottom']: '1rem',
              fontFamily: subtitles.style.font || 'Inter',
              fontSize: `${subtitles.style.fontSize || 24}px`,
              color: subtitles.style.color || '#FFFFFF',
              textShadow: subtitles.style.outline 
                ? `2px 2px 4px ${subtitles.style.outlineColor || '#000000'}, -2px -2px 4px ${subtitles.style.outlineColor || '#000000'}`
                : 'none',
              animation: subtitles.style.animation === 'fade' 
                ? 'fadeIn 0.2s ease-in-out' 
                : subtitles.style.animation === 'slide' 
                  ? 'slideUp 0.2s ease-out' 
                  : 'none'
            }}
          >
            <div 
              className="inline-block px-4 py-2 rounded transition-all"
              style={{
                backgroundColor: subtitles.style.backgroundColor 
                  ? `${subtitles.style.backgroundColor}${Math.round((subtitles.style.backgroundOpacity || 0.7) * 255).toString(16).padStart(2, '0')}`
                  : 'transparent'
              }}
            >
              {subtitleText}
            </div>
          </div>
        )}

        {/* Playback Controls Overlay */}
        <div className="absolute bottom-4 left-4 right-4 space-y-2">
          {/* Progress Bar */}
          <div className="bg-black/50 rounded-full h-2 backdrop-blur-sm">
            <div 
              className="bg-primary h-full rounded-full transition-all"
              style={{ width: `${(currentTime / duration) * 100}%` }}
            />
          </div>
          
          {/* Control Buttons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={isPlaying ? handlePause : handlePlay}
                className="bg-black/70 hover:bg-black/90 backdrop-blur-sm"
              >
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={handleRestart}
                className="bg-black/70 hover:bg-black/90 backdrop-blur-sm"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="text-xs text-white bg-black/70 px-3 py-1 rounded-full backdrop-blur-sm font-mono">
              {currentTime.toFixed(1)}s / {duration.toFixed(1)}s
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
