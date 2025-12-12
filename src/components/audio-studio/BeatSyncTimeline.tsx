import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Music, Zap, Upload, Loader2, Play, Scissors } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { WaveformDisplay } from '@/components/directors-cut/timeline/WaveformDisplay';
import { toast } from 'sonner';

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
}

export function BeatSyncTimeline({
  audioUrl,
  duration,
  currentTime,
  onTimeChange
}: BeatSyncTimelineProps) {
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [musicUrl, setMusicUrl] = useState<string | null>(null);
  const [beats, setBeats] = useState<Beat[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [snapToBeats, setSnapToBeats] = useState(true);
  const [cutMarkers, setCutMarkers] = useState<number[]>([]);
  const [sensitivity, setSensitivity] = useState(50);
  const timelineRef = useRef<HTMLDivElement>(null);

  const handleMusicUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setMusicFile(file);
      const url = URL.createObjectURL(file);
      setMusicUrl(url);
      analyzeBeat(url);
    }
  };

  const analyzeBeat = async (url: string) => {
    setIsAnalyzing(true);
    try {
      // Simulate beat detection
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Generate mock beats based on typical music structure
      const mockBeats: Beat[] = [];
      const bpm = 120 + Math.random() * 40; // 120-160 BPM
      const beatInterval = 60 / bpm;
      
      for (let time = 0; time < duration; time += beatInterval) {
        const beatNumber = Math.floor(time / beatInterval);
        const isDownbeat = beatNumber % 4 === 0;
        const isDrop = beatNumber % 32 === 0 && beatNumber > 0;
        
        mockBeats.push({
          time,
          strength: isDrop ? 1 : isDownbeat ? 0.8 : 0.5,
          type: isDrop ? 'drop' : isDownbeat ? 'beat' : 'beat'
        });
      }
      
      setBeats(mockBeats);
      toast.success('Beat-Analyse abgeschlossen', {
        description: `${mockBeats.length} Beats erkannt bei ~${Math.round(bpm)} BPM`
      });
    } catch (error) {
      console.error('Beat analysis error:', error);
      toast.error('Fehler bei der Beat-Analyse');
    } finally {
      setIsAnalyzing(false);
    }
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
      toast.success('Schnitt auf Beat gesetzt');
    }
  };

  const autoGenerateCuts = () => {
    // Generate cuts on strong beats and drops
    const strongBeats = beats.filter(b => b.strength >= 0.8 || b.type === 'drop');
    const cutTimes = strongBeats.map(b => b.time);
    setCutMarkers(cutTimes);
    toast.success(`${cutTimes.length} automatische Schnitte generiert`);
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
              <h3 className="font-semibold">Beat-Sync Timeline</h3>
              <p className="text-xs text-muted-foreground">Automatische Schnitte auf Musik-Beats</p>
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
                  Musik hochladen
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
              <Label htmlFor="snap-beats" className="text-sm">Snap to Beat</Label>
            </div>

            <div className="flex items-center gap-2 flex-1 max-w-[200px]">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">Sensitivität</Label>
              <Slider
                value={[sensitivity]}
                onValueChange={([v]) => setSensitivity(v)}
                max={100}
                className="flex-1"
              />
            </div>

            <Button size="sm" variant="outline" onClick={addCutAtCurrentBeat}>
              <Scissors className="w-4 h-4 mr-2" />
              Schnitt setzen
            </Button>

            <Button size="sm" onClick={autoGenerateCuts} className="bg-gradient-to-r from-primary to-cyan-500">
              <Zap className="w-4 h-4 mr-2" />
              Auto-Schnitte
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
            <h3 className="text-lg font-semibold mb-2">Musik für Beat-Sync hinzufügen</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Lade eine Musikdatei hoch, um automatisch Beats zu erkennen 
              und Video-Schnitte darauf zu synchronisieren.
            </p>
          </div>
        ) : isAnalyzing ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
            <p className="text-muted-foreground">Analysiere Beats...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Original Audio Waveform */}
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">Original Audio</Label>
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
              <Label className="text-xs text-muted-foreground mb-2 block">Musik + Beats</Label>
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
            <div className="flex items-center gap-6 text-xs text-muted-foreground">
              <span>{beats.length} Beats erkannt</span>
              <span>{beats.filter(b => b.type === 'drop').length} Drops</span>
              <span>{cutMarkers.length} Schnitte gesetzt</span>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
