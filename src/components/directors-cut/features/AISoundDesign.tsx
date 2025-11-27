import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2, Volume2, Sparkles, Play, Pause, Trash2 } from 'lucide-react';
import { SceneAnalysis } from '@/types/directors-cut';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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
  videoUrl?: string;
  onSoundsGenerated: (sounds: GeneratedSound[]) => void;
}

const SOUND_CATEGORIES = [
  { id: 'ambient', name: 'Ambiente', icon: '🌿', description: 'Hintergrundatmosphäre' },
  { id: 'sfx', name: 'Sound Effects', icon: '💥', description: 'Dynamische Soundeffekte' },
  { id: 'foley', name: 'Foley', icon: '👣', description: 'Bewegungsgeräusche' },
];

const CREDITS_COST = 5;

export function AISoundDesign({ scenes, videoUrl, onSoundsGenerated }: AISoundDesignProps) {
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
    
    try {
      const detectedMood = scenes[0]?.mood || 'neutral';
      
      const { data, error } = await supabase.functions.invoke('director-cut-sound-design', {
        body: {
          video_url: videoUrl,
          scenes: scenes.map(s => ({
            id: s.id,
            startTime: s.start_time,
            endTime: s.end_time,
            description: s.description,
            mood: s.mood,
          })),
          detected_mood: detectedMood,
          generate_ambient: selectedCategories.includes('ambient'),
          generate_sfx: selectedCategories.includes('sfx'),
          generate_foley: selectedCategories.includes('foley'),
        },
      });

      if (error) throw error;

      if (data?.recommendations) {
        const sounds: GeneratedSound[] = [];
        
        // Process ambient sounds
        if (data.recommendations.ambient?.primary) {
          sounds.push({
            id: `ambient-primary-${Date.now()}`,
            sceneId: scenes[0]?.id || 'global',
            type: 'ambient',
            name: data.recommendations.ambient.primary.name,
            description: `${data.recommendations.ambient.primary.category} - ${data.recommendations.ambient.primary.mood}`,
            startTime: 0,
            duration: scenes.reduce((sum, s) => Math.max(sum, s.end_time), 0),
            volume: data.recommendations.volume_recommendations?.ambient_level || 0.3,
          });
        }

        // Process SFX placements
        if (data.recommendations.sfx_placements) {
          data.recommendations.sfx_placements.forEach((sfx: any, i: number) => {
            sounds.push({
              id: `sfx-${Date.now()}-${i}`,
              sceneId: scenes[i % scenes.length]?.id || 'global',
              type: 'sfx',
              name: sfx.name,
              description: sfx.reason || 'Soundeffekt',
              startTime: sfx.timestamp,
              duration: 2,
              volume: data.recommendations.volume_recommendations?.sfx_level || 0.6,
            });
          });
        }

        // Process Foley suggestions
        if (data.recommendations.foley_suggestions) {
          data.recommendations.foley_suggestions.forEach((foley: any, i: number) => {
            sounds.push({
              id: `foley-${Date.now()}-${i}`,
              sceneId: scenes[i % scenes.length]?.id || 'global',
              type: 'foley',
              name: foley.type,
              description: foley.reason || 'Foley-Sound',
              startTime: foley.timestamp,
              duration: 3,
              volume: data.recommendations.volume_recommendations?.foley_level || 0.5,
            });
          });
        }

        setGeneratedSounds(sounds);
        onSoundsGenerated(sounds);
        toast.success(`${sounds.length} Sounds generiert`, {
          description: `${data.credits_used} Credits verwendet`,
        });
      }
    } catch (error: any) {
      console.error('Sound Design error:', error);
      
      if (error?.context?.status === 402) {
        toast.error('Nicht genügend Credits', {
          description: `Du benötigst ${CREDITS_COST} Credits für AI Sound Design`,
        });
      } else {
        toast.error('Generierung fehlgeschlagen', {
          description: error.message || 'Bitte versuche es erneut',
        });
      }
    } finally {
      setIsGenerating(false);
    }
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
          <Badge variant="secondary" className="ml-auto">{CREDITS_COST} Credits</Badge>
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
