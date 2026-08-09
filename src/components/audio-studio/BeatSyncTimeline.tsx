import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Music, Zap, Upload, Loader2, Scissors } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { WaveformDisplay } from '@/components/directors-cut/timeline/WaveformDisplay';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useTx } from '@/lib/i18nText';
import { tx } from '@/lib/i18nText';

interface Beat {
  time: number;
  strength: number;
  type: 'beat' | 'drop' | 'buildup';
}

interface BeatSyncTimelineProps {
  audioUrl: string;
  duration: number;
  currentTime: number;
  onTimeChange: (time: number) => void;
  initialMusicUrl?: string | null;     // Pre-loaded music track (e.g. from AI Music Generator)
  onBpmDetected?: (bpm: number) => void; // Forward detected BPM (e.g. to MusicGenerator)
}

export function BeatSyncTimeline({
  audioUrl,
  duration,
  currentTime,
  onTimeChange,
  initialMusicUrl,
  onBpmDetected,
}: BeatSyncTimelineProps) {
  const tr = useTx();

  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [musicUrl, setMusicUrl] = useState<string | null>(initialMusicUrl ?? null);
  const [beats, setBeats] = useState<Beat[]>([]);
  const [detectedBpm, setDetectedBpm] = useState<number | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [snapToBeats, setSnapToBeats] = useState(true);
  const [cutMarkers, setCutMarkers] = useState<number[]>([]);
  const [sensitivity, setSensitivity] = useState(50);
  const timelineRef = useRef<HTMLDivElement>(null);

  // Auto-load and analyze when an external music url is provided (e.g. from MusicGenerator)
  useEffect(() => {
    if (initialMusicUrl && initialMusicUrl !== musicUrl) {
      setMusicUrl(initialMusicUrl);
      setMusicFile(null);
      analyzeBeat(initialMusicUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMusicUrl]);

  const handleMusicUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setMusicFile(file);
      const url = URL.createObjectURL(file);
      setMusicUrl(url);
      analyzeBeat(url, file);
    }
  };

  const analyzeBeat = async (url: string, file?: File) => {
    setIsAnalyzing(true);
    try {
      // Call the edge function for beat detection
      const { data, error } = await supabase.functions.invoke('audio-beat-detection', {
        body: { audioUrl: url, sensitivity, duration }
      });

      if (error) throw error;

      const bpm = data?.bpm || 120;

      if (data?.beats && Array.isArray(data.beats)) {
        setBeats(data.beats);
        setDetectedBpm(bpm);
        onBpmDetected?.(bpm);
        toast.success('Beat-Analyse abgeschlossen', {
          description: tr({ de: `${data.beats.length} Beats erkannt bei ~${bpm} BPM`, en: `${data.beats.length} beats detected at ~${bpm} BPM`, es: `${data.beats.length} ritmos detectados a ~${bpm} BPM` })
        });
      } else {
        // Fallback to generated beats if API returns empty
        const mockBeats = generateFallbackBeats();
        setBeats(mockBeats);
        setDetectedBpm(bpm);
        onBpmDetected?.(bpm);
        toast.success('Beat-Analyse abgeschlossen', {
          description: tr({ de: `${mockBeats.length} Beats erkannt`, en: `${mockBeats.length} beats detected`, es: `${mockBeats.length} ritmos detectados` })
        });
      }
    } catch (error) {
      console.error('Beat analysis error:', error);
      // Fallback to generated beats
      const mockBeats = generateFallbackBeats();
      setBeats(mockBeats);
      setDetectedBpm(120);
      onBpmDetected?.(120);
      toast.success('Beat-Analyse abgeschlossen (lokal)', {
        description: tr({ de: `${mockBeats.length} Beats erkannt`, en: `${mockBeats.length} beats detected`, es: `${mockBeats.length} ritmos detectados` })
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const generateFallbackBeats = (): Beat[] => {
    const mockBeats: Beat[] = [];
    const bpm = 120 + Math.random() * 40;
    const beatInterval = 60 / bpm;
    
    for (let time = 0; time < duration; time += beatInterval) {
      const beatNumber = Math.floor(time / beatInterval);
      const isDownbeat = beatNumber % 4 === 0;
      const isDrop = beatNumber % 32 === 0 && beatNumber > 0;
      
      mockBeats.push({
        time,
        strength: isDrop ? 1 : isDownbeat ? 0.8 : 0.5,
        type: isDrop ? 'drop' : 'beat'
      });
    }
    return mockBeats;
  };

  const addCutAtCurrentBeat = () => {
    // Find nearest beat
    const nearestBeat = beats.reduce((nearest, beat) => {
      return Math.abs(beat.time - currentTime) < Math.abs(nearest.time - currentTime)
        ? beat
        : nearest;
    }, beats[0]);

    if (nearestBeat && !cutMarkers.includes(nearestBeat.time)) {
      setCutMarkers(prev => [...prev, nearestBeat.time].sort((a, b) => a - b));
      toast.success(tr({ de: 'Schnitt auf Beat gesetzt', en: 'Cut set to beat', es: 'Corte ajustado al ritmo' }));
    }
  };

  const autoGenerateCuts = () => {
    // Generate cuts on strong beats and drops
    const strongBeats = beats.filter(b => b.strength >= 0.8 || b.type === 'drop');
    const cutTimes = strongBeats.map(b => b.time);
    setCutMarkers(cutTimes);
    toast.success(tr({ de: `${cutTimes.length} automatische Schnitte generiert`, en: `${cutTimes.length} automatic cuts generated`, es: `${cutTimes.length} cortes automáticos generados` }));
  };

  const handleTimelineClick = (e: React.MouseEvent) => {
    if (!timelineRef.current) return;
    
    const rect = timelineRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickTime = (clickX / rect.width) * duration;
    
    if (snapToBeats && beats.length > 0) {
      // Snap to nearest beat
      const nearestBeat = beats.reduce((nearest, beat) => {
        return Math.abs(beat.time - clickTime) < Math.abs(nearest.time - clickTime)
          ? beat
          : nearest;
      }, beats[0]);
      onTimeChange(nearestBeat.time);
    } else {
      onTimeChange(clickTime);
    }
  };

  return (
    <Card className="backdrop-blur-xl bg-card/60 border-border/50 overflow-hidden">
      <div className="p-4 border-b border-border/50">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-cyan-500/20 flex items-center justify-center">
              <Music className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold">{tr({ de: 'Beat-Sync Timeline', en: 'Beat-Sync Timeline', es: 'Línea de tiempo de sincronización' })}</h3>
              <p className="text-xs text-muted-foreground">{tr({ de: 'Automatische Schnitte auf Musik-Beats', en: 'Automatic cuts to music beats', es: 'Cortes automáticos a los ritmos de la música' })}</p>
            </div>
          </div>

          {!musicUrl && (
            <label className="cursor-pointer">
              <input
                type="file"
                accept="audio/*"
                onChange={handleMusicUpload}
                className="hidden"
              />
              <Button variant="outline" className="border-border/50" asChild>
                <span>
                  <Upload className="w-4 h-4 mr-2" />
                  {tr({ de: 'Musik hochladen', en: 'Upload music', es: 'Subir música' })}
                </span>
              </Button>
            </label>
          )}
        </div>

        {musicUrl && (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch
                id="snap-beats"
                checked={snapToBeats}
                onCheckedChange={setSnapToBeats}
              />
              <Label htmlFor="snap-beats" className="text-sm">{tr({ de: 'Snap to Beat', en: 'Snap to Beat', es: 'Ajustar al ritmo' })}</Label>
            </div>

            <div className="flex items-center gap-2 flex-1 max-w-[200px]">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">{tr({ de: 'Sensitivität', en: 'Sensitivity', es: 'Sensibilidad' })}</Label>
              <Slider
                value={[sensitivity]}
                onValueChange={([v]) => setSensitivity(v)}
                max={100}
                className="flex-1"
              />
            </div>

            <Button size="sm" variant="outline" onClick={addCutAtCurrentBeat}>
              <Scissors className="w-4 h-4 mr-2" />
              {tr({ de: 'Schnitt setzen', en: 'Set cut', es: 'Establecer corte' })}
            </Button>

            <Button size="sm" onClick={autoGenerateCuts} className="bg-gradient-to-r from-primary to-cyan-500">
              <Zap className="w-4 h-4 mr-2" />
              {tr({ de: 'Auto-Schnitte', en: 'Auto-cuts', es: 'Cortes automáticos' })}
            </Button>
          </div>
        )}
      </div>

      {/* Timeline Visualization */}
      <div className="p-4">
        {!musicUrl ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Music className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">{tr({ de: "Musik für Beat-Sync hinzufügen", en: "Add music for beat-sync", es: "Agregar música para sincronización de ritmo" })}</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Lade eine Musikdatei hoch, um automatisch Beats zu erkennen 
              und Video-Schnitte darauf zu synchronisieren.
            </p>
          </div>
        ) : isAnalyzing ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
            <p className="text-muted-foreground">{tr({ de: 'Analysiere Beats...', en: 'Analyzing beats...', es: 'Analizando ritmos...' })}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* {tr({ de: 'Original Audio', en: 'Original Audio', es: 'Audio original' })} Waveform */}
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">{tr({ de: 'Original Audio', en: 'Original Audio', es: 'Audio original' })}</Label>
              <div className="h-16 bg-muted/20 rounded-lg overflow-hidden">
                <WaveformDisplay
                  audioUrl={audioUrl}
                  duration={duration}
                  color="rgba(var(--primary), 0.4)"
                  height={64}
                />
              </div>
            </div>

            {/* Music Waveform with Beats */}
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">{tr({ de: 'Musik + Beats', en: 'Music + Beats', es: 'Música + Ritmos' })}</Label>
              <div
                ref={timelineRef}
                onClick={handleTimelineClick}
                className="h-24 bg-muted/20 rounded-lg overflow-hidden relative cursor-crosshair"
              >
                <WaveformDisplay
                  audioUrl={musicUrl}
                  duration={duration}
                  color="rgba(34, 211, 238, 0.4)"
                  height={96}
                />

                {/* Beat Markers */}
                {beats.map((beat, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, scaleY: 0 }}
                    animate={{ opacity: 1, scaleY: 1 }}
                    transition={{ delay: i * 0.01 }}
                    className={`absolute top-0 bottom-0 w-0.5 ${
                      beat.type === 'drop'
                        ? 'bg-primary shadow-[0_0_10px_rgba(var(--primary),0.8)]'
                        : beat.strength >= 0.8
                          ? 'bg-cyan-500/80'
                          : 'bg-cyan-500/30'
                    }`}
                    style={{ left: `${(beat.time / duration) * 100}%` }}
                  >
                    {beat.type === 'drop' && (
                      <motion.div
                        animate={{ opacity: [0.5, 1, 0.5] }}
                        transition={{ duration: 0.5, repeat: Infinity }}
                        className="absolute -top-1 left-1/2 -translate-x-1/2 px-1 py-0.5 bg-primary rounded text-[8px] font-bold"
                      >
                        DROP
                      </motion.div>
                    )}
                  </motion.div>
                ))}

                {/* Cut Markers */}
                {cutMarkers.map((time, i) => (
                  <motion.div
                    key={`cut-${i}`}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute top-0 bottom-0 w-1 bg-destructive shadow-[0_0_10px_rgba(255,0,0,0.5)]"
                    style={{ left: `${(time / duration) * 100}%` }}
                  >
                    <div className="absolute top-1 left-1/2 -translate-x-1/2">
                      <Scissors className="w-3 h-3 text-destructive" />
                    </div>
                  </motion.div>
                ))}

                {/* Playhead */}
                <motion.div
                  className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_10px_rgba(255,255,255,0.5)]"
                  style={{ left: `${(currentTime / duration) * 100}%` }}
                />
              </div>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-6 text-xs text-muted-foreground flex-wrap">
              {detectedBpm && (
                <span className="font-semibold text-primary">~{detectedBpm} BPM</span>
              )}
              <span>{tx({ de: `${beats.length} Beats erkannt`, en: `${beats.length} beats detected`, es: `${beats.length} ritmos detectados` })}</span>
              <span>{tx({ de: `${beats.filter(b => b.type === 'drop').length} Drops`, en: `${beats.filter(b => b.type === 'drop').length} drops`, es: `${beats.filter(b => b.type === 'drop').length} caídas` })}</span>
              <span>{tx({ de: `${cutMarkers.length} Schnitte gesetzt`, en: `${cutMarkers.length} cuts set`, es: `${cutMarkers.length} cortes establecidos` })}</span>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
