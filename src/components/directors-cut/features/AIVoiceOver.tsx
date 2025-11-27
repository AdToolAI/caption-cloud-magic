import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Mic, Sparkles, Zap, Play, Languages, Volume2 } from 'lucide-react';

interface AIVoiceOverProps {
  settings: {
    enabled: boolean;
    scriptText: string;
    voiceId: string;
    language: string;
    speed: number;
    pitch: number;
    volume: number;
    emotionalTone: 'neutral' | 'enthusiastic' | 'calm' | 'serious' | 'friendly';
  };
  onSettingsChange: (settings: AIVoiceOverProps['settings']) => void;
}

const VOICE_OPTIONS = [
  { id: 'sarah', name: 'Sarah', language: 'de-DE', gender: 'female' },
  { id: 'max', name: 'Max', language: 'de-DE', gender: 'male' },
  { id: 'emma', name: 'Emma', language: 'en-US', gender: 'female' },
  { id: 'james', name: 'James', language: 'en-US', gender: 'male' },
  { id: 'marie', name: 'Marie', language: 'fr-FR', gender: 'female' },
  { id: 'pablo', name: 'Pablo', language: 'es-ES', gender: 'male' },
];

const LANGUAGES = [
  { code: 'de-DE', name: 'Deutsch' },
  { code: 'en-US', name: 'English (US)' },
  { code: 'en-GB', name: 'English (UK)' },
  { code: 'fr-FR', name: 'Français' },
  { code: 'es-ES', name: 'Español' },
  { code: 'it-IT', name: 'Italiano' },
];

const EMOTIONAL_TONES = [
  { id: 'neutral', name: 'Neutral' },
  { id: 'enthusiastic', name: 'Enthusiastisch' },
  { id: 'calm', name: 'Ruhig' },
  { id: 'serious', name: 'Seriös' },
  { id: 'friendly', name: 'Freundlich' },
];

export function AIVoiceOver({ settings, onSettingsChange }: AIVoiceOverProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);

  const handleGenerate = async () => {
    setIsGenerating(true);
    await new Promise(resolve => setTimeout(resolve, 3000));
    setIsGenerating(false);
  };

  const handlePreview = async () => {
    setIsPreviewing(true);
    await new Promise(resolve => setTimeout(resolve, 2000));
    setIsPreviewing(false);
  };

  const filteredVoices = VOICE_OPTIONS.filter(v => v.language === settings.language);

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mic className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">AI Voice-Over</h3>
        </div>
        <Switch
          checked={settings.enabled}
          onCheckedChange={(enabled) => onSettingsChange({ ...settings, enabled })}
        />
      </div>

      {settings.enabled && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Skript / Text</Label>
            <Textarea
              value={settings.scriptText}
              onChange={(e) => onSettingsChange({ ...settings, scriptText: e.target.value })}
              placeholder="Gib hier deinen Voice-Over Text ein..."
              rows={4}
            />
            <p className="text-xs text-muted-foreground text-right">
              {settings.scriptText.length} Zeichen • ~{Math.ceil(settings.scriptText.length / 15)} Sekunden
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <Languages className="h-3 w-3" />
                Sprache
              </Label>
              <Select 
                value={settings.language} 
                onValueChange={(language) => onSettingsChange({ ...settings, language })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((lang) => (
                    <SelectItem key={lang.code} value={lang.code}>
                      {lang.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Stimme</Label>
              <Select 
                value={settings.voiceId} 
                onValueChange={(voiceId) => onSettingsChange({ ...settings, voiceId })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Stimme wählen" />
                </SelectTrigger>
                <SelectContent>
                  {filteredVoices.map((voice) => (
                    <SelectItem key={voice.id} value={voice.id}>
                      {voice.name} ({voice.gender === 'female' ? '♀' : '♂'})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Emotionaler Ton</Label>
            <Select 
              value={settings.emotionalTone} 
              onValueChange={(emotionalTone: typeof settings.emotionalTone) => 
                onSettingsChange({ ...settings, emotionalTone })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EMOTIONAL_TONES.map((tone) => (
                  <SelectItem key={tone.id} value={tone.id}>
                    {tone.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Geschwindigkeit</Label>
              <span className="text-sm text-muted-foreground">{settings.speed}x</span>
            </div>
            <Slider
              value={[settings.speed]}
              onValueChange={([speed]) => onSettingsChange({ ...settings, speed })}
              min={0.5}
              max={2}
              step={0.1}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Tonhöhe</Label>
              <span className="text-sm text-muted-foreground">{settings.pitch > 0 ? '+' : ''}{settings.pitch}</span>
            </div>
            <Slider
              value={[settings.pitch]}
              onValueChange={([pitch]) => onSettingsChange({ ...settings, pitch })}
              min={-10}
              max={10}
              step={1}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <Volume2 className="h-3 w-3" />
                <Label>Lautstärke</Label>
              </div>
              <span className="text-sm text-muted-foreground">{settings.volume}%</span>
            </div>
            <Slider
              value={[settings.volume]}
              onValueChange={([volume]) => onSettingsChange({ ...settings, volume })}
              max={100}
              step={5}
            />
          </div>

          <div className="flex gap-2">
            <Button 
              variant="outline"
              onClick={handlePreview} 
              disabled={isPreviewing || !settings.scriptText}
              className="flex-1 gap-2"
            >
              {isPreviewing ? (
                <>
                  <Zap className="h-4 w-4 animate-pulse" />
                  Lädt...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Vorschau
                </>
              )}
            </Button>
            
            <Button 
              onClick={handleGenerate} 
              disabled={isGenerating || !settings.scriptText}
              className="flex-1 gap-2"
            >
              {isGenerating ? (
                <>
                  <Zap className="h-4 w-4 animate-pulse" />
                  Generiert...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Voice-Over erstellen
                </>
              )}
            </Button>
          </div>

          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground">
              <strong>Tipp:</strong> Nutze Satzzeichen für natürliche Pausen. 
              Kommas erzeugen kurze, Punkte längere Pausen.
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}
