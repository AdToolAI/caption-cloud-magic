import { tx } from "@/lib/i18nText";
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
  { id: 'ambient', name: tx({ de: 'Ambiente', en: 'Ambience', es: 'Ambiente' }), icon: '🌿', description: tx({ de: 'Hintergrundatmosphäre', en: 'Background atmosphere', es: 'Atmósfera de fondo' }) },
  { id: 'sfx', name: tx({ de: 'Soundeffekte', en: 'Sound effects', es: 'Efectos de sonido' }), icon: '💥', description: tx({ de: 'Dynamische Soundeffekte', en: 'Dynamic sound effects', es: 'Efectos de sonido dinámicos' }) },
  { id: 'foley', name: tx({ de: 'Foley', en: 'Foley', es: 'Foley' }), icon: '👣', description: tx({ de: 'Bewegungsgeräusche', en: 'Movement sounds', es: 'Sonidos de movimiento' }) },
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
          description: tx({ de: `${data.credits_used} Credits verwendet`, en: `${data.credits_used} credits used`, es: `${data.credits_used} créditos utilizados` }),
        });
      }
    } catch (error: any) {
      console.error('Sound Design error:', error);
      
      if (error?.context?.status === 402) {
        toast.error('Nicht genügend Credits', {
          description: tx({ de: `Du benötigst ${CREDITS_COST} Credits für AI Sound Design`, en: `You need ${CREDITS_COST} credits for AI Sound Design`, es: `Necesitas ${CREDITS_COST} créditos para diseño de sonido con IA` }),
        });
      } else {
        toast.error(tx({ de: "Generierung fehlgeschlagen", en: "Generation failed", es: "Generación fallida" }), {
          description: error.message || tx({ de: 'Bitte versuche es erneut', en: 'Please try again', es: 'Por favor, inténtalo de nuevo' }),
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
          <Label className="text-xs">{tx({ de: "Sound-Kategorien", en: "Sound categories", es: "Categorías de sonido" })}</Label>
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
            <Label className="text-xs">{tx({ de: "Auto-Lautstärke", en: "Auto volume", es: "Volumen automático" })}</Label>
            <p className="text-[10px] text-muted-foreground">
              {tx({ de: "Passt Lautstärke an Sprache an", en: "Adjusts volume to speech", es: "Ajusta el volumen a la voz" })}
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
              {tx({ de: "Generiere Sounds...", en: "Generating sounds...", es: "Generando sonidos..." })}
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              {tx({ de: `Sounds für ${scenes.length} Szenen generieren`, en: `Generate sounds for ${scenes.length} scenes`, es: `Generar sonidos para ${scenes.length} escenas` })}
            </>
          )}
        </Button>

        {scenes.length === 0 && (
          <p className="text-xs text-muted-foreground text-center">
            {tx({ de: "Führe zuerst die Szenenanalyse durch", en: "Perform scene analysis first", es: "Realizar primero el análisis de la escena." })}
          </p>
        )}

        {/* Generated Sounds List */}
        {generatedSounds.length > 0 && (
          <div className="space-y-2 pt-3 border-t max-h-64 overflow-y-auto">
            <Label className="text-xs">{tx({ de: `${generatedSounds.length} Sounds generiert`, en: `${generatedSounds.length} sounds generated`, es: `${generatedSounds.length} sonidos generados` })}</Label>
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
