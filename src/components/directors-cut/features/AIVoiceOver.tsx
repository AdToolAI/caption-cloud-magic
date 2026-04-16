import { useState, useRef, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Mic, Sparkles, Play, Volume2, Pause, Loader2, Info } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useTranslation } from '@/hooks/useTranslation';
import { sortVoicesPremiumFirst, type VoiceMeta } from '@/lib/elevenlabs-voices';

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

const EMOTIONAL_TONES = [
  { id: 'neutral', name: 'Neutral' },
  { id: 'enthusiastic', name: 'Enthusiastisch' },
  { id: 'calm', name: 'Ruhig' },
  { id: 'serious', name: 'Seriös' },
  { id: 'friendly', name: 'Freundlich' },
];

const TIPS: Record<string, string> = {
  de: '💡 Premium-Stimmen klingen am natürlichsten. Tipp: Nutze Satzzeichen (Komma, Punkt) für realistische Pausen.',
  en: '💡 Premium voices sound most natural. Tip: Use punctuation (commas, periods) for realistic pauses.',
  es: '💡 Las voces premium suenan más naturales. Consejo: usa puntuación (comas, puntos) para pausas realistas.',
};

export function AIVoiceOver({ settings, onSettingsChange, onVoiceOverGenerated, projectId }: AIVoiceOverProps) {
  const { language: uiLang } = useTranslation();
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedLanguageTab, setSelectedLanguageTab] = useState<'de' | 'en' | 'es'>(
    uiLang === 'en' ? 'en' : uiLang === 'es' ? 'es' : 'de'
  );
  const [voices, setVoices] = useState<VoiceMeta[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Load voices dynamically (premium + account)
  useEffect(() => {
    (async () => {
      setLoadingVoices(true);
      try {
        const { data, error } = await supabase.functions.invoke('list-voices', { body: { language: 'all' } });
        if (error) throw error;
        const sorted = sortVoicesPremiumFirst<VoiceMeta>(data?.voices || []);
        setVoices(sorted);
      } catch (err) {
        console.error('Failed to load voices:', err);
        toast.error('Stimmen konnten nicht geladen werden');
      } finally {
        setLoadingVoices(false);
      }
    })();
  }, []);

  const voicesForLang = (lang: 'de' | 'en' | 'es') =>
    voices.filter((v) => (v.supportedLanguages || [v.language]).includes(lang));

  const currentTabVoices = voicesForLang(selectedLanguageTab);

  // Auto-select first voice when switching tabs if current is not in tab
  useEffect(() => {
    if (loadingVoices || currentTabVoices.length === 0) return;
    if (!currentTabVoices.find((v) => v.id === settings.voiceId)) {
      const newLang = selectedLanguageTab === 'de' ? 'de-DE' : selectedLanguageTab === 'es' ? 'es-ES' : 'en-US';
      onSettingsChange({ ...settings, voiceId: currentTabVoices[0].id, language: newLang });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLanguageTab, loadingVoices, voices.length]);

  const handleGenerate = async () => {
    if (!settings.scriptText.trim()) {
      toast.error('Bitte gib einen Text für das Voice-Over ein');
      return;
    }
    setIsGenerating(true);
    try {
      const selectedVoice = voices.find((v) => v.id === settings.voiceId);
      const { data, error } = await supabase.functions.invoke('director-cut-voice-over', {
        body: {
          script_text: settings.scriptText,
          voice_id: settings.voiceId,
          language: settings.language,
          speed: settings.speed,
          project_id: projectId,
          model_id: selectedVoice?.recommended_model,
          voice_settings: selectedVoice?.recommended_settings,
        },
      });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }
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
    if (generatedUrl && audioRef.current) {
      if (isPlaying) { audioRef.current.pause(); setIsPlaying(false); }
      else { audioRef.current.play(); setIsPlaying(true); }
      return;
    }
    await handleGenerate();
  };

  const handleVoiceSelect = (voiceId: string) => {
    const voice = voices.find((v) => v.id === voiceId);
    const lang = voice?.language || selectedLanguageTab;
    const newLanguage = lang === 'de' ? 'de-DE' : lang === 'es' ? 'es-ES' : 'en-US';
    onSettingsChange({ ...settings, voiceId, language: newLanguage });
    setGeneratedUrl(null);
  };

  const estimatedDuration = Math.ceil(settings.scriptText.length / 15 / settings.speed);

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
              onChange={(e) => { onSettingsChange({ ...settings, scriptText: e.target.value }); setGeneratedUrl(null); }}
              placeholder="Gib hier deinen Voice-Over Text ein..."
              rows={4}
            />
            <p className="text-xs text-muted-foreground text-right">
              {settings.scriptText.length} Zeichen • ~{estimatedDuration} Sekunden
            </p>
          </div>

          {/* Premium tip banner */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
            <span>{TIPS[uiLang] || TIPS.en}</span>
          </div>

          <div className="space-y-3">
            <Label>Sprache & Stimme</Label>
            <Tabs value={selectedLanguageTab} onValueChange={(v) => setSelectedLanguageTab(v as 'de' | 'en' | 'es')}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="de">🇩🇪 DE ({voicesForLang('de').length})</TabsTrigger>
                <TabsTrigger value="en">🇬🇧 EN ({voicesForLang('en').length})</TabsTrigger>
                <TabsTrigger value="es">🇪🇸 ES ({voicesForLang('es').length})</TabsTrigger>
              </TabsList>

              {(['de', 'en', 'es'] as const).map((lang) => (
                <TabsContent key={lang} value={lang} className="mt-3">
                  {loadingVoices ? (
                    <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin mr-2" /> Lade Stimmen…
                    </div>
                  ) : voicesForLang(lang).length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">Keine Stimmen verfügbar</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
                      {voicesForLang(lang).map((voice) => (
                        <button
                          key={voice.id}
                          onClick={() => handleVoiceSelect(voice.id)}
                          className={`p-3 rounded-lg border text-left transition-all ${
                            settings.voiceId === voice.id
                              ? 'border-primary bg-primary/10 ring-1 ring-primary'
                              : 'border-border hover:border-primary/50 hover:bg-muted/50'
                          }`}
                        >
                          <div className="font-medium text-sm flex items-center gap-1.5 flex-wrap">
                            <span className="text-base">
                              {voice.gender === 'female' ? '♀' : voice.gender === 'male' ? '♂' : '◎'}
                            </span>
                            <span className="truncate">{voice.name}</span>
                            {voice.tier === 'premium' && (
                              <Badge variant="secondary" className="text-[9px] h-4 px-1 bg-primary/15 text-primary border-primary/20">
                                Premium
                              </Badge>
                            )}
                          </div>
                          {voice.description && (
                            <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                              {voice.description}
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </TabsContent>
              ))}
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
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {EMOTIONAL_TONES.map((tone) => (
                  <SelectItem key={tone.id} value={tone.id}>{tone.name}</SelectItem>
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
              onValueChange={([speed]) => { onSettingsChange({ ...settings, speed }); setGeneratedUrl(null); }}
              min={0.7} max={1.2} step={0.05}
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
              max={100} step={5}
            />
          </div>

          {generatedUrl && (
            <div className="p-3 bg-success/10 border border-success/20 rounded-lg">
              <p className="text-sm text-success mb-2 font-medium">✓ Voice-Over generiert</p>
              <audio ref={audioRef} src={generatedUrl} onEnded={() => setIsPlaying(false)} className="hidden" />
            </div>
          )}

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handlePreview}
              disabled={isGenerating || !settings.scriptText}
              className="flex-1 gap-2"
            >
              {generatedUrl ? (
                <>{isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}{isPlaying ? 'Pause' : 'Abspielen'}</>
              ) : (
                <><Play className="h-4 w-4" />Vorschau</>
              )}
            </Button>
            <Button onClick={handleGenerate} disabled={isGenerating || !settings.scriptText} className="flex-1 gap-2">
              {isGenerating ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Generiert...</>
              ) : (
                <><Sparkles className="h-4 w-4" />{generatedUrl ? 'Neu generieren' : 'Voice-Over erstellen'}</>
              )}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
