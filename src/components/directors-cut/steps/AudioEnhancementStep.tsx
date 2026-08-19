import { tx } from "@/lib/i18nText";
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Volume2, VolumeX, Mic, Music, Waves, Sparkles, Loader2 } from 'lucide-react';
import { AudioEnhancements, SceneAnalysis } from '@/types/directors-cut';
import { BeatSyncEditor } from '../features/BeatSyncEditor';
import { AISoundDesign } from '../features/AISoundDesign';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface AudioEnhancementStepProps {
  audio: AudioEnhancements;
  onAudioChange: (audio: AudioEnhancements) => void;
  videoUrl: string;
  scenes?: SceneAnalysis[];
}

export function AudioEnhancementStep({ audio, onAudioChange, videoUrl, scenes = [] }: AudioEnhancementStepProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [detectedBeats, setDetectedBeats] = useState<any[]>([]);
  const [generatedSounds, setGeneratedSounds] = useState<any[]>([]);
  const { toast } = useToast();

  const handleVolumeChange = (value: number[]) => {
    onAudioChange({ ...audio, master_volume: value[0] });
  };

  const handleToggle = (key: keyof AudioEnhancements, value: boolean) => {
    onAudioChange({ ...audio, [key]: value });
  };

  const handleLevelChange = (key: keyof AudioEnhancements, value: number[]) => {
    onAudioChange({ ...audio, [key]: value[0] });
  };

  const handleAutoOptimize = async () => {
    setIsAnalyzing(true);
    
    try {
      // Build audio tracks info for analysis
      const audioTracks = [
        {
          id: 'main',
          type: 'main',
          name: 'Haupt-Audio',
          volume: audio.master_volume,
          has_speech: true,
          has_music: true,
        },
      ];

      const { data, error } = await supabase.functions.invoke('director-cut-audio-mixing', {
        body: {
          audio_tracks: audioTracks,
          video_url: videoUrl,
          mixing_style: 'balanced',
        },
      });

      if (error) {
        throw new Error(error.message || tx({ de: 'AI Audio-Analyse fehlgeschlagen', en: 'AI audio analysis failed', es: 'El análisis de audio de IA falló' }));
      }

      if (data?.recommendations && Array.isArray(data.recommendations)) {
        // Apply the first recommendation (main track)
        const mainRec = data.recommendations.find((r: any) => r.track_id === 'main') || data.recommendations[0];
        
        if (mainRec) {
          onAudioChange({
            ...audio,
            noise_reduction: mainRec.noise_reduction?.enabled ?? true,
            noise_reduction_level: mainRec.noise_reduction?.strength ?? 60,
            voice_enhancement: mainRec.voice_boost ?? true,
            auto_ducking: mainRec.auto_ducking?.enabled ?? true,
            ducking_level: mainRec.auto_ducking?.amount ?? 30,
            master_volume: mainRec.target_volume ?? audio.master_volume,
          });
        }

        toast({
          title: 'AI Audio-Optimierung abgeschlossen',
          description: tx({ de: `Audio-Settings wurden optimiert. (${data.credits_used || 3} Credits)`, en: `Audio settings have been optimized. (${data.credits_used || 3} credits)`, es: `La configuración de audio se ha optimizado. (${data.credits_used || 3} créditos)` }),
        });
      } else {
        throw new Error(tx({ de: 'Ungültige Antwort vom Server', en: 'Invalid response from server', es: 'Respuesta no válida del servidor' }));
      }
    } catch (err: any) {
      console.error('Audio optimization error:', err);
      toast({
        title: tx({ de: 'Fehler', en: 'Mistake', es: 'Error' }),
        description: err.message || tx({ de: 'AI Audio-Analyse fehlgeschlagen', en: 'AI audio analysis failed', es: 'El análisis de audio de IA falló' }),
        variant: 'destructive',
      });
      
      // Fallback to local optimization
      onAudioChange({
        ...audio,
        noise_reduction: true,
        noise_reduction_level: 60,
        voice_enhancement: true,
        auto_ducking: true,
        ducking_level: 30,
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Audio Enhancement</h3>
          <p className="text-sm text-muted-foreground">
            {tx({ de: "{tx({ de: \"Optimiere die Audioqualität mit KI-gestützten Tools\", en: \"Optimize audio quality with AI-powered tools\", es: \"Optimiza la calidad de audio con herramientas de IA\" })}", en: "Optimize audio quality with AI-powered tools", es: "Optimiza la calidad de audio con herramientas de IA" })}
          </p>
        </div>
        <Button
          onClick={handleAutoOptimize}
          disabled={isAnalyzing}
          className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600"
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Analysiere Audio...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              AI Audio-Optimierung
            </>
          )}
          <Badge variant="secondary" className="ml-2 text-[10px]">3 Credits</Badge>
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Audio Preview */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Waves className="h-4 w-4" />
              {tx({ de: "{tx({ de: \"Audio-Vorschau\", en: \"Audio Preview\", es: \"Vista previa de audio\" })}", en: "Audio Preview", es: "Vista previa de audio" })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="aspect-video bg-black rounded-lg overflow-hidden mb-4">
              <video
                src={videoUrl}
                className="w-full h-full object-contain"
                controls
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
              />
            </div>
            
            {/* Waveform Visualization (Placeholder) */}
            <div className="h-16 bg-muted rounded-lg flex items-center justify-center overflow-hidden">
              <div className="flex items-end gap-0.5 h-full py-2">
                {Array.from({ length: 60 }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-1 bg-primary/60 rounded-full transition-all duration-150 ${isPlaying ? 'animate-pulse' : ''}`}
                    style={{
                      height: `${20 + Math.random() * 60}%`,
                      animationDelay: `${i * 20}ms`,
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Active Enhancements */}
            <div className="flex flex-wrap gap-2 mt-4">
              {audio.noise_reduction && (
                <Badge variant="secondary">
                  <VolumeX className="h-3 w-3 mr-1" />
                  {tx({ de: "{tx({ de: \"Rauschunterdrückung\", en: \"Noise Reduction\", es: \"Reducción de ruido\" })}", en: "Noise Reduction", es: "Reducción de ruido" })}
                </Badge>
              )}
              {audio.voice_enhancement && (
                <Badge variant="secondary">
                  <Mic className="h-3 w-3 mr-1" />
                  {tx({ de: "{tx({ de: \"Stimme verbessert\", en: \"Voice Enhanced\", es: \"Voz mejorada\" })}", en: "Voice Enhanced", es: "Voz mejorada" })}
                </Badge>
              )}
              {audio.auto_ducking && (
                <Badge variant="secondary">
                  <Music className="h-3 w-3 mr-1" />
                  Auto-Ducking
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Audio Controls */}
        <div className="space-y-4">
          {/* Master Volume */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Volume2 className="h-4 w-4" />
                {tx({ de: "{tx({ de: \"Master-Lautstärke\", en: \"Master Volume\", es: \"Volumen maestro\" })}", en: "Master Volume", es: "Volumen maestro" })}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label className="text-xs">{tx({ de: "Lautstärke", en: "Volume", es: "Volumen" })}</Label>
                  <span className="text-xs text-muted-foreground">{audio.master_volume}%</span>
                </div>
                <Slider
                  value={[audio.master_volume]}
                  onValueChange={handleVolumeChange}
                  min={0}
                  max={200}
                  step={1}
                />
              </div>
            </CardContent>
          </Card>

          {/* Noise Reduction */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <VolumeX className="h-4 w-4" />
                {tx({ de: "{tx({ de: \"KI-Rauschunterdrückung\", en: \"AI Noise Reduction\", es: \"Reducción de ruido con IA\" })}", en: "AI Noise Reduction", es: "Reducción de ruido con IA" })}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Aktivieren</Label>
                <Switch
                  checked={audio.noise_reduction}
                  onCheckedChange={(v) => handleToggle('noise_reduction', v)}
                />
              </div>
              {audio.noise_reduction && (
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label className="text-xs">{tx({ de: "Stärke", en: "Strength", es: "Intensidad" })}</Label>
                    <span className="text-xs text-muted-foreground">{audio.noise_reduction_level}%</span>
                  </div>
                  <Slider
                    value={[audio.noise_reduction_level]}
                    onValueChange={(v) => handleLevelChange('noise_reduction_level', v)}
                    min={0}
                    max={100}
                    step={1}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Voice Enhancement */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Mic className="h-4 w-4" />
                Stimmverbesserung
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm">KI-Stimmoptimierung</Label>
                  <p className="text-xs text-muted-foreground">
                    {tx({ de: "{tx({ de: \"Verbessert Klarheit und Verständlichkeit\", en: \"Improves clarity and intelligibility\", es: \"Mejora la claridad y la inteligibilidad\" })}", en: "Improves clarity and intelligibility", es: "Mejora la claridad y la inteligibilidad" })}
                  </p>
                </div>
                <Switch
                  checked={audio.voice_enhancement}
                  onCheckedChange={(v) => handleToggle('voice_enhancement', v)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Auto Ducking */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Music className="h-4 w-4" />
                Auto-Ducking
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm">Aktivieren</Label>
                  <p className="text-xs text-muted-foreground">
                    {tx({ de: "{tx({ de: \"Senkt Musik automatisch bei Sprache\", en: \"Automatically lowers music during speech\", es: \"Baja automáticamente la música durante el habla\" })}", en: "Automatically lowers music during speech", es: "Baja automáticamente la música durante el habla" })}
                  </p>
                </div>
                <Switch
                  checked={audio.auto_ducking}
                  onCheckedChange={(v) => handleToggle('auto_ducking', v)}
                />
              </div>
              {audio.auto_ducking && (
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label className="text-xs">{tx({ de: "Ducking-Stärke", en: "Ducking Strength", es: "Intensidad de atenuación" })}</Label>
                    <span className="text-xs text-muted-foreground">{audio.ducking_level}%</span>
                  </div>
                  <Slider
                    value={[audio.ducking_level]}
                    onValueChange={(v) => handleLevelChange('ducking_level', v)}
                    min={0}
                    max={100}
                    step={1}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Premium Features - Phase 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-6 border-t">
        <BeatSyncEditor
          videoUrl={videoUrl}
          onBeatsDetected={setDetectedBeats}
          onSyncApplied={(settings) => console.log('Beat sync settings:', settings)}
        />
        <AISoundDesign
          scenes={scenes}
          onSoundsGenerated={setGeneratedSounds}
        />
      </div>
    </div>
  );
}
