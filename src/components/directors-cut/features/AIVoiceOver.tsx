import { useState, useRef, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Mic, Sparkles, Play, Volume2, Pause, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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
  onVoiceOverGenerated?: (url: string) => void;
  projectId?: string;
}

// 6 German voices
const GERMAN_VOICES = [
  { id: 'aria', name: 'Aria', elevenLabsId: '9BWtsMINqrJLrRacOk9x', gender: 'female', description: 'Warm & freundlich' },
  { id: 'sarah', name: 'Sarah', elevenLabsId: 'EXAVITQu4vr4xnSDxMaL', gender: 'female', description: 'Klar & professionell' },
  { id: 'laura', name: 'Laura', elevenLabsId: 'FGY2WhTYpPnrIDTdsKH5', gender: 'female', description: 'Elegant & sanft' },
  { id: 'roger', name: 'Roger', elevenLabsId: 'CwhRBWXzGAHq8TQ4Fs17', gender: 'male', description: 'Tief & autoritär' },
  { id: 'charlie', name: 'Charlie', elevenLabsId: 'IKne3meq5aSn9XLyUdCD', gender: 'male', description: 'Jung & dynamisch' },
  { id: 'river', name: 'River', elevenLabsId: 'SAz9YHcvj6GT2YYXdXww', gender: 'neutral', description: 'Modern & neutral' },
];

// 6 English voices  
const ENGLISH_VOICES = [
  { id: 'charlotte', name: 'Charlotte', elevenLabsId: 'XB0fDUnXU5powFXDhCwa', gender: 'female', description: 'Elegant & sophisticated' },
  { id: 'jessica', name: 'Jessica', elevenLabsId: 'cgSgspJ2msm6clMCkdW9', gender: 'female', description: 'Friendly & warm' },
  { id: 'alice', name: 'Alice', elevenLabsId: 'Xb7hH8MSUJpSbSDYk0k2', gender: 'female', description: 'Clear & professional' },
  { id: 'george', name: 'George', elevenLabsId: 'JBFqnCBsd6RMkjVDRZzb', gender: 'male', description: 'Authoritative & deep' },
  { id: 'callum', name: 'Callum', elevenLabsId: 'N2lVS1w4EtoT3dr4eOWO', gender: 'male', description: 'Energetic & engaging' },
  { id: 'liam', name: 'Liam', elevenLabsId: 'TX3LPaxmHKxFdv7VOQHJ', gender: 'male', description: 'British & refined' },
];

const ALL_VOICES = [...GERMAN_VOICES, ...ENGLISH_VOICES];

const EMOTIONAL_TONES = [
  { id: 'neutral', name: 'Neutral' },
  { id: 'enthusiastic', name: 'Enthusiastisch' },
  { id: 'calm', name: 'Ruhig' },
  { id: 'serious', name: 'Seriös' },
  { id: 'friendly', name: 'Freundlich' },
];

