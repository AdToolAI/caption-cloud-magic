import { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Sliders, Volume2, Mic, Radio, Sparkles, 
  RefreshCw, Wand2, Zap, Music, Settings2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { 
  EnhancementOptions, 
  DEFAULT_ENHANCEMENT_OPTIONS,
  PRESET_MINIMAL,
  PRESET_PODCAST,
  PRESET_RADIO,
  PRESET_MAXIMAL
} from '@/hooks/useAudioEnhancement';

interface EffectControlPanelProps {
  options: EnhancementOptions;
  onChange: (options: EnhancementOptions) => void;
  onReprocess: () => void;
  isProcessing: boolean;
}

interface EffectGroup {
  id: string;
  label: string;
  icon: React.ElementType;
  effects: {
    key: keyof EnhancementOptions;
    label: string;
    shortLabel: string;
    description: string;
  }[];
}

const EFFECT_GROUPS: EffectGroup[] = [
  {
    id: 'noise',
    label: 'Rauschunterdrückung',
    icon: Volume2,
    effects: [
      { key: 'highPassFilter', label: 'Hochpass', shortLabel: 'HP 120Hz', description: 'Entfernt tiefes Rumpeln' },
      { key: 'lowPassFilter', label: 'Tiefpass', shortLabel: 'LP 10kHz', description: 'Entfernt Zischen' },
      { key: 'notchFilter', label: 'Notch', shortLabel: '50/60Hz', description: 'Entfernt Netzbrummen' },
      { key: 'noiseGate', label: 'Gate', shortLabel: '-40dB', description: 'Schaltet Stille stumm' },
    ]
  },
  {
    id: 'voice',
    label: 'Stimme',
    icon: Mic,
    effects: [
      { key: 'voiceEQ', label: 'Voice EQ', shortLabel: '+3dB 3kHz', description: 'Klarheit boosten' },
      { key: 'deEsser', label: 'De-Esser', shortLabel: '-4dB 6.5kHz', description: 'S-Laute reduzieren' },
      { key: 'plosiveReducer', label: 'Plosive', shortLabel: '-6dB 120Hz', description: 'P/B-Laute dämpfen' },
      { key: 'warmthBoost', label: 'Wärme', shortLabel: '+1.5dB 200Hz', description: 'Stimme voller' },
    ]
  },
  {
    id: 'finishing',
    label: 'Finishing',
    icon: Sparkles,
    effects: [
      { key: 'boxinessCut', label: 'Box-Cut', shortLabel: '-2.5dB 250Hz', description: 'Boxy Sound entfernen' },
      { key: 'mudCut', label: 'Mud-Cut', shortLabel: '-2dB 500Hz', description: 'Schlammigkeit' },
      { key: 'airBoost', label: 'Air', shortLabel: '+1.5dB 10kHz+', description: 'Brillanz hinzufügen' },
      { key: 'compression', label: 'Komp.', shortLabel: '4:1 -24dB', description: 'Dynamik komprimieren' },
      { key: 'limiter', label: 'Limiter', shortLabel: '-1dB 20:1', description: 'Clipping verhindern' },
    ]
  },
  {
    id: 'stereo',
    label: 'Stereo & Output',
    icon: Music,
    effects: [
      { key: 'stereoWidener', label: 'Stereo Widener', shortLabel: '15ms Haas', description: 'Stereo-Bild verbreitern' },
      { key: 'normalize', label: 'Normalize', shortLabel: '-1dB Peak', description: 'Lautstärke normalisieren' },
    ]
  }
];

const PRESETS = [
  { id: 'minimal', label: 'Minimal', icon: Settings2, config: PRESET_MINIMAL },
  { id: 'podcast', label: 'Podcast', icon: Mic, config: PRESET_PODCAST },
  { id: 'radio', label: 'Radio', icon: Radio, config: PRESET_RADIO },
  { id: 'maximal', label: 'Maximal', icon: Zap, config: PRESET_MAXIMAL },
];

export function EffectControlPanel({ 
  options, 
  onChange, 
  onReprocess,
  isProcessing 
}: EffectControlPanelProps) {
  const [activePreset, setActivePreset] = useState<string | null>(null);
  
  const toggleEffect = (key: keyof EnhancementOptions) => {
    const newOptions = { ...options, [key]: !options[key] };
    onChange(newOptions);
    setActivePreset(null); // Clear preset selection when manually toggling
  };
  
  const toggleAll = (enabled: boolean) => {
    const newOptions: EnhancementOptions = {};
    Object.keys(options).forEach(key => {
      if (key === 'gainBoost') {
        newOptions[key] = enabled ? 3 : 0;
      } else {
        (newOptions as any)[key] = enabled;
      }
    });
    onChange(newOptions);
    setActivePreset(null);
  };
  
  const applyPreset = (presetId: string, config: EnhancementOptions) => {
    onChange({ ...config });
    setActivePreset(presetId);
  };
  
  const countEnabled = () => {
    let count = 0;
    EFFECT_GROUPS.forEach(group => {
      group.effects.forEach(effect => {
        if (options[effect.key]) count++;
      });
    });
    return count;
  };
  
  const totalEffects = EFFECT_GROUPS.reduce((sum, g) => sum + g.effects.length, 0);
  const enabledCount = countEnabled();

  return (
    <div className="space-y-4 h-full overflow-y-auto pr-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sliders className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-sm">Effekt-Mixer</h3>
          <span className="text-xs text-muted-foreground">
            ({enabledCount}/{totalEffects})
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => toggleAll(enabledCount < totalEffects / 2)}
          className="text-xs h-7"
        >
          {enabledCount > totalEffects / 2 ? 'Alle aus' : 'Alle an'}
        </Button>
      </div>
      
      {/* Presets */}
      <div className="grid grid-cols-4 gap-1.5">
        {PRESETS.map((preset) => (
          <motion.button
            key={preset.id}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => applyPreset(preset.id, preset.config)}
            className={`p-2 rounded-lg border text-center transition-all ${
              activePreset === preset.id
                ? 'bg-primary/20 border-primary ring-1 ring-primary/30'
                : 'bg-muted/30 border-border/50 hover:border-primary/40'
            }`}
          >
            <preset.icon className={`w-4 h-4 mx-auto mb-1 ${
              activePreset === preset.id ? 'text-primary' : 'text-muted-foreground'
            }`} />
            <span className="text-xs font-medium block">{preset.label}</span>
          </motion.button>
        ))}
      </div>
      
      <Separator className="bg-border/50" />
      
      {/* Effect Groups */}
      <div className="space-y-4">
        {EFFECT_GROUPS.map((group) => (
          <div key={group.id} className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <group.icon className="w-3.5 h-3.5" />
              {group.label}
            </div>
            
            <div className="grid grid-cols-2 gap-1.5">
              {group.effects.map((effect) => {
                const isEnabled = !!options[effect.key];
                
                return (
                  <motion.button
                    key={effect.key}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => toggleEffect(effect.key)}
                    className={`relative p-2 rounded-lg border text-left transition-all ${
                      isEnabled
                        ? 'bg-primary/10 border-primary/40'
                        : 'bg-muted/20 border-border/50 opacity-60 hover:opacity-100'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className={`text-xs font-medium ${isEnabled ? 'text-primary' : 'text-muted-foreground'}`}>
                        {effect.label}
                      </span>
                      <div className={`w-2 h-2 rounded-full ${isEnabled ? 'bg-primary' : 'bg-muted-foreground/30'}`} />
                    </div>
                    <span className="text-[10px] text-muted-foreground block mt-0.5">
                      {effect.shortLabel}
                    </span>
                    
                    {/* Tooltip on hover */}
                    <div className="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity">
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-popover border border-border rounded text-[10px] whitespace-nowrap shadow-lg pointer-events-none z-10">
                        {effect.description}
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      
      <Separator className="bg-border/50" />
      
      {/* Reprocess Button */}
      <Button
        onClick={onReprocess}
        disabled={isProcessing}
        className="w-full relative overflow-hidden bg-gradient-to-r from-primary to-cyan-500 hover:from-primary/90 hover:to-cyan-500/90"
        size="lg"
      >
        {isProcessing ? (
          <>
            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            Verarbeite...
          </>
        ) : (
          <>
            <RefreshCw className="w-4 h-4 mr-2" />
            Neu verarbeiten
          </>
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-shimmer" />
      </Button>
      
      {/* Info */}
      <p className="text-[10px] text-muted-foreground text-center">
        Klicke auf einzelne Effekte um sie ein/auszuschalten, dann "Neu verarbeiten"
      </p>
    </div>
  );
}
