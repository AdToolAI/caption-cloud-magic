import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Zap, Briefcase, Heart, Minimize2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useTranslation } from '@/hooks/useTranslation';

export type MoodPresetId = 'energetic' | 'professional' | 'emotional' | 'minimalist' | 'playful';

export interface MoodPreset {
  id: MoodPresetId;
  nameKey: string;
  descKey: string;
  icon: typeof Zap;
  gradient: string;
  textDensity: 'low' | 'medium' | 'high';
  animationIntensity: 'subtle' | 'normal' | 'dynamic';
  pacing: 'slow' | 'medium' | 'fast';
  colorMoodKey: string;
  musicStyle: string;
}

export interface MoodConfig {
  preset: MoodPresetId;
  textDensity: number;
  animationIntensity: number;
  showSceneBadges: boolean;
}

const MOOD_PRESETS: MoodPreset[] = [
  {
    id: 'energetic',
    nameKey: 'mood_energetic',
    descKey: 'mood_energetic_desc',
    icon: Zap,
    gradient: 'from-orange-500 to-red-500',
    textDensity: 'low',
    animationIntensity: 'dynamic',
    pacing: 'fast',
    colorMoodKey: 'mood_energetic_colors',
    musicStyle: 'upbeat',
  },
  {
    id: 'professional',
    nameKey: 'mood_professional',
    descKey: 'mood_professional_desc',
    icon: Briefcase,
    gradient: 'from-blue-600 to-indigo-600',
    textDensity: 'medium',
    animationIntensity: 'normal',
    pacing: 'medium',
    colorMoodKey: 'mood_professional_colors',
    musicStyle: 'corporate',
  },
  {
    id: 'emotional',
    nameKey: 'mood_emotional',
    descKey: 'mood_emotional_desc',
    icon: Heart,
    gradient: 'from-amber-500 to-rose-500',
    textDensity: 'high',
    animationIntensity: 'subtle',
    pacing: 'slow',
    colorMoodKey: 'mood_emotional_colors',
    musicStyle: 'cinematic',
  },
  {
    id: 'minimalist',
    nameKey: 'mood_minimalist',
    descKey: 'mood_minimalist_desc',
    icon: Minimize2,
    gradient: 'from-gray-600 to-gray-800',
    textDensity: 'low',
    animationIntensity: 'subtle',
    pacing: 'slow',
    colorMoodKey: 'mood_minimalist_colors',
    musicStyle: 'ambient',
  },
  {
    id: 'playful',
    nameKey: 'mood_playful',
    descKey: 'mood_playful_desc',
    icon: Sparkles,
    gradient: 'from-pink-500 to-violet-500',
    textDensity: 'medium',
    animationIntensity: 'dynamic',
    pacing: 'fast',
    colorMoodKey: 'mood_playful_colors',
    musicStyle: 'fun',
  },
];

const DENSITY_DEFAULTS: Record<MoodPresetId, number> = {
  energetic: 25,
  professional: 50,
  emotional: 75,
  minimalist: 15,
  playful: 50,
};

const INTENSITY_DEFAULTS: Record<MoodPresetId, number> = {
  energetic: 85,
  professional: 50,
  emotional: 30,
  minimalist: 20,
  playful: 80,
};

interface MoodPresetSelectorProps {
  onConfirm: (config: MoodConfig) => void;
}