export function AIVoiceOver({ settings, onSettingsChange, onVoiceOverGenerated, projectId }: AIVoiceOverProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedLanguageTab, setSelectedLanguageTab] = useState<'de' | 'en'>('de');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Auto-select first voice of selected language tab if current voice doesn't match
  useEffect(() => {
    const currentVoice = ALL_VOICES.find(v => v.id === settings.voiceId);
    const voicesForTab = selectedLanguageTab === 'de' ? GERMAN_VOICES : ENGLISH_VOICES;
    
    // If current voice is not in the selected tab, switch to first voice of that tab
    if (!voicesForTab.find(v => v.id === settings.voiceId)) {
      const newLanguage = selectedLanguageTab === 'de' ? 'de-DE' : 'en-US';
      onSettingsChange({ 
        ...settings, 
        voiceId: voicesForTab[0].id,
        language: newLanguage
      });
    }
  }, [selectedLanguageTab]);

  const handleGenerate = async () => {
    if (!settings.scriptText.trim()) {
      toast.error('Bitte gib einen Text für das Voice-Over ein');
      return;
    }

    setIsGenerating(true);
    
    try {
      const selectedVoice = ALL_VOICES.find(v => v.id === settings.voiceId);
      
      const { data, error } = await supabase.functions.invoke('director-cut-voice-over', {
        body: {
          script_text: settings.scriptText,
          voice_id: selectedVoice?.elevenLabsId || settings.voiceId,
          language: settings.language,
          speed: settings.speed,
          project_id: projectId,
        },
      });

      if (error) throw error;

      if (data?.error) {
        toast.error(data.error);
        return;
      }

      if (data?.voiceover_url) {
        setGeneratedUrl(data.voiceover_url);
        onVoiceOverGenerated?.(data.voiceover_url);
        toast.success('Voice-Over erfolgreich generiert!');
      }
    } catch (error) {
      console.error('Voice-over generation error:', error);
      toast.error('Fehler bei der Voice-Over Generierung');
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePreview = async () => {
    if (generatedUrl) {
      if (audioRef.current) {
        if (isPlaying) {
          audioRef.current.pause();
          setIsPlaying(false);
        } else {
          audioRef.current.play();
          setIsPlaying(true);
        }
      }
      return;
    }

    setIsPreviewing(true);
    await handleGenerate();
    setIsPreviewing(false);
  };

  const handleAudioEnded = () => {
    setIsPlaying(false);
  };

  const handleVoiceSelect = (voiceId: string) => {
    const voice = ALL_VOICES.find(v => v.id === voiceId);
    const newLanguage = GERMAN_VOICES.find(v => v.id === voiceId) ? 'de-DE' : 'en-US';
    onSettingsChange({ ...settings, voiceId, language: newLanguage });
    setGeneratedUrl(null);
  };

  const estimatedDuration = Math.ceil(settings.scriptText.length / 15 / settings.speed);
  const currentVoices = selectedLanguageTab === 'de' ? GERMAN_VOICES : ENGLISH_VOICES;

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
              onChange={(e) => {
                onSettingsChange({ ...settings, scriptText: e.target.value });
                setGeneratedUrl(null);
              }}
              placeholder="Gib hier deinen Voice-Over Text ein..."
              rows={4}
            />
            <p className="text-xs text-muted-foreground text-right">
              {settings.scriptText.length} Zeichen • ~{estimatedDuration} Sekunden
            </p>
          </div>

          {/* Language Tabs with Voice Selection */}
          <div className="space-y-3">
            <Label>Sprache & Stimme</Label>
            <Tabs value={selectedLanguageTab} onValueChange={(v) => setSelectedLanguageTab(v as 'de' | 'en')}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="de" className="gap-2">
                  🇩🇪 Deutsch ({GERMAN_VOICES.length})
                </TabsTrigger>
                <TabsTrigger value="en" className="gap-2">
                  🇬🇧 English ({ENGLISH_VOICES.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="de" className="mt-3">
                <div className="grid grid-cols-2 gap-2">
                  {GERMAN_VOICES.map((voice) => (
                    <button
                      key={voice.id}
                      onClick={() => handleVoiceSelect(voice.id)}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        settings.voiceId === voice.id 
                          ? 'border-primary bg-primary/10 ring-1 ring-primary' 
                          : 'border-border hover:border-primary/50 hover:bg-muted/50'
                      }`}
                    >
                      <div className="font-medium text-sm flex items-center gap-1.5">
                        <span className="text-base">
                          {voice.gender === 'female' ? '♀' : voice.gender === 'male' ? '♂' : '◎'}
                        </span>
                        {voice.name}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {voice.description}
                      </div>
                    </button>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="en" className="mt-3">
                <div className="grid grid-cols-2 gap-2">
                  {ENGLISH_VOICES.map((voice) => (
                    <button
                      key={voice.id}
                      onClick={() => handleVoiceSelect(voice.id)}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        settings.voiceId === voice.id 
                          ? 'border-primary bg-primary/10 ring-1 ring-primary' 
                          : 'border-border hover:border-primary/50 hover:bg-muted/50'
                      }`}
                    >
                      <div className="font-medium text-sm flex items-center gap-1.5">
                        <span className="text-base">
                          {voice.gender === 'female' ? '♀' : voice.gender === 'male' ? '♂' : '◎'}
                        </span>
                        {voice.name}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {voice.description}
                      </div>
                    </button>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </div>

          <div className="space-y-2">
            <Label>Emotionaler Ton</Label>
            <Select 
              value={settings.emotionalTone} 
              onValueChange={(emotionalTone: typeof settings.emotionalTone) => {
                onSettingsChange({ ...settings, emotionalTone });
                setGeneratedUrl(null);
              }}
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
              onValueChange={([speed]) => {
                onSettingsChange({ ...settings, speed });
                setGeneratedUrl(null);
              }}
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
              onValueChange={([pitch]) => {
                onSettingsChange({ ...settings, pitch });
                setGeneratedUrl(null);
              }}
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

          {/* Audio Player for generated voice-over */}
          {generatedUrl && (
            <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
              <p className="text-sm text-green-600 dark:text-green-400 mb-2 font-medium">
                ✓ Voice-Over generiert
              </p>
              <audio 
                ref={audioRef}
                src={generatedUrl}
                onEnded={handleAudioEnded}
                className="hidden"
              />
            </div>
          )}

          <div className="flex gap-2">
            <Button 
              variant="outline"
              onClick={handlePreview} 
              disabled={isPreviewing || isGenerating || !settings.scriptText}
              className="flex-1 gap-2"
            >
              {isPreviewing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Lädt...
                </>
              ) : generatedUrl ? (
                <>
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  {isPlaying ? 'Pause' : 'Abspielen'}
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
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generiert...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  {generatedUrl ? 'Neu generieren' : 'Voice-Over erstellen'}
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
