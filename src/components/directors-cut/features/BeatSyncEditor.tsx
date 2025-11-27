import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2, Music, Zap, Upload, Play, Pause } from 'lucide-react';

interface Beat {
  time: number;
  intensity: number;
  type: 'kick' | 'snare' | 'hihat' | 'other';
}

interface BeatSyncEditorProps {
  videoUrl: string;
  onBeatsDetected: (beats: Beat[]) => void;
  onSyncApplied: (settings: BeatSyncSettings) => void;
}

interface BeatSyncSettings {
  enabled: boolean;
  cutOnBeat: boolean;
  transitionOnBeat: boolean;
  effectsOnBeat: boolean;
  beatSensitivity: number;
  musicUrl?: string;
}

export function BeatSyncEditor({ videoUrl, onBeatsDetected, onSyncApplied }: BeatSyncEditorProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [beats, setBeats] = useState<Beat[]>([]);
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [settings, setSettings] = useState<BeatSyncSettings>({
    enabled: false,
    cutOnBeat: true,
    transitionOnBeat: true,
    effectsOnBeat: false,
    beatSensitivity: 70,
  });
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleMusicUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setMusicFile(file);
      setBeats([]);
    }
  };

  const handleAnalyzeBeats = async () => {
    if (!musicFile) return;
    
    setIsAnalyzing(true);
    
    // Simulate beat detection
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Generate mock beats
    const mockBeats: Beat[] = [];
    const duration = 60; // Assume 60 second track
    const bpm = 120; // Assumed BPM
    const beatInterval = 60 / bpm;
    
    for (let time = 0; time < duration; time += beatInterval) {
      mockBeats.push({
        time,
        intensity: 0.5 + Math.random() * 0.5,
        type: Math.random() > 0.75 ? 'kick' : Math.random() > 0.5 ? 'snare' : 'hihat',
      });
    }
    
    setBeats(mockBeats);
    onBeatsDetected(mockBeats);
    setSettings(prev => ({ ...prev, enabled: true }));
    setIsAnalyzing(false);
  };

  const handleSettingChange = (key: keyof BeatSyncSettings, value: any) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    onSyncApplied(newSettings);
  };

  const kickBeats = beats.filter(b => b.type === 'kick').length;
  const snareBeats = beats.filter(b => b.type === 'snare').length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Music className="h-4 w-4 text-green-500" />
          Beat-Sync Editor
          <Badge variant="secondary" className="ml-auto">Premium</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Music Upload */}
        <div className="space-y-2">
          <Label className="text-xs">Musik-Track</Label>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={handleMusicUpload}
            className="hidden"
          />
          <Button 
            variant="outline" 
            className="w-full"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-4 w-4 mr-2" />
            {musicFile ? musicFile.name : 'Musik hochladen'}
          </Button>
        </div>

        {/* Beat Analysis */}
        {musicFile && (
          <Button 
            className="w-full"
            onClick={handleAnalyzeBeats}
            disabled={isAnalyzing}
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Analysiere Beats...
              </>
            ) : beats.length > 0 ? (
              <>
                <Zap className="h-4 w-4 mr-2" />
                Erneut analysieren
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 mr-2" />
                Beats erkennen
              </>
            )}
          </Button>
        )}

        {/* Beat Visualization */}
        {beats.length > 0 && (
          <div className="space-y-3">
            <div className="h-12 bg-muted rounded-lg flex items-end gap-px overflow-hidden px-1">
              {beats.slice(0, 50).map((beat, i) => (
                <div
                  key={i}
                  className={`
                    flex-1 rounded-t transition-all
                    ${beat.type === 'kick' ? 'bg-green-500' : beat.type === 'snare' ? 'bg-blue-500' : 'bg-gray-400'}
                  `}
                  style={{ height: `${beat.intensity * 100}%` }}
                />
              ))}
            </div>
            
            <div className="flex gap-4 text-xs">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded bg-green-500" />
                <span>{kickBeats} Kicks</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded bg-blue-500" />
                <span>{snareBeats} Snares</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded bg-gray-400" />
                <span>{beats.length - kickBeats - snareBeats} Andere</span>
              </div>
            </div>
          </div>
        )}

        {/* Sync Settings */}
        {beats.length > 0 && (
          <div className="space-y-3 pt-3 border-t">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Beat-Sync aktivieren</Label>
              <Switch
                checked={settings.enabled}
                onCheckedChange={(v) => handleSettingChange('enabled', v)}
              />
            </div>
            
            {settings.enabled && (
              <>
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Schnitte auf Beat</Label>
                  <Switch
                    checked={settings.cutOnBeat}
                    onCheckedChange={(v) => handleSettingChange('cutOnBeat', v)}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Übergänge auf Beat</Label>
                  <Switch
                    checked={settings.transitionOnBeat}
                    onCheckedChange={(v) => handleSettingChange('transitionOnBeat', v)}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Effekte auf Beat</Label>
                  <Switch
                    checked={settings.effectsOnBeat}
                    onCheckedChange={(v) => handleSettingChange('effectsOnBeat', v)}
                  />
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label className="text-xs">Beat-Empfindlichkeit</Label>
                    <span className="text-xs text-muted-foreground">{settings.beatSensitivity}%</span>
                  </div>
                  <Slider
                    value={[settings.beatSensitivity]}
                    onValueChange={(v) => handleSettingChange('beatSensitivity', v[0])}
                    min={20}
                    max={100}
                    step={5}
                  />
                </div>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
