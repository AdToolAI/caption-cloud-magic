import { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Mic, Languages, Gauge, Smile, Frown, Meh, 
  Sparkles, Volume2, Info, RefreshCw, Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { ScriptScene, ExplainerLanguage } from '@/types/explainer-studio';

// Extended language options including Swiss German
export type ExtendedLanguage = ExplainerLanguage | 'nl' | 'de-ch' | 'pl' | 'ru' | 'ja' | 'ko' | 'zh';

export interface LanguageOption {
  code: ExtendedLanguage;
  name: string;
  nativeName: string;
  flag: string;
}

export const EXTENDED_LANGUAGES: LanguageOption[] = [
  { code: 'de', name: 'Deutsch', nativeName: 'Deutsch', flag: '🇩🇪' },
  { code: 'de-ch', name: 'Schweizerdeutsch', nativeName: 'Schwizerdütsch', flag: '🇨🇭' },
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧' },
  { code: 'es', name: 'Spanisch', nativeName: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: 'Französisch', nativeName: 'Français', flag: '🇫🇷' },
  { code: 'it', name: 'Italienisch', nativeName: 'Italiano', flag: '🇮🇹' },
  { code: 'pt', name: 'Portugiesisch', nativeName: 'Português', flag: '🇵🇹' },
  { code: 'nl', name: 'Niederländisch', nativeName: 'Nederlands', flag: '🇳🇱' },
  { code: 'pl', name: 'Polnisch', nativeName: 'Polski', flag: '🇵🇱' },
  { code: 'ru', name: 'Russisch', nativeName: 'Русский', flag: '🇷🇺' },
  { code: 'ja', name: 'Japanisch', nativeName: '日本語', flag: '🇯🇵' },
  { code: 'ko', name: 'Koreanisch', nativeName: '한국어', flag: '🇰🇷' },
  { code: 'zh', name: 'Chinesisch', nativeName: '中文', flag: '🇨🇳' },
];

// Emotional tone options per scene
export type EmotionalTone = 'neutral' | 'excited' | 'serious' | 'warm' | 'urgent' | 'calm';

export interface EmotionOption {
  id: EmotionalTone;
  label: string;
  icon: React.ReactNode;
  description: string;
}

export const EMOTION_OPTIONS: EmotionOption[] = [
  { id: 'neutral', label: 'Neutral', icon: <Meh className="h-4 w-4" />, description: 'Ausgeglichen und sachlich' },
  { id: 'excited', label: 'Begeistert', icon: <Smile className="h-4 w-4" />, description: 'Energetisch und enthusiastisch' },
  { id: 'serious', label: 'Seriös', icon: <Frown className="h-4 w-4" />, description: 'Professionell und ernst' },
  { id: 'warm', label: 'Warm', icon: <Sparkles className="h-4 w-4" />, description: 'Freundlich und einladend' },
  { id: 'urgent', label: 'Dringend', icon: <Gauge className="h-4 w-4" />, description: 'Wichtig und handlungsorientiert' },
  { id: 'calm', label: 'Ruhig', icon: <Volume2 className="h-4 w-4" />, description: 'Entspannt und beruhigend' },
];

// Scene-based voice config
export interface SceneVoiceConfig {
  sceneId: string;
  emotionalTone: EmotionalTone;
  speed: number; // 0.7 - 1.3
  emphasis: number; // 0 - 100 for emphasis strength
}

interface EnhancedVoiceSettingsProps {
  scenes: ScriptScene[];
  language: ExtendedLanguage;
  globalSpeed: number;
  sceneConfigs: SceneVoiceConfig[];
  onLanguageChange: (lang: ExtendedLanguage) => void;
  onGlobalSpeedChange: (speed: number) => void;
  onSceneConfigChange: (configs: SceneVoiceConfig[]) => void;
  onGenerateSceneVoiceover: (sceneId: string, config: SceneVoiceConfig) => Promise<void>;
}

export function EnhancedVoiceSettings({
  scenes,
  language,
  globalSpeed,
  sceneConfigs,
  onLanguageChange,
  onGlobalSpeedChange,
  onSceneConfigChange,
  onGenerateSceneVoiceover
}: EnhancedVoiceSettingsProps) {
  const [activeSceneId, setActiveSceneId] = useState<string | null>(scenes[0]?.id || null);
  const [generatingSceneId, setGeneratingSceneId] = useState<string | null>(null);

  const activeScene = scenes.find(s => s.id === activeSceneId);
  const activeConfig = sceneConfigs.find(c => c.sceneId === activeSceneId) || {
    sceneId: activeSceneId || '',
    emotionalTone: 'neutral' as EmotionalTone,
    speed: globalSpeed,
    emphasis: 50
  };

  const handleUpdateSceneConfig = (updates: Partial<SceneVoiceConfig>) => {
    if (!activeSceneId) return;

    const existingIndex = sceneConfigs.findIndex(c => c.sceneId === activeSceneId);
    const newConfig = {
      ...activeConfig,
      sceneId: activeSceneId,
      ...updates
    };

    if (existingIndex >= 0) {
      const updated = [...sceneConfigs];
      updated[existingIndex] = newConfig;
      onSceneConfigChange(updated);
    } else {
      onSceneConfigChange([...sceneConfigs, newConfig]);
    }
  };

  const handleGeneratePreview = async () => {
    if (!activeSceneId) return;
    setGeneratingSceneId(activeSceneId);
    try {
      await onGenerateSceneVoiceover(activeSceneId, activeConfig);
      toast.success('Szenen-Vorschau generiert');
    } catch (error) {
      toast.error('Fehler bei der Vorschau-Generierung');
    } finally {
      setGeneratingSceneId(null);
    }
  };

  // Auto-suggest emotion based on scene type
  const getSuggestedEmotion = (sceneType: string): EmotionalTone => {
    switch (sceneType) {
      case 'hook': return 'excited';
      case 'problem': return 'serious';
      case 'solution': return 'warm';
      case 'feature': return 'neutral';
      case 'proof': return 'warm';
      case 'cta': return 'urgent';
      default: return 'neutral';
    }
  };

  return (
    <div className="space-y-6">
      {/* Language Selection */}
      <Card className="bg-card/60 backdrop-blur-xl border-white/10">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Languages className="h-5 w-5 text-primary" />
            Sprache
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
            {EXTENDED_LANGUAGES.map(lang => (
              <button
                key={lang.code}
                onClick={() => onLanguageChange(lang.code)}
                className={cn(
                  "flex flex-col items-center gap-1 p-3 rounded-lg border transition-all",
                  language === lang.code
                    ? "bg-primary/20 border-primary/50"
                    : "bg-muted/20 border-white/10 hover:bg-muted/40"
                )}
              >
                <span className="text-2xl">{lang.flag}</span>
                <span className="text-xs font-medium">{lang.name}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Global Speed Control */}
      <Card className="bg-card/60 backdrop-blur-xl border-white/10">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Gauge className="h-5 w-5 text-primary" />
            Basis-Sprechgeschwindigkeit
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-4 w-4 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  Wird für alle Szenen als Ausgangswert verwendet
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">0.7x</span>
            <Slider
              value={[globalSpeed]}
              onValueChange={([v]) => onGlobalSpeedChange(v)}
              min={0.7}
              max={1.3}
              step={0.05}
              className="flex-1"
            />
            <span className="text-sm text-muted-foreground">1.3x</span>
            <Badge variant="secondary" className="font-mono">
              {globalSpeed.toFixed(2)}x
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Per-Scene Emotional Settings */}
      <Card className="bg-card/60 backdrop-blur-xl border-white/10">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Emotionale Betonung pro Szene
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Scene Selector */}
          <div className="flex gap-2 overflow-x-auto pb-2">
            {scenes.map((scene, index) => {
              const config = sceneConfigs.find(c => c.sceneId === scene.id);
              const hasCustomConfig = !!config;
              
              return (
                <button
                  key={scene.id}
                  onClick={() => setActiveSceneId(scene.id)}
                  className={cn(
                    "flex-shrink-0 px-4 py-2 rounded-lg border transition-all text-sm",
                    activeSceneId === scene.id
                      ? "bg-primary/20 border-primary/50 text-primary"
                      : "bg-muted/20 border-white/10 hover:bg-muted/40"
                  )}
                >
                  <span className="font-medium">Szene {index + 1}</span>
                  {hasCustomConfig && (
                    <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs">
                      ✓
                    </Badge>
                  )}
                </button>
              );
            })}
          </div>

          {activeScene && (
            <motion.div
              key={activeSceneId}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              {/* Scene Info */}
              <div className="p-3 rounded-lg bg-muted/20 border border-white/10">
                <div className="flex items-center justify-between mb-2">
                  <Badge variant="outline" className="capitalize">{activeScene.type}</Badge>
                  <span className="text-xs text-muted-foreground">{activeScene.durationSeconds}s</span>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2">{activeScene.spokenText}</p>
              </div>

              {/* Emotion Selection */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Emotionale Betonung</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleUpdateSceneConfig({ emotionalTone: getSuggestedEmotion(activeScene.type) })}
                    className="text-xs text-primary"
                  >
                    <Sparkles className="h-3 w-3 mr-1" />
                    KI-Empfehlung
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {EMOTION_OPTIONS.map(emotion => (
                    <button
                      key={emotion.id}
                      onClick={() => handleUpdateSceneConfig({ emotionalTone: emotion.id })}
                      className={cn(
                        "flex flex-col items-center gap-1 p-3 rounded-lg border transition-all",
                        activeConfig.emotionalTone === emotion.id
                          ? "bg-primary/20 border-primary/50"
                          : "bg-muted/20 border-white/10 hover:bg-muted/40"
                      )}
                    >
                      {emotion.icon}
                      <span className="text-xs font-medium">{emotion.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Scene Speed Override */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Szenen-Geschwindigkeit</span>
                  <Badge variant="secondary" className="font-mono">
                    {activeConfig.speed.toFixed(2)}x
                  </Badge>
                </div>
                <Slider
                  value={[activeConfig.speed]}
                  onValueChange={([v]) => handleUpdateSceneConfig({ speed: v })}
                  min={0.7}
                  max={1.3}
                  step={0.05}
                  className="w-full"
                />
              </div>

              {/* Emphasis Strength */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Betonungsstärke</span>
                  <Badge variant="secondary">{activeConfig.emphasis}%</Badge>
                </div>
                <Slider
                  value={[activeConfig.emphasis]}
                  onValueChange={([v]) => handleUpdateSceneConfig({ emphasis: v })}
                  min={0}
                  max={100}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Höhere Werte = stärkere emotionale Variation
                </p>
              </div>

              {/* Preview Button */}
              <Button
                onClick={handleGeneratePreview}
                disabled={generatingSceneId === activeSceneId}
                className="w-full"
                variant="outline"
              >
                {generatingSceneId === activeSceneId ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generiere Vorschau...
                  </>
                ) : (
                  <>
                    <Mic className="h-4 w-4 mr-2" />
                    Szene vorhören
                  </>
                )}
              </Button>
            </motion.div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
