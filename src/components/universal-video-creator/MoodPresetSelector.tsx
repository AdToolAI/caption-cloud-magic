import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Zap, Briefcase, Heart, Minimize2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

export type MoodPresetId = 'energetic' | 'professional' | 'emotional' | 'minimalist' | 'playful';

export interface MoodPreset {
  id: MoodPresetId;
  name: string;
  description: string;
  icon: typeof Zap;
  gradient: string;
  textDensity: 'low' | 'medium' | 'high';
  animationIntensity: 'subtle' | 'normal' | 'dynamic';
  pacing: 'slow' | 'medium' | 'fast';
  colorMood: string;
  musicStyle: string;
}

export interface MoodConfig {
  preset: MoodPresetId;
  textDensity: number; // 0-100
  animationIntensity: number; // 0-100
  showSceneBadges: boolean;
}

const MOOD_PRESETS: MoodPreset[] = [
  {
    id: 'energetic',
    name: 'Energetisch',
    description: 'Schnell, kräftig, große Headlines',
    icon: Zap,
    gradient: 'from-orange-500 to-red-500',
    textDensity: 'low',
    animationIntensity: 'dynamic',
    pacing: 'fast',
    colorMood: 'Neon, kräftige Farben, hoher Kontrast',
    musicStyle: 'upbeat',
  },
  {
    id: 'professional',
    name: 'Professionell',
    description: 'Strukturiert, Business-Qualität',
    icon: Briefcase,
    gradient: 'from-blue-600 to-indigo-600',
    textDensity: 'medium',
    animationIntensity: 'normal',
    pacing: 'medium',
    colorMood: 'Gedämpft, seriös, Business-Palette',
    musicStyle: 'corporate',
  },
  {
    id: 'emotional',
    name: 'Emotional',
    description: 'Storytelling, warm, cinematic',
    icon: Heart,
    gradient: 'from-amber-500 to-rose-500',
    textDensity: 'high',
    animationIntensity: 'subtle',
    pacing: 'slow',
    colorMood: 'Warm, golden, cinematic',
    musicStyle: 'cinematic',
  },
  {
    id: 'minimalist',
    name: 'Minimalistisch',
    description: 'Wenig Text, nur Keywords',
    icon: Minimize2,
    gradient: 'from-gray-600 to-gray-800',
    textDensity: 'low',
    animationIntensity: 'subtle',
    pacing: 'slow',
    colorMood: 'Schwarz/Weiß mit Akzent',
    musicStyle: 'ambient',
  },
  {
    id: 'playful',
    name: 'Verspielt',
    description: 'Bunt, dynamisch, Fun',
    icon: Sparkles,
    gradient: 'from-pink-500 to-violet-500',
    textDensity: 'medium',
    animationIntensity: 'dynamic',
    pacing: 'fast',
    colorMood: 'Bunt, Pastell, verspielt',
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

  const getDensityLabel = (val: number) => val < 33 ? 'Wenig' : val < 66 ? 'Mittel' : 'Viel';
  const getIntensityLabel = (val: number) => val < 33 ? 'Subtil' : val < 66 ? 'Normal' : 'Dynamisch';

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-foreground">Stimmung & Stil</h2>
        <p className="text-muted-foreground">
          Wähle die Stimmung, die dein Video transportieren soll
        </p>
      </div>

      {/* Preset Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {MOOD_PRESETS.map((preset, index) => {
          const Icon = preset.icon;
          const isSelected = selectedPreset === preset.id;

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
                <div className="text-sm font-semibold text-foreground">{preset.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{preset.description}</div>
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Fine-tuning sliders — only show after preset selected */}
      {selectedPreset && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="space-y-6 p-6 rounded-xl bg-card/40 border border-border/50 backdrop-blur-sm"
        >
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Feineinstellungen</h3>

          {/* Text Density */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Text-Menge</Label>
              <span className="text-xs text-muted-foreground font-medium">{getDensityLabel(textDensity)}</span>
            </div>
            <Slider
              value={[textDensity]}
              onValueChange={([v]) => setTextDensity(v)}
              max={100}
              step={1}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Wenig</span>
              <span>Viel</span>
            </div>
          </div>

          {/* Animation Intensity */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Animations-Intensität</Label>
              <span className="text-xs text-muted-foreground font-medium">{getIntensityLabel(animationIntensity)}</span>
            </div>
            <Slider
              value={[animationIntensity]}
              onValueChange={([v]) => setAnimationIntensity(v)}
              max={100}
              step={1}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Subtil</span>
              <span>Dynamisch</span>
            </div>
          </div>

          {/* Scene Badges Toggle */}
          <div className="flex items-center justify-between">
            <Label>Szenen-Badges anzeigen</Label>
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
            Weiter mit {MOOD_PRESETS.find(p => p.id === selectedPreset)?.name}
          </button>
        </motion.div>
      )}
    </div>
  );
}

export { MOOD_PRESETS };
