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
  const currentPlayingSegmentRef = useRef<SegmentAudio | null>(null);
  
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  const animationFrameRef = useRef<number>();
  const playbackStartTimeRef = useRef<number>(0);
  const isPlayingRef = useRef<boolean>(false);

  // Cleanup function for audio URLs
  useEffect(() => {
    return () => {
      console.log('[Cleanup] Cleaning up audio resources');
      isPlayingRef.current = false;
      currentPlayingSegmentRef.current = null;
      
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
    
    // Wenn wir Word-Timing haben, NUR diese nutzen
    if (wordTimings && wordTimings.length > 0) {
      const TOLERANCE = 0.05; // 50ms tolerance for sync accuracy
      const SUBTITLE_LINGER_TIME = 1.0; // 1 Sekunde länger anzeigen
      
      // Finde das letzte Wort
      const lastWord = wordTimings[wordTimings.length - 1];
      const lastWordEnd = lastWord.start + lastWord.duration;
      
      const visibleWords = wordTimings
        .filter(wt => {
          const start = wt.start - TOLERANCE;
          const end = wt.start + wt.duration + TOLERANCE;
          return relativeTime >= start && relativeTime < end;
        })
        .map(wt => wt.word);
      
      // Wenn Wörter sichtbar sind, zeige sie
      if (visibleWords.length > 0) {
        return visibleWords.join(' ');
      }
      
      // Wenn keine Wörter mehr sichtbar, aber wir sind innerhalb der Linger-Time
      // → zeige kompletten Text noch 1 Sekunde
      if (relativeTime >= lastWordEnd && relativeTime < lastWordEnd + SUBTITLE_LINGER_TIME) {
        return wordTimings.map(wt => wt.word).join(' ');
      }
      
      return ''; // Außerhalb aller Zeitfenster
    }
    
    // Fallback ohne Word-Timing: Prüfe ob wir im Segment sind (+ 1 Sekunde)
    const SUBTITLE_LINGER_TIME = 1.0;
    if (relativeTime < 0 || relativeTime > currentSegment.duration + SUBTITLE_LINGER_TIME) {
      return ''; // Außerhalb des Segments (mit Puffer)
    }
    
    // Im Segment und kein Word-Timing → zeige ganzen Text
    return currentSegment.text;
  };

  // Update time during playback
  const updateTime = () => {
    if (!isPlayingRef.current) return;
    
    const elapsed = (performance.now() - playbackStartTimeRef.current) / 1000;
    const newTime = Math.min(elapsed, duration);
    setCurrentTime(newTime);
    
    // Find which segment should be playing
    const targetSegmentAudio = segmentAudios.find(
      sa => newTime >= sa.startTime && newTime <= sa.startTime + sa.duration
    );

    // If no segment found but we have a playing one, keep it playing
    if (!targetSegmentAudio && currentPlayingSegmentRef.current) {
      const stillPlaying = audioRefs.current.get(currentPlayingSegmentRef.current.segmentId);
      
      // Check if the current audio is still playing and not finished
      if (stillPlaying && !stillPlaying.paused && !stillPlaying.ended) {
        console.log('[Audio] No segment found but current audio still playing, continuing...');
        // Continue with current audio - don't stop it
        animationFrameRef.current = requestAnimationFrame(updateTime);
        return;
      }
    }

    // Only change audio if we're in a different segment
    if (targetSegmentAudio && targetSegmentAudio.segmentId !== currentPlayingSegmentRef.current?.segmentId) {
      console.log('[Audio] Switching to segment:', targetSegmentAudio.segmentId, 'at time:', newTime);
      
      // Stop previous audio
      if (currentPlayingSegmentRef.current) {
        const prevAudio = audioRefs.current.get(currentPlayingSegmentRef.current.segmentId);
        if (prevAudio && !prevAudio.paused) {
          console.log('[Audio] Stopping previous segment:', currentPlayingSegmentRef.current.segmentId);
          prevAudio.pause();
        }
      }
      
      // Get or create new audio element
      let audio = audioRefs.current.get(targetSegmentAudio.segmentId);
      if (!audio) {
        console.log('[Audio] Creating new audio element for:', targetSegmentAudio.segmentId);
        audio = new Audio(targetSegmentAudio.audioUrl);
        audio.preload = 'auto';
        
        // Add event listener for when audio ends
        audio.addEventListener('ended', () => {
          console.log('[Audio] Audio ended for segment:', targetSegmentAudio.segmentId);
        });
        
        audioRefs.current.set(targetSegmentAudio.segmentId, audio);
      }
      
      // Set offset ONLY if needed and audio is not already playing at correct position
      const offsetInSegment = newTime - targetSegmentAudio.startTime;
      if (Math.abs(audio.currentTime - offsetInSegment) > 0.1) {
        console.log('[Audio] Setting offset:', offsetInSegment);
        audio.currentTime = offsetInSegment;
      }
      
      // Start playback
      audio.play().catch(err => {
        console.error('[Audio] Playback error:', err);
      });
      
      // Update ref IMMEDIATELY (not state!)
      currentPlayingSegmentRef.current = targetSegmentAudio;
      setCurrentPlayingSegment(targetSegmentAudio); // Only for UI updates
    }
    
    // Only stop if we've passed the duration AND no audio is playing
    if (newTime >= duration) {
      const hasPlayingAudio = Array.from(audioRefs.current.values()).some(
        audio => !audio.paused && !audio.ended
      );
      
      if (!hasPlayingAudio) {
        console.log('[Playback] Reached end and no audio playing, stopping');
        handlePause();
        return;
      } else {
        console.log('[Playback] Past duration but audio still playing, continuing...');
      }
    }
    
    animationFrameRef.current = requestAnimationFrame(updateTime);
  };

  // Play handler
  const handlePlay = () => {
    console.log('[Playback] Starting at time:', currentTime);
    setIsPlaying(true);
    isPlayingRef.current = true;
    playbackStartTimeRef.current = performance.now() - (currentTime * 1000);
    
    // Find and start the correct audio immediately
    const targetSegmentAudio = segmentAudios.find(
      sa => currentTime >= sa.startTime && currentTime < sa.startTime + sa.duration
    );
    
    if (targetSegmentAudio) {
      let audio = audioRefs.current.get(targetSegmentAudio.segmentId);
      if (!audio) {
        audio = new Audio(targetSegmentAudio.audioUrl);
        audio.preload = 'auto';
        audioRefs.current.set(targetSegmentAudio.segmentId, audio);
      }
      
      const offsetInSegment = currentTime - targetSegmentAudio.startTime;
      audio.currentTime = offsetInSegment;
      audio.play().catch(err => console.error('[Audio] Initial play error:', err));
      
      currentPlayingSegmentRef.current = targetSegmentAudio;
      setCurrentPlayingSegment(targetSegmentAudio);
    }
    
    animationFrameRef.current = requestAnimationFrame(updateTime);
  };

  // Pause handler
  const handlePause = () => {
    console.log('[Playback] Pausing at time:', currentTime);
    setIsPlaying(false);
    isPlayingRef.current = false;
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    
    // Pause current audio
    if (currentPlayingSegmentRef.current) {
      const audio = audioRefs.current.get(currentPlayingSegmentRef.current.segmentId);
      if (audio && !audio.paused) {
        audio.pause();
      }
    }
  };

  // Restart handler
  const handleRestart = () => {
    console.log('[Playback] Restarting');
    handlePause();
    setCurrentTime(0);
    currentPlayingSegmentRef.current = null;
    setCurrentPlayingSegment(null);
    
    // Reset all audio elements
    audioRefs.current.forEach(audio => {
      audio.currentTime = 0;
      audio.pause();
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
                textShadow: subtitles.style.outline ? `
                  0 2px 4px rgba(0,0,0,0.8),
                  0 0 8px rgba(0,0,0,0.6),
                  2px 2px 0 ${subtitles.style.outlineColor || '#000000'},
                  -2px -2px 0 ${subtitles.style.outlineColor || '#000000'},
                  2px -2px 0 ${subtitles.style.outlineColor || '#000000'},
                  -2px 2px 0 ${subtitles.style.outlineColor || '#000000'}
                ` : 'none',
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
