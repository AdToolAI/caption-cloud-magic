import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, Volume2, VolumeX, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import WaveSurfer from 'wavesurfer.js';

interface AudioBeforeAfterComparisonProps {
  originalUrl: string;
  enhancedUrl: string;
  onClose?: () => void;
}

type PlaybackMode = 'original' | 'enhanced' | 'both';

export function AudioBeforeAfterComparison({ 
  originalUrl, 
  enhancedUrl,
  onClose 
}: AudioBeforeAfterComparisonProps) {
  const originalWaveformRef = useRef<HTMLDivElement>(null);
  const enhancedWaveformRef = useRef<HTMLDivElement>(null);
  const originalWsRef = useRef<WaveSurfer | null>(null);
  const enhancedWsRef = useRef<WaveSurfer | null>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>('enhanced');
  const [isLoading, setIsLoading] = useState(true);

  // Initialize WaveSurfer instances
  useEffect(() => {
    if (!originalWaveformRef.current || !enhancedWaveformRef.current) return;

    let loadedCount = 0;
    const checkLoaded = () => {
      loadedCount++;
      if (loadedCount >= 2) setIsLoading(false);
    };

    // Original waveform (gray)
    originalWsRef.current = WaveSurfer.create({
      container: originalWaveformRef.current,
      waveColor: 'rgba(156, 163, 175, 0.5)',
      progressColor: 'rgba(156, 163, 175, 0.8)',
      cursorColor: 'rgba(156, 163, 175, 0.9)',
      cursorWidth: 2,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      height: 80,
      normalize: true,
    });

    // Enhanced waveform (gold/cyan gradient effect via CSS)
    enhancedWsRef.current = WaveSurfer.create({
      container: enhancedWaveformRef.current,
      waveColor: 'rgba(245, 199, 106, 0.5)',
      progressColor: 'rgba(245, 199, 106, 0.9)',
      cursorColor: 'hsl(var(--primary))',
      cursorWidth: 2,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      height: 80,
      normalize: true,
    });

    // Load audio
    originalWsRef.current.load(originalUrl);
    enhancedWsRef.current.load(enhancedUrl);

    // Event handlers
    originalWsRef.current.on('ready', () => {
      setDuration(originalWsRef.current?.getDuration() || 0);
      checkLoaded();
    });
    
    enhancedWsRef.current.on('ready', checkLoaded);

    // Error handlers for debugging
    originalWsRef.current.on('error', (err) => {
      console.error('Original WaveSurfer error:', err);
      setIsLoading(false);
    });

    enhancedWsRef.current.on('error', (err) => {
      console.error('Enhanced WaveSurfer error:', err);
      setIsLoading(false);
    });

    originalWsRef.current.on('audioprocess', (time) => {
      setCurrentTime(time);
      // Sync enhanced waveform
      if (enhancedWsRef.current && Math.abs(enhancedWsRef.current.getCurrentTime() - time) > 0.1) {
        enhancedWsRef.current.seekTo(time / (enhancedWsRef.current.getDuration() || 1));
      }
    });

    originalWsRef.current.on('finish', () => {
      setIsPlaying(false);
      setCurrentTime(0);
    });

    originalWsRef.current.on('seeking', (progress) => {
      const time = progress * (originalWsRef.current?.getDuration() || 0);
      setCurrentTime(time);
      if (enhancedWsRef.current) {
        enhancedWsRef.current.seekTo(progress);
      }
    });

    enhancedWsRef.current.on('seeking', (progress) => {
      const time = progress * (enhancedWsRef.current?.getDuration() || 0);
      setCurrentTime(time);
      if (originalWsRef.current) {
        originalWsRef.current.seekTo(progress);
      }
    });

    return () => {
      originalWsRef.current?.destroy();
      enhancedWsRef.current?.destroy();
    };
  }, [originalUrl, enhancedUrl]);

  // Update volume based on playback mode
  useEffect(() => {
    if (!originalWsRef.current || !enhancedWsRef.current) return;

    switch (playbackMode) {
      case 'original':
        originalWsRef.current.setVolume(1);
        enhancedWsRef.current.setVolume(0);
        break;
      case 'enhanced':
        originalWsRef.current.setVolume(0);
        enhancedWsRef.current.setVolume(1);
        break;
      case 'both':
        // Split: original slightly left, enhanced slightly right
        originalWsRef.current.setVolume(0.7);
        enhancedWsRef.current.setVolume(0.7);
        break;
    }
  }, [playbackMode]);

  const togglePlayPause = useCallback(async () => {
    if (!originalWsRef.current || !enhancedWsRef.current) return;

    if (isPlaying) {
      originalWsRef.current.pause();
      enhancedWsRef.current.pause();
      setIsPlaying(false);
    } else {
      try {
        await Promise.all([
          originalWsRef.current.play(),
          enhancedWsRef.current.play()
        ]);
        setIsPlaying(true);
      } catch (error) {
        console.error('Playback error:', error);
        // Retry with a small delay
        setTimeout(async () => {
          try {
            await originalWsRef.current?.play();
            await enhancedWsRef.current?.play();
            setIsPlaying(true);
          } catch (retryError) {
            console.error('Retry playback failed:', retryError);
          }
        }, 100);
      }
    }
  }, [isPlaying]);

  const handleSeek = useCallback((value: number[]) => {
    const progress = value[0] / 100;
    originalWsRef.current?.seekTo(progress);
    enhancedWsRef.current?.seekTo(progress);
  }, []);

  const resetToStart = useCallback(() => {
    originalWsRef.current?.seekTo(0);
    enhancedWsRef.current?.seekTo(0);
    setCurrentTime(0);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      switch (e.key.toLowerCase()) {
        case ' ':
          e.preventDefault();
          togglePlayPause();
          break;
        case 'a':
          setPlaybackMode('original');
          break;
        case 'b':
          setPlaybackMode('enhanced');
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlayPause]);

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const modeButtons: { id: PlaybackMode; label: string; shortcut: string }[] = [
    { id: 'original', label: 'Original', shortcut: 'A' },
    { id: 'enhanced', label: 'Optimiert', shortcut: 'B' },
    { id: 'both', label: 'Beide', shortcut: '' }
  ];

  return (
    <Card className="relative backdrop-blur-xl bg-card/60 border-border/50 p-6 overflow-hidden">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-cyan-500/20 flex items-center justify-center">
              <Volume2 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold">Vorher/Nachher Vergleich</h3>
              <p className="text-xs text-muted-foreground">Drücke A (Original) oder B (Optimiert) zum schnellen Wechseln</p>
            </div>
          </div>
        </div>

        {/* Waveforms */}
        <div className="space-y-4">
          {/* Original Waveform */}
          <motion.div
            animate={{ 
              opacity: playbackMode === 'enhanced' ? 0.5 : 1,
              scale: playbackMode === 'original' ? 1.01 : 1
            }}
            className={`relative p-4 rounded-xl border transition-all ${
              playbackMode === 'original' 
                ? 'bg-muted/30 border-muted-foreground/30 shadow-[0_0_20px_rgba(156,163,175,0.2)]' 
                : 'bg-muted/10 border-border/30'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-2 h-2 rounded-full ${playbackMode === 'original' ? 'bg-muted-foreground animate-pulse' : 'bg-muted-foreground/50'}`} />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Original</span>
              {playbackMode === 'original' && (
                <motion.span 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="text-xs text-muted-foreground ml-auto"
                >
                  🔊 Aktiv
                </motion.span>
              )}
            </div>
            <div 
              ref={originalWaveformRef} 
              className="w-full cursor-pointer"
              style={{ minHeight: 80 }}
            />
          </motion.div>

          {/* Sync indicator */}
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
            <span className="px-2">⟷ Synchronisiert</span>
            <div className="h-px flex-1 bg-gradient-to-l from-transparent via-border to-transparent" />
          </div>

          {/* Enhanced Waveform */}
          <motion.div
            animate={{ 
              opacity: playbackMode === 'original' ? 0.5 : 1,
              scale: playbackMode === 'enhanced' ? 1.01 : 1
            }}
            className={`relative p-4 rounded-xl border transition-all ${
              playbackMode === 'enhanced' 
                ? 'bg-primary/10 border-primary/30 shadow-[0_0_20px_rgba(245,199,106,0.2)]' 
                : 'bg-muted/10 border-border/30'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-2 h-2 rounded-full ${playbackMode === 'enhanced' ? 'bg-primary animate-pulse' : 'bg-primary/50'}`} />
              <span className="text-xs font-medium text-primary uppercase tracking-wider">Optimiert</span>
              {playbackMode === 'enhanced' && (
                <motion.span 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="text-xs text-primary ml-auto"
                >
                  🔊 Aktiv
                </motion.span>
              )}
            </div>
            <div 
              ref={enhancedWaveformRef} 
              className="w-full cursor-pointer"
              style={{ minHeight: 80 }}
            />
          </motion.div>
        </div>

        {/* Controls */}
        <div className="space-y-4">
          {/* Mode Buttons */}
          <div className="flex gap-2">
            {modeButtons.map((mode) => (
              <Button
                key={mode.id}
                variant={playbackMode === mode.id ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPlaybackMode(mode.id)}
                className={`flex-1 relative overflow-hidden ${
                  playbackMode === mode.id 
                    ? mode.id === 'original'
                      ? 'bg-muted-foreground hover:bg-muted-foreground/90'
                      : 'bg-gradient-to-r from-primary to-amber-500 border-0'
                    : 'border-border/50 hover:border-primary/40'
                }`}
              >
                <Play className="w-3 h-3 mr-1" />
                {mode.label}
                {mode.shortcut && (
                  <span className="ml-1 text-[10px] opacity-60">({mode.shortcut})</span>
                )}
                {playbackMode === mode.id && (
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-shimmer" />
                )}
              </Button>
            ))}
          </div>

          {/* Playback Controls */}
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={resetToStart}
              className="w-10 h-10"
            >
              <RotateCcw className="w-4 h-4" />
            </Button>
            
            <Button
              variant="ghost"
              size="icon"
              onClick={togglePlayPause}
              disabled={isLoading}
              className="w-14 h-14 rounded-full bg-gradient-to-br from-primary/20 to-cyan-500/20 hover:from-primary/30 hover:to-cyan-500/30 border border-primary/30"
            >
              {isPlaying ? (
                <Pause className="w-6 h-6 text-primary" />
              ) : (
                <Play className="w-6 h-6 text-primary ml-0.5" />
              )}
            </Button>

            <div className="flex-1 flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-10 text-right">
                {formatTime(currentTime)}
              </span>
              <Slider
                value={[duration > 0 ? (currentTime / duration) * 100 : 0]}
                onValueChange={handleSeek}
                max={100}
                step={0.1}
                className="flex-1"
              />
              <span className="text-xs text-muted-foreground w-10">
                {formatTime(duration)}
              </span>
            </div>
          </div>
        </div>

        {/* Loading overlay */}
        <AnimatePresence>
          {isLoading && (
            <motion.div
              initial={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-card/80 backdrop-blur-sm flex items-center justify-center rounded-xl"
            >
              <div className="flex flex-col items-center gap-2">
                <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                <span className="text-sm text-muted-foreground">Waveforms werden geladen...</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Card>
  );
}
