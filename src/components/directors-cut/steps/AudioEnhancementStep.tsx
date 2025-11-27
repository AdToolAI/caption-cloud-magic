import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Volume2, VolumeX, Mic, Music, Waves, Sparkles } from 'lucide-react';
import { AudioEnhancements } from '@/types/directors-cut';

interface AudioEnhancementStepProps {
  audio: AudioEnhancements;
  onAudioChange: (audio: AudioEnhancements) => void;
  videoUrl: string;
}

export function AudioEnhancementStep({ audio, onAudioChange, videoUrl }: AudioEnhancementStepProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

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
    await new Promise(resolve => setTimeout(resolve, 2000));
    onAudioChange({
      ...audio,
      noise_reduction: true,
      noise_reduction_level: 60,
      voice_enhancement: true,
      auto_ducking: true,
      ducking_level: 30,
    });
    setIsAnalyzing(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Audio Enhancement</h3>
          <p className="text-sm text-muted-foreground">
            Optimiere die Audioqualität mit KI-gestützten Tools
          </p>
        </div>
        <Button
          onClick={handleAutoOptimize}
          disabled={isAnalyzing}
          className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600"
        >
          <Sparkles className="h-4 w-4 mr-2" />
          {isAnalyzing ? 'Analysiere Audio...' : 'AI Audio-Optimierung'}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Audio Preview */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Waves className="h-4 w-4" />
              Audio-Vorschau
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
                  Rauschunterdrückung
                </Badge>
              )}
              {audio.voice_enhancement && (
                <Badge variant="secondary">
                  <Mic className="h-3 w-3 mr-1" />
                  Stimme verbessert
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
                Master-Lautstärke
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label className="text-xs">Lautstärke</Label>
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
                KI-Rauschunterdrückung
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
                    <Label className="text-xs">Stärke</Label>
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
                    Verbessert Klarheit und Verständlichkeit
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
                    Senkt Musik automatisch bei Sprache
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
                    <Label className="text-xs">Ducking-Stärke</Label>
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
    </div>
  );
}
