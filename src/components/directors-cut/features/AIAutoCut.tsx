import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2, Scissors, Music, MessageSquare, Zap, RotateCcw, Check } from 'lucide-react';

interface CutPoint {
  id: string;
  time: number;
  type: 'beat' | 'speech' | 'action' | 'manual';
  confidence: number;
  description?: string;
}

interface AutoCutSettings {
  beatSync: boolean;
  speechPause: boolean;
  actionDetection: boolean;
  minClipDuration: number;
  maxClipDuration: number;
  sensitivity: number;
}

interface AIAutoCutProps {
  videoUrl: string;
  videoDuration: number;
  onCutsGenerated: (cuts: CutPoint[]) => void;
}

export function AIAutoCut({ videoUrl, videoDuration, onCutsGenerated }: AIAutoCutProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [cuts, setCuts] = useState<CutPoint[]>([]);
  const [settings, setSettings] = useState<AutoCutSettings>({
    beatSync: true,
    speechPause: true,
    actionDetection: true,
    minClipDuration: 2,
    maxClipDuration: 10,
    sensitivity: 70,
  });

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    
    // Simulate AI analysis
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Generate mock cut points
    const mockCuts: CutPoint[] = [];
    let currentTime = 0;
    
    while (currentTime < videoDuration) {
      const clipDuration = settings.minClipDuration + 
        Math.random() * (settings.maxClipDuration - settings.minClipDuration);
      currentTime += clipDuration;
      
      if (currentTime < videoDuration) {
        const types: CutPoint['type'][] = ['beat', 'speech', 'action'];
        const type = types[Math.floor(Math.random() * types.length)];
        
        mockCuts.push({
          id: `cut-${Date.now()}-${mockCuts.length}`,
          time: currentTime,
          type,
          confidence: 0.7 + Math.random() * 0.25,
          description: type === 'beat' ? 'Beat-Sync Schnitt' :
                       type === 'speech' ? 'Sprachpause erkannt' :
                       'Action-Wechsel erkannt',
        });
      }
    }
    
    setCuts(mockCuts);
    onCutsGenerated(mockCuts);
    setIsAnalyzing(false);
  };

  const removeCut = (cutId: string) => {
    const updated = cuts.filter(c => c.id !== cutId);
    setCuts(updated);
    onCutsGenerated(updated);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getTypeIcon = (type: CutPoint['type']) => {
    switch (type) {
      case 'beat': return <Music className="h-3 w-3" />;
      case 'speech': return <MessageSquare className="h-3 w-3" />;
      case 'action': return <Zap className="h-3 w-3" />;
      default: return <Scissors className="h-3 w-3" />;
    }
  };

  const getTypeColor = (type: CutPoint['type']) => {
    switch (type) {
      case 'beat': return 'bg-purple-500/20 text-purple-700 border-purple-500';
      case 'speech': return 'bg-blue-500/20 text-blue-700 border-blue-500';
      case 'action': return 'bg-orange-500/20 text-orange-700 border-orange-500';
      default: return 'bg-gray-500/20 text-gray-700 border-gray-500';
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Scissors className="h-4 w-4 text-red-500" />
          AI Auto-Cut
          <Badge variant="secondary" className="ml-auto">Premium</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Detection Settings */}
        <div className="space-y-3">
          <label className="text-xs font-medium">Erkennungsmethoden</label>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Music className="h-4 w-4 text-purple-500" />
              <Label className="text-xs">Beat-Sync</Label>
            </div>
            <Switch
              checked={settings.beatSync}
              onCheckedChange={(v) => setSettings({ ...settings, beatSync: v })}
            />
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-blue-500" />
              <Label className="text-xs">Sprachpausen</Label>
            </div>
            <Switch
              checked={settings.speechPause}
              onCheckedChange={(v) => setSettings({ ...settings, speechPause: v })}
            />
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-orange-500" />
              <Label className="text-xs">Action-Erkennung</Label>
            </div>
            <Switch
              checked={settings.actionDetection}
              onCheckedChange={(v) => setSettings({ ...settings, actionDetection: v })}
            />
          </div>
        </div>

        {/* Clip Duration */}
        <div className="space-y-2 pt-2 border-t">
          <div className="flex justify-between">
            <span className="text-xs font-medium">Clip-Dauer</span>
            <span className="text-xs text-muted-foreground">
              {settings.minClipDuration}s - {settings.maxClipDuration}s
            </span>
          </div>
          <div className="flex gap-2 items-center">
            <Slider
              value={[settings.minClipDuration]}
              onValueChange={(v) => setSettings({ ...settings, minClipDuration: v[0] })}
              min={1}
              max={settings.maxClipDuration - 1}
              step={0.5}
              className="flex-1"
            />
            <span className="text-[10px] text-muted-foreground w-8">Min</span>
          </div>
          <div className="flex gap-2 items-center">
            <Slider
              value={[settings.maxClipDuration]}
              onValueChange={(v) => setSettings({ ...settings, maxClipDuration: v[0] })}
              min={settings.minClipDuration + 1}
              max={30}
              step={0.5}
              className="flex-1"
            />
            <span className="text-[10px] text-muted-foreground w-8">Max</span>
          </div>
        </div>

        {/* Sensitivity */}
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-xs font-medium">Empfindlichkeit</span>
            <span className="text-xs text-muted-foreground">{settings.sensitivity}%</span>
          </div>
          <Slider
            value={[settings.sensitivity]}
            onValueChange={(v) => setSettings({ ...settings, sensitivity: v[0] })}
            min={30}
            max={100}
            step={5}
          />
        </div>

        {/* Analyze Button */}
        <Button
          onClick={handleAnalyze}
          disabled={isAnalyzing}
          className="w-full bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600"
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Analysiere Video...
            </>
          ) : (
            <>
              <Scissors className="h-4 w-4 mr-2" />
              Auto-Schnitte generieren
            </>
          )}
        </Button>

        {/* Generated Cuts */}
        {cuts.length > 0 && (
          <div className="space-y-2 pt-2 border-t">
            <div className="flex justify-between items-center">
              <label className="text-xs font-medium">Generierte Schnitte ({cuts.length})</label>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={() => { setCuts([]); onCutsGenerated([]); }}
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Reset
              </Button>
            </div>
            <div className="max-h-32 overflow-y-auto space-y-1">
              {cuts.map((cut) => (
                <div
                  key={cut.id}
                  className={`flex items-center justify-between p-2 rounded border ${getTypeColor(cut.type)}`}
                >
                  <div className="flex items-center gap-2">
                    {getTypeIcon(cut.type)}
                    <span className="text-[10px] font-medium">{formatTime(cut.time)}</span>
                    <span className="text-[9px] opacity-70">{cut.description}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onClick={() => removeCut(cut.id)}
                  >
                    <RotateCcw className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
