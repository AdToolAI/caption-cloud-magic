import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Loader2, Volume2, Play, Pause, Upload, Sparkles, Info } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { VoiceoverScriptGenerator } from '@/components/universal-creator/VoiceoverScriptGenerator';
import { useTranslation } from '@/hooks/useTranslation';
import { sortVoicesPremiumFirst } from '@/lib/elevenlabs-voices';
import { VoicePreviewButton } from '@/components/voices/VoicePreviewButton';
import type { ContentConfig, VoiceoverConfig } from '@/types/universal-creator';
import type { Scene } from '@/types/scene';

interface ContentVoiceStepProps {
  value: ContentConfig | null;
  onChange: (config: ContentConfig) => void;
  projectId: string;
  scenes?: Scene[];
}

interface Voice {
  id: string;
  name: string;
  language: string;
  accent?: string;
  gender?: string;
  age?: string;
  description?: string;
  tier?: string;
  recommended_model?: string;
  recommended_settings?: {
    stability: number;
    similarity_boost: number;
    style: number;
    use_speaker_boost: boolean;
  };
  supportedLanguages?: string[];
}

export const ContentVoiceStep = ({ value, onChange, projectId, scenes }: ContentVoiceStepProps) => {
  const { toast } = useToast();
  const { t, language } = useTranslation();
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(true);
  const [selectedLanguage, setSelectedLanguage] = useState<string>(language === 'en' ? 'en' : 'de');
  const [showScriptGenerator, setShowScriptGenerator] = useState(false);
  const [useVoiceover, setUseVoiceover] = useState(value?.useVoiceover !== false);

  const [voiceConfig, setVoiceConfig] = useState<VoiceoverConfig>({
    voiceId: '9BWtsMINqrJLrRacOk9x',
    voiceName: 'Aria',
    modelId: 'eleven_turbo_v2_5',
    stability: 0.5,
    similarityBoost: 0.75,
    speed: 1.0,
  });

  const handleVoiceoverToggle = (enabled: boolean) => {
    setUseVoiceover(enabled);
    if (!enabled) {
      onChange({ scriptText: undefined, voiceoverUrl: undefined, voiceoverDuration: undefined, voiceoverConfig: undefined, actualVoiceoverDuration: undefined, useVoiceover: false });
    } else {
      onChange({ ...(value || {} as ContentConfig), useVoiceover: true });
    }
  };

  useEffect(() => {
    const loadVoices = async () => {
      setLoadingVoices(true);
      try {
        const { data, error } = await supabase.functions.invoke('list-voices', { body: { language: 'all' } });
        if (error) {
          toast({ title: t('uc.errorLoadingVoices'), description: t('uc.errorLoadingVoicesDesc'), variant: 'destructive' });
          return;
        }
        setVoices(sortVoicesPremiumFirst(data.voices || []));
      } catch (err) {
        console.error('Failed to load voices:', err);
      } finally {
        setLoadingVoices(false);
      }
    };
    loadVoices();
  }, [toast]);

  useEffect(() => {
    if (value?.voiceoverUrl && audio) {
      audio.pause();
      setAudio(null);
      setIsPlaying(false);
    }
  }, [value?.voiceoverUrl]);

  const handleScriptChange = useCallback((text: string) => {
    onChange({ ...(value || {} as ContentConfig), scriptText: text });
  }, [value, onChange]);

  const handleGenerateVoiceover = async () => {
    if (!value?.scriptText || value.scriptText.trim().length === 0) {
      toast({ title: t('uc.errorNoText'), description: t('uc.errorNoTextDesc'), variant: 'destructive' });
      return;
    }
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-voiceover', {
        body: { text: value.scriptText, voiceId: voiceConfig.voiceId, modelId: voiceConfig.modelId, stability: voiceConfig.stability, similarityBoost: voiceConfig.similarityBoost, speed: voiceConfig.speed, projectId },
      });
      if (error) throw error;
      if (data.success) {
        onChange({ ...value, voiceoverUrl: data.audioUrl, voiceoverConfig: voiceConfig, voiceoverDuration: data.duration });
        toast({ title: t('uc.successVoiceover'), description: t('uc.successVoiceoverDesc') });
      }
    } catch (error) {
      console.error('Error generating voiceover:', error);
      toast({ title: t('uc.errorVoiceover'), description: t('uc.errorVoiceoverDesc'), variant: 'destructive' });
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
      if (isPlaying) { audio.pause(); setIsPlaying(false); }
      else { audio.play(); setIsPlaying(true); }
    }
  };

  const charCount = value?.scriptText?.length || 0;
  const wordCount = value?.scriptText?.split(/\s+/).filter(Boolean).length || 0;
  const estimatedDuration = Math.ceil((wordCount / 150) * 60);
  const filteredVoices = voices.filter((v) =>
    v.language === selectedLanguage || (v.supportedLanguages || []).includes(selectedLanguage)
  );

  const TIPS: Record<string, string> = {
    de: '💡 Premium-Stimmen klingen am natürlichsten. Tipp: Nutze Satzzeichen für realistische Pausen.',
    en: '💡 Premium voices sound most natural. Tip: Use punctuation for realistic pauses.',
    es: '💡 Las voces premium suenan más naturales. Consejo: usa puntuación para pausas realistas.',
  };

  const voiceoverUrlRef = useRef<string | undefined>();
  useEffect(() => {
    const currentUrl = value?.voiceoverUrl;
    if (!currentUrl || currentUrl === voiceoverUrlRef.current) return;
    voiceoverUrlRef.current = currentUrl;
    const tempAudio = new Audio(currentUrl);
    const handleMetadata = () => {
      const actualDuration = Math.ceil(tempAudio.duration);
      if (actualDuration > 0 && actualDuration !== value?.actualVoiceoverDuration) {
        onChange({ ...value, voiceoverDuration: actualDuration, actualVoiceoverDuration: actualDuration });
      }
    };
    tempAudio.addEventListener('loadedmetadata', handleMetadata);
    tempAudio.addEventListener('error', (e) => console.error('Error loading audio metadata:', e));
    return () => { tempAudio.removeEventListener('loadedmetadata', handleMetadata); tempAudio.src = ''; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.voiceoverUrl]);

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="use-voiceover" className="text-base">{t('uc.useVoiceover')}</Label>
            <p className="text-sm text-muted-foreground">{t('uc.addSpokenText')}</p>
          </div>
          <Switch id="use-voiceover" checked={useVoiceover} onCheckedChange={handleVoiceoverToggle} />
        </div>
      </Card>

      {!useVoiceover ? (
        <Card className="p-6 bg-muted/50">
          <div className="space-y-3">
            <h3 className="text-lg font-semibold">{t('uc.videoWithoutNarration')}</h3>
            <p className="text-sm text-muted-foreground">{t('uc.videoWithoutNarrationDesc')}</p>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 ml-2">
              <li>{t('uc.addScenesAndVisuals')}</li>
              <li>{t('uc.selectBackgroundMusic')}</li>
              <li>{t('uc.createTextOverlays')}</li>
            </ul>
          </div>
        </Card>
      ) : (
        <>
          <Card className="p-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Label htmlFor="script">{t('uc.videoScript')}</Label>
                  <Button variant="ghost" size="sm" onClick={() => setShowScriptGenerator(true)} className="h-7 px-2">
                    <Sparkles className="w-3 h-3 mr-1" />
                    {t('uc.generateScript')}
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground">
                  {charCount} {t('uc.characters')} • {wordCount} {t('uc.words')} • ~{estimatedDuration}s
                </div>
              </div>
              <Textarea id="script" placeholder={t('uc.writeYourScript')} value={value?.scriptText || ''} onChange={(e) => handleScriptChange(e.target.value)} className="min-h-[200px] font-mono text-sm" />
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">{t('uc.voiceoverSettings')}</h3>
            <div className="space-y-6">
              <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20 text-xs text-muted-foreground">
                <Info className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                <span>{TIPS[language] || TIPS.en}</span>
              </div>

              <div className="space-y-2">
                <Label>{t('uc.languageLabel')}</Label>
                <Tabs value={selectedLanguage} onValueChange={setSelectedLanguage}>
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="de" disabled={loadingVoices}>🇩🇪 DE {!loadingVoices && `(${voices.filter(v => v.language === 'de' || (v.supportedLanguages || []).includes('de')).length})`}</TabsTrigger>
                    <TabsTrigger value="en" disabled={loadingVoices}>🇬🇧 EN {!loadingVoices && `(${voices.filter(v => v.language === 'en' || (v.supportedLanguages || []).includes('en')).length})`}</TabsTrigger>
                    <TabsTrigger value="es" disabled={loadingVoices}>🇪🇸 ES {!loadingVoices && `(${voices.filter(v => v.language === 'es' || (v.supportedLanguages || []).includes('es')).length})`}</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              <div className="space-y-2">
                <Label>{t('uc.selectVoice')}</Label>
                <div className="flex items-center gap-2">
                  <Select
                    value={voiceConfig.voiceId}
                    onValueChange={(voiceId) => {
                      const voice = filteredVoices.find((v) => v.id === voiceId);
                      const newCfg = {
                        ...voiceConfig,
                        voiceId,
                        voiceName: voice?.name || 'Voice',
                        modelId: voice?.recommended_model || voiceConfig.modelId,
                        stability: voice?.recommended_settings?.stability ?? voiceConfig.stability,
                        similarityBoost: voice?.recommended_settings?.similarity_boost ?? voiceConfig.similarityBoost,
                      };
                      setVoiceConfig(newCfg);
                    }}
                    disabled={loadingVoices || filteredVoices.length === 0}
                  >
                    <SelectTrigger className="flex-1"><SelectValue placeholder={loadingVoices ? t('uc.loadingVoices') : t('uc.chooseAVoice')} /></SelectTrigger>
                    <SelectContent>
                      {filteredVoices.map((voice) => (
                        <SelectItem key={voice.id} value={voice.id}>
                          <span className="flex items-center gap-2">
                            {voice.tier === 'premium' && (
                              <Badge variant="secondary" className="text-[9px] h-4 px-1 bg-primary/15 text-primary border-primary/20">Premium</Badge>
                            )}
                            <span>{voice.name}</span>
                            {voice.gender && <span className="text-xs text-muted-foreground">({voice.gender})</span>}
                            {voice.accent && voice.accent !== 'neutral' && <span className="text-xs text-muted-foreground">— {voice.accent}</span>}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {voiceConfig.voiceId && (
                    <VoicePreviewButton voiceId={voiceConfig.voiceId} language={selectedLanguage} size="sm" className="shrink-0" />
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t('uc.model')}</Label>
                <Select value={voiceConfig.modelId} onValueChange={(modelId) => setVoiceConfig({ ...voiceConfig, modelId })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="eleven_turbo_v2_5">{t('uc.turboV25')}</SelectItem>
                    <SelectItem value="eleven_multilingual_v2">{t('uc.multilingualV2')}</SelectItem>
                    <SelectItem value="eleven_turbo_v2">{t('uc.turboV2')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between"><Label>{t('uc.stability')}</Label><span className="text-sm text-muted-foreground">{voiceConfig.stability.toFixed(2)}</span></div>
                <Slider value={[voiceConfig.stability]} onValueChange={([stability]) => setVoiceConfig({ ...voiceConfig, stability })} min={0} max={1} step={0.01} />
                <p className="text-xs text-muted-foreground">{t('uc.stabilityDesc')}</p>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between"><Label>{t('uc.similarity')}</Label><span className="text-sm text-muted-foreground">{voiceConfig.similarityBoost.toFixed(2)}</span></div>
                <Slider value={[voiceConfig.similarityBoost]} onValueChange={([similarityBoost]) => setVoiceConfig({ ...voiceConfig, similarityBoost })} min={0} max={1} step={0.01} />
                <p className="text-xs text-muted-foreground">{t('uc.similarityDesc')}</p>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between"><Label>{t('uc.speed')}</Label><span className="text-sm text-muted-foreground">{voiceConfig.speed.toFixed(1)}x</span></div>
                <Slider value={[voiceConfig.speed]} onValueChange={([speed]) => setVoiceConfig({ ...voiceConfig, speed })} min={0.7} max={1.2} step={0.1} />
                <p className="text-xs text-muted-foreground">{t('uc.speedDesc')}</p>
              </div>

              <Button onClick={handleGenerateVoiceover} disabled={isGenerating || !value?.scriptText} className="w-full">
                {isGenerating ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t('uc.generatingVoiceover')}</>) : (<><Volume2 className="mr-2 h-4 w-4" />{t('uc.generateVoiceover')}</>)}
              </Button>
            </div>
          </Card>

          {value?.voiceoverUrl && (
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">{t('uc.audioPreview')}</h3>
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <Button size="lg" variant="outline" onClick={handlePlayPause} className="w-16 h-16 rounded-full">
                    {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 ml-1" />}
                  </Button>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{voiceConfig.voiceName} • {voiceConfig.modelId}</p>
                    <p className="text-xs text-muted-foreground">{t('uc.duration')}: {value.voiceoverDuration}s</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label className="flex items-center gap-1.5"><Volume2 className="h-3.5 w-3.5" />{t('uc.voiceoverVolume')}</Label>
                    <span className="text-sm text-muted-foreground">{Math.round((value.voiceoverVolume ?? 1) * 100)}%</span>
                  </div>
                  <Slider value={[Math.round((value.voiceoverVolume ?? 1) * 100)]} onValueChange={([v]) => { const vol = v / 100; onChange({ ...value, voiceoverVolume: vol }); if (audio) audio.volume = vol; }} min={0} max={100} step={1} />
                </div>
                <div className="p-4 bg-muted/50 rounded-lg">
                  <audio src={value.voiceoverUrl} preload="metadata" />
                  <p className="text-xs text-muted-foreground">Audio URL: {value.voiceoverUrl.substring(0, 50)}...</p>
                </div>
              </div>
            </Card>
          )}

          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">{t('uc.orUploadAudio')}</h3>
            <Button variant="outline" className="w-full" disabled>
              <Upload className="mr-2 h-4 w-4" />
              {t('uc.uploadAudioFile')}
            </Button>
          </Card>

          <VoiceoverScriptGenerator
            open={showScriptGenerator}
            onClose={() => setShowScriptGenerator(false)}
            onScriptGenerated={(script) => { handleScriptChange(script); setShowScriptGenerator(false); }}
          />
        </>
      )}
    </div>
  );
};
