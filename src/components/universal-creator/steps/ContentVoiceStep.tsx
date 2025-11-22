import { useState, useCallback, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Volume2, Play, Pause, Upload } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { ContentConfig, VoiceoverConfig } from '@/types/universal-creator';

interface ContentVoiceStepProps {
  value: ContentConfig | null;
  onChange: (config: ContentConfig) => void;
  projectId: string;
}

interface Voice {
  id: string;
  name: string;
  language: string;
  accent?: string;
  gender?: string;
  age?: string;
  description?: string;
}

export const ContentVoiceStep = ({ value, onChange, projectId }: ContentVoiceStepProps) => {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(true);
  const [selectedLanguage, setSelectedLanguage] = useState<string>('de');

  const [voiceConfig, setVoiceConfig] = useState<VoiceoverConfig>({
    voiceId: '9BWtsMINqrJLrRacOk9x',
    voiceName: 'Aria',
    modelId: 'eleven_turbo_v2_5',
    stability: 0.5,
    similarityBoost: 0.75,
    speed: 1.0,
  });

  // Load voices on mount
  useEffect(() => {
    const loadVoices = async () => {
      setLoadingVoices(true);
      try {
        const { data, error } = await supabase.functions.invoke('list-voices', {
          body: { language: 'all' },
        });

        if (error) {
          console.error('Error loading voices:', error);
          toast({
            title: 'Fehler beim Laden der Stimmen',
            description: 'Konnte Stimmen nicht laden. Bitte versuchen Sie es später erneut.',
            variant: 'destructive',
          });
          return;
        }

        setVoices(data.voices || []);
      } catch (err) {
        console.error('Failed to load voices:', err);
      } finally {
        setLoadingVoices(false);
      }
    };

    loadVoices();
  }, [toast]);

  const handleScriptChange = useCallback((text: string) => {
    onChange({
      ...(value || {} as ContentConfig),
      scriptText: text,
    });
  }, [value, onChange]);

  const handleGenerateVoiceover = async () => {
    if (!value?.scriptText || value.scriptText.trim().length === 0) {
      toast({
        title: 'Fehler',
        description: 'Bitte gib zuerst einen Text ein',
        variant: 'destructive',
      });
      return;
    }

    setIsGenerating(true);

    try {
      const { data, error } = await supabase.functions.invoke('generate-voiceover', {
        body: {
          text: value.scriptText,
          voiceId: voiceConfig.voiceId,
          modelId: voiceConfig.modelId,
          stability: voiceConfig.stability,
          similarityBoost: voiceConfig.similarityBoost,
          speed: voiceConfig.speed,
          projectId,
        },
      });

      if (error) throw error;

      if (data.success) {
        onChange({
          ...value,
          voiceoverUrl: data.audioUrl,
          voiceoverConfig: voiceConfig,
          voiceoverDuration: data.duration,
        });

        toast({
          title: 'Erfolgreich',
          description: 'Voice-over wurde generiert',
        });
      }
    } catch (error) {
      console.error('Error generating voiceover:', error);
      toast({
        title: 'Fehler',
        description: 'Voice-over konnte nicht generiert werden',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePlayPause = () => {
    if (!value?.voiceoverUrl) return;

    if (!audio) {
      const newAudio = new Audio(value.voiceoverUrl);
      newAudio.onended = () => setIsPlaying(false);
      setAudio(newAudio);
      newAudio.play();
      setIsPlaying(true);
    } else {
      if (isPlaying) {
        audio.pause();
        setIsPlaying(false);
      } else {
        audio.play();
        setIsPlaying(true);
      }
    }
  };

  const charCount = value?.scriptText?.length || 0;
  const wordCount = value?.scriptText?.split(/\s+/).filter(Boolean).length || 0;
  const estimatedDuration = Math.ceil((wordCount / 150) * 60);
  const filteredVoices = voices.filter((v) => v.language === selectedLanguage);

  return (
    <div className="space-y-6">
      {/* Script Editor */}
      <Card className="p-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="script">Video Script</Label>
            <div className="text-xs text-muted-foreground">
              {charCount} Zeichen • {wordCount} Wörter • ~{estimatedDuration}s
            </div>
          </div>
          <Textarea
            id="script"
            placeholder="Schreibe hier deinen Video-Text..."
            value={value?.scriptText || ''}
            onChange={(e) => handleScriptChange(e.target.value)}
            className="min-h-[200px] font-mono text-sm"
          />
        </div>
      </Card>

      {/* Voice-over Settings */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Voice-over Einstellungen</h3>
        <div className="space-y-6">
          {/* Language Selection */}
          <div className="space-y-2">
            <Label>Sprache / Language</Label>
            <Tabs value={selectedLanguage} onValueChange={setSelectedLanguage}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="de" disabled={loadingVoices}>
                  Deutsch {!loadingVoices && `(${voices.filter(v => v.language === 'de').length})`}
                </TabsTrigger>
                <TabsTrigger value="en" disabled={loadingVoices}>
                  English {!loadingVoices && `(${voices.filter(v => v.language === 'en').length})`}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Voice Selection */}
          <div className="space-y-2">
            <Label>Stimme auswählen</Label>
            <Select
              value={voiceConfig.voiceId}
              onValueChange={(voiceId) => {
                const voice = filteredVoices.find((v) => v.id === voiceId);
                setVoiceConfig({
                  ...voiceConfig,
                  voiceId,
                  voiceName: voice?.name || 'Voice',
                });
              }}
              disabled={loadingVoices || filteredVoices.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder={loadingVoices ? "Lade Stimmen..." : "Wähle eine Stimme"} />
              </SelectTrigger>
              <SelectContent>
                {filteredVoices.map((voice) => (
                  <SelectItem key={voice.id} value={voice.id}>
                    {voice.name}
                    {voice.gender && ` (${voice.gender})`}
                    {voice.accent && voice.accent !== 'neutral' && ` - ${voice.accent}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Model Selection */}
          <div className="space-y-2">
            <Label>Modell</Label>
            <Select
              value={voiceConfig.modelId}
              onValueChange={(modelId) =>
                setVoiceConfig({ ...voiceConfig, modelId })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="eleven_turbo_v2_5">
                  Turbo v2.5 (Schnell, 32 Sprachen)
                </SelectItem>
                <SelectItem value="eleven_multilingual_v2">
                  Multilingual v2 (Beste Qualität, 29 Sprachen)
                </SelectItem>
                <SelectItem value="eleven_turbo_v2">
                  Turbo v2 (Schnell, nur Englisch)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Stability */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label>Stabilität</Label>
              <span className="text-sm text-muted-foreground">
                {voiceConfig.stability.toFixed(2)}
              </span>
            </div>
            <Slider
              value={[voiceConfig.stability]}
              onValueChange={([stability]) =>
                setVoiceConfig({ ...voiceConfig, stability })
              }
              min={0}
              max={1}
              step={0.01}
            />
            <p className="text-xs text-muted-foreground">
              Höhere Werte = Konsistenter, Niedrigere Werte = Expressiver
            </p>
          </div>

          {/* Similarity Boost */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label>Ähnlichkeit</Label>
              <span className="text-sm text-muted-foreground">
                {voiceConfig.similarityBoost.toFixed(2)}
              </span>
            </div>
            <Slider
              value={[voiceConfig.similarityBoost]}
              onValueChange={([similarityBoost]) =>
                setVoiceConfig({ ...voiceConfig, similarityBoost })
              }
              min={0}
              max={1}
              step={0.01}
            />
            <p className="text-xs text-muted-foreground">
              Wie ähnlich die Stimme dem Original sein soll
            </p>
          </div>

          {/* Speed */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label>Geschwindigkeit</Label>
              <span className="text-sm text-muted-foreground">
                {voiceConfig.speed.toFixed(1)}x
              </span>
            </div>
            <Slider
              value={[voiceConfig.speed]}
              onValueChange={([speed]) =>
                setVoiceConfig({ ...voiceConfig, speed })
              }
              min={0.5}
              max={2}
              step={0.1}
            />
          </div>

          {/* Generate Button */}
          <Button
            onClick={handleGenerateVoiceover}
            disabled={isGenerating || !value?.scriptText}
            className="w-full"
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generiere Voice-over...
              </>
            ) : (
              <>
                <Volume2 className="mr-2 h-4 w-4" />
                Voice-over generieren
              </>
            )}
          </Button>
        </div>
      </Card>

      {/* Audio Preview */}
      {value?.voiceoverUrl && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Audio Vorschau</h3>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Button
                size="lg"
                variant="outline"
                onClick={handlePlayPause}
                className="w-16 h-16 rounded-full"
              >
                {isPlaying ? (
                  <Pause className="h-6 w-6" />
                ) : (
                  <Play className="h-6 w-6 ml-1" />
                )}
              </Button>
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {voiceConfig.voiceName} • {voiceConfig.modelId}
                </p>
                <p className="text-xs text-muted-foreground">
                  Dauer: ~{value.voiceoverDuration}s
                </p>
              </div>
            </div>

            <div className="p-4 bg-muted/50 rounded-lg">
              <audio src={value.voiceoverUrl} preload="metadata" />
              <p className="text-xs text-muted-foreground">
                Audio URL: {value.voiceoverUrl.substring(0, 50)}...
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Alternative: Upload eigenes Audio */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Oder: Eigenes Audio hochladen</h3>
        <Button variant="outline" className="w-full" disabled>
          <Upload className="mr-2 h-4 w-4" />
          Audio-Datei hochladen (Coming Soon)
        </Button>
      </Card>
    </div>
  );
};