export function MoodPresetSelector({ onConfirm }: MoodPresetSelectorProps) {
  const { t } = useTranslation();
  const [selectedPreset, setSelectedPreset] = useState<MoodPresetId | null>(null);
  const [textDensity, setTextDensity] = useState(50);
  const [animationIntensity, setAnimationIntensity] = useState(50);
  const [showSceneBadges, setShowSceneBadges] = useState(true);

  const handlePresetSelect = (presetId: MoodPresetId) => {
    setSelectedPreset(presetId);
    setTextDensity(DENSITY_DEFAULTS[presetId]);
    setAnimationIntensity(INTENSITY_DEFAULTS[presetId]);
  };

  const handleConfirm = () => {
    if (!selectedPreset) return;
    onConfirm({
      preset: selectedPreset,
      textDensity,
      animationIntensity,
      showSceneBadges,
    });
  };

  const getDensityLabel = (val: number) => val < 33 ? t('uvc.densityLow') : val < 66 ? t('uvc.densityMedium') : t('uvc.densityHigh');
  const getIntensityLabel = (val: number) => val < 33 ? t('uvc.intensitySubtle') : val < 66 ? t('uvc.intensityNormal') : t('uvc.intensityDynamic');

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-foreground">{t('uvc.moodTitle')}</h2>
        <p className="text-muted-foreground">
          {t('uvc.moodDesc')}
        </p>
      </div>

      {/* Preset Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {MOOD_PRESETS.map((preset, index) => {
          const Icon = preset.icon;
          const isSelected = selectedPreset === preset.id;
          const name = t(`uvc.${preset.nameKey}`);
          const desc = t(`uvc.${preset.descKey}`);

          return (
            <motion.button
              key={preset.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              onClick={() => handlePresetSelect(preset.id)}
              className={cn(
                'relative flex flex-col items-center gap-3 p-4 rounded-xl border backdrop-blur-sm transition-all text-center',
                isSelected
                  ? 'border-primary ring-2 ring-primary/30 bg-primary/10'
                  : 'border-border/50 bg-card/40 hover:border-border hover:bg-card/60'
              )}
            >
              {isSelected && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute top-2 right-2 p-0.5 rounded-full bg-primary"
                >
                  <Check className="w-3 h-3 text-primary-foreground" />
                </motion.div>
              )}

              <div className={cn(
                'w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br',
                preset.gradient,
              )}>
                <Icon className="w-6 h-6 text-white" />
              </div>

              <div>
                <div className="text-sm font-semibold text-foreground">{name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Fine-tuning sliders */}
      {selectedPreset && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="space-y-6 p-6 rounded-xl bg-card/40 border border-border/50 backdrop-blur-sm"
        >
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">{t('uvc.finetuning')}</h3>

          {/* Text Density */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>{t('uvc.textAmount')}</Label>
              <span className="text-xs text-muted-foreground font-medium">{getDensityLabel(textDensity)}</span>
            </div>
            <Slider
              value={[textDensity]}
              onValueChange={([v]) => setTextDensity(v)}
              max={100}
              step={1}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{t('uvc.densityLow')}</span>
              <span>{t('uvc.densityHigh')}</span>
            </div>
          </div>

          {/* Animation Intensity */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>{t('uvc.animIntensity')}</Label>
              <span className="text-xs text-muted-foreground font-medium">{getIntensityLabel(animationIntensity)}</span>
            </div>
            <Slider
              value={[animationIntensity]}
              onValueChange={([v]) => setAnimationIntensity(v)}
              max={100}
              step={1}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{t('uvc.intensitySubtle')}</span>
              <span>{t('uvc.intensityDynamic')}</span>
            </div>
          </div>

          {/* Scene Badges Toggle */}
          <div className="flex items-center justify-between">
            <Label>{t('uvc.sceneBadges')}</Label>
            <Switch checked={showSceneBadges} onCheckedChange={setShowSceneBadges} />
          </div>
        </motion.div>
      )}

      {/* Confirm Button */}
      {selectedPreset && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex justify-center"
        >
          <button
            onClick={handleConfirm}
            className={cn(
              'px-8 py-3 rounded-xl font-semibold text-black',
              'bg-gradient-to-r from-[hsl(var(--primary))] to-amber-500',
              'hover:shadow-[0_0_30px_hsl(var(--primary)/0.4)]',
              'transition-all duration-300',
            )}
          >
            {t('uvc.continueWith')} {t(`uvc.${MOOD_PRESETS.find(p => p.id === selectedPreset)?.nameKey || ''}`)}
          </button>
        </motion.div>
      )}
    </div>
  );
}

export { MOOD_PRESETS };
