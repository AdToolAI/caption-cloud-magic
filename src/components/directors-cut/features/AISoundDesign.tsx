import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2, Volume2, Sparkles, Play, Pause, Plus, Trash2 } from 'lucide-react';
import { SceneAnalysis } from '@/types/directors-cut';

interface GeneratedSound {
  id: string;
  sceneId: string;
  type: 'ambient' | 'sfx' | 'foley';
  name: string;
  description: string;
  startTime: number;
  duration: number;
  volume: number;
  previewUrl?: string;
}

interface AISoundDesignProps {
  scenes: SceneAnalysis[];
  onSoundsGenerated: (sounds: GeneratedSound[]) => void;
}

const SOUND_CATEGORIES = [
  { id: 'ambient', name: 'Ambiente', icon: '🌿', description: 'Hintergrundatmosphäre' },
  { id: 'sfx', name: 'Sound Effects', icon: '💥', description: 'Dynamische Soundeffekte' },
  { id: 'foley', name: 'Foley', icon: '👣', description: 'Bewegungsgeräusche' },
];

export function AISoundDesign({ scenes, onSoundsGenerated }: AISoundDesignProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedSounds, setGeneratedSounds] = useState<GeneratedSound[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(['ambient', 'sfx']);
  const [autoVolume, setAutoVolume] = useState(true);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const toggleCategory = (categoryId: string) => {
    setSelectedCategories(prev => 
      prev.includes(categoryId) 
        ? prev.filter(c => c !== categoryId)
        : [...prev, categoryId]
    );
  };

  const handleGenerateSounds = async () => {
    if (scenes.length === 0 || selectedCategories.length === 0) return;
    
    setIsGenerating(true);
    
    // Simulate AI sound generation
    await new Promise(resolve => setTimeout(resolve, 3500));
    
    const mockSounds: GeneratedSound[] = [];
    
    scenes.forEach((scene, index) => {
      if (selectedCategories.includes('ambient')) {
        mockSounds.push({
          id: `ambient-${scene.id}`,
          sceneId: scene.id,
          type: 'ambient',
          name: getAmbientForMood(scene.mood),
          description: `Passend zu: ${scene.description}`,
          startTime: scene.start_time,
          duration: scene.end_time - scene.start_time,
          volume: 0.3,
        });
      }
      
      if (selectedCategories.includes('sfx') && index % 2 === 0) {
        mockSounds.push({
          id: `sfx-${scene.id}`,
          sceneId: scene.id,
          type: 'sfx',
          name: getSfxForMood(scene.mood),
          description: 'KI-generierter Soundeffekt',
          startTime: scene.start_time + 1,
          duration: 2,
          volume: 0.6,
        });
      }
      
      if (selectedCategories.includes('foley')) {
        mockSounds.push({
          id: `foley-${scene.id}`,
          sceneId: scene.id,
          type: 'foley',
          name: 'Bewegungsgeräusch',
          description: 'Subtile Foley-Sounds',
          startTime: scene.start_time,
          duration: scene.end_time - scene.start_time,
          volume: 0.2,
        });
      }
    });
    
    setGeneratedSounds(mockSounds);
    onSoundsGenerated(mockSounds);
    setIsGenerating(false);
  };

  const handleRemoveSound = (soundId: string) => {
    const updated = generatedSounds.filter(s => s.id !== soundId);
    setGeneratedSounds(updated);
    onSoundsGenerated(updated);
  };

  const handleVolumeChange = (soundId: string, volume: number) => {
    const updated = generatedSounds.map(s => 
      s.id === soundId ? { ...s, volume } : s
    );
    setGeneratedSounds(updated);
    onSoundsGenerated(updated);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-yellow-500" />
          AI Sound Design
          <Badge variant="secondary" className="ml-auto">Premium</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Category Selection */}
        <div className="space-y-2">
          <Label className="text-xs">Sound-Kategorien</Label>
          <div className="grid grid-cols-3 gap-2">
            {SOUND_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => toggleCategory(cat.id)}
                className={`
                  p-2 rounded-lg border text-center transition-all
                  ${selectedCategories.includes(cat.id)
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-primary/50'
                  }
                `}
              >
                <span className="text-xl block">{cat.icon}</span>
                <span className="text-xs font-medium">{cat.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Auto Volume */}
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-xs">Auto-Lautstärke</Label>
            <p className="text-[10px] text-muted-foreground">
              Passt Lautstärke an Sprache an
            </p>
          </div>
          <Switch checked={autoVolume} onCheckedChange={setAutoVolume} />
        </div>

        {/* Generate Button */}
        <Button 
          className="w-full"
          onClick={handleGenerateSounds}
          disabled={isGenerating || scenes.length === 0 || selectedCategories.length === 0}
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Generiere Sounds...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Sounds für {scenes.length} Szenen generieren
            </>
          )}
        </Button>

        {scenes.length === 0 && (
          <p className="text-xs text-muted-foreground text-center">
            Führe zuerst die Szenenanalyse durch
          </p>
        )}

        {/* Generated Sounds List */}
        {generatedSounds.length > 0 && (
          <div className="space-y-2 pt-3 border-t max-h-64 overflow-y-auto">
            <Label className="text-xs">{generatedSounds.length} Sounds generiert</Label>
            {generatedSounds.map((sound) => (
              <div
                key={sound.id}
                className="p-2 rounded-lg border border-border bg-muted/30 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">
                      {sound.type === 'ambient' ? '🌿' : sound.type === 'sfx' ? '💥' : '👣'}
                    </span>
                    <div>
                      <span className="text-xs font-medium">{sound.name}</span>
                      <p className="text-[10px] text-muted-foreground">
                        {sound.startTime.toFixed(1)}s - {(sound.startTime + sound.duration).toFixed(1)}s
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => setPlayingId(playingId === sound.id ? null : sound.id)}
                    >
                      {playingId === sound.id ? (
                        <Pause className="h-3 w-3" />
                      ) : (
                        <Play className="h-3 w-3" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive"
                      onClick={() => handleRemoveSound(sound.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Volume2 className="h-3 w-3 text-muted-foreground" />
                  <Slider
                    value={[sound.volume * 100]}
                    onValueChange={(v) => handleVolumeChange(sound.id, v[0] / 100)}
                    min={0}
                    max={100}
                    step={5}
                    className="flex-1"
                  />
                  <span className="text-[10px] w-8">{Math.round(sound.volume * 100)}%</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function getAmbientForMood(mood: string): string {
  const ambients: Record<string, string> = {
    'calm': 'Sanfte Naturklänge',
    'dynamic': 'Urbane Atmosphäre',
    'neutral': 'Dezenter Raumklang',
    'energetic': 'Pulsierendes Ambiente',
    'melancholic': 'Atmosphärischer Regen',
  };
  return ambients[mood] || 'Ambiente Klangkulisse';
}

function getSfxForMood(mood: string): string {
  const sfx: Record<string, string> = {
    'calm': 'Sanfter Windhauch',
    'dynamic': 'Whoosh Transition',
    'neutral': 'Subtiler Akzent',
    'energetic': 'Impact Hit',
    'melancholic': 'Reverb Sweep',
  };
  return sfx[mood] || 'Dynamischer Effekt';
}
