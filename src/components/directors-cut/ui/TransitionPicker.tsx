import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Sparkles, Check, Zap, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TransitionType {
  id: string;
  name: string;
  description: string;
  icon: string;
  gradient: string;
  aiScore?: number;
}

const TRANSITION_TYPES: TransitionType[] = [
  { 
    id: 'none', 
    name: 'Kein', 
    description: 'Harter Schnitt',
    icon: '—',
    gradient: 'from-slate-500 to-slate-600'
  },
  { 
    id: 'crossfade', 
    name: 'Crossfade', 
    description: 'Sanfte Überblendung',
    icon: '✦',
    gradient: 'from-blue-500 to-cyan-500',
    aiScore: 0.92
  },
  { 
    id: 'fade', 
    name: 'Fade', 
    description: 'Fade to Black',
    icon: '◐',
    gradient: 'from-slate-700 to-black',
    aiScore: 0.85
  },
  { 
    id: 'dissolve', 
    name: 'Dissolve', 
    description: 'Auflösungs-Effekt',
    icon: '✧',
    gradient: 'from-purple-500 to-pink-500',
    aiScore: 0.88
  },
  { 
    id: 'wipe', 
    name: 'Wipe', 
    description: 'Horizontaler Wisch',
    icon: '▶',
    gradient: 'from-green-500 to-emerald-500',
    aiScore: 0.75
  },
  { 
    id: 'slide', 
    name: 'Slide', 
    description: 'Schiebe-Effekt',
    icon: '→',
    gradient: 'from-orange-500 to-amber-500',
    aiScore: 0.70
  },
];

interface TransitionPickerProps {
  selectedType: string;
  duration: number;
  offsetSeconds?: number;
  onTypeChange: (type: string) => void;
  onDurationChange: (duration: number) => void;
  onOffsetChange?: (offset: number) => void;
  aiRecommendation?: string;
  aiConfidence?: number;
  aiReasoning?: string;
}

export function TransitionPicker({
  selectedType,
  duration,
  onTypeChange,
  onDurationChange,
  aiRecommendation,
  aiConfidence,
  aiReasoning,
}: TransitionPickerProps) {
  const [hoveredType, setHoveredType] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {/* AI Recommendation Banner */}
      {aiRecommendation && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-xl p-3 backdrop-blur-xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20"
        >
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-primary/20">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold text-primary">AI Empfehlung</span>
                {aiConfidence && (
                  <Badge 
                    variant="secondary" 
                    className="bg-primary/20 text-primary border-0 text-[10px]"
                  >
                    <Zap className="h-2.5 w-2.5 mr-0.5" />
                    {Math.round(aiConfidence * 100)}% Match
                  </Badge>
                )}
              </div>
              <p className="text-sm font-medium capitalize">{aiRecommendation}</p>
              {aiReasoning && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {aiReasoning}
                </p>
              )}
            </div>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onTypeChange(aiRecommendation)}
              className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium"
            >
              Anwenden
            </motion.button>
          </div>
          
          {/* Animated gradient border */}
          <motion.div
            className="absolute inset-0 rounded-xl pointer-events-none"
            style={{
              background: 'linear-gradient(90deg, transparent, hsl(var(--primary) / 0.1), transparent)',
              backgroundSize: '200% 100%',
            }}
            animate={{
              backgroundPosition: ['200% 0', '-200% 0'],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: 'linear',
            }}
          />
        </motion.div>
      )}

      {/* Transition Types Grid */}
      <div className="grid grid-cols-3 gap-2">
        {TRANSITION_TYPES.map((type) => {
          const isSelected = selectedType === type.id;
          const isHovered = hoveredType === type.id;
          const isAiRecommended = aiRecommendation === type.id;

          return (
            <motion.button
              key={type.id}
              onHoverStart={() => setHoveredType(type.id)}
              onHoverEnd={() => setHoveredType(null)}
              onClick={() => onTypeChange(type.id)}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className={cn(
                "relative p-3 rounded-xl border-2 transition-all duration-300 text-left overflow-hidden",
                "backdrop-blur-xl",
                isSelected
                  ? "border-primary bg-primary/10 shadow-[0_0_20px_hsl(var(--primary)/0.2)]"
                  : "border-border/50 hover:border-primary/50 bg-card/50"
              )}
            >
              {/* Animated Preview Background */}
              <div className="relative mb-2">
                <div 
                  className={cn(
                    "w-full h-10 rounded-lg overflow-hidden bg-gradient-to-r",
                    type.gradient
                  )}
                >
                  {/* Animation Effect */}
                  <AnimatePresence>
                    {(isHovered || isSelected) && type.id !== 'none' && (
                      <motion.div
                        initial={{ x: '-100%', opacity: 0 }}
                        animate={{ x: '100%', opacity: 1 }}
                        exit={{ x: '100%', opacity: 0 }}
                        transition={{ 
                          duration: 1.5, 
                          repeat: Infinity,
                          ease: 'easeInOut'
                        }}
                        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
                      />
                    )}
                  </AnimatePresence>
                </div>

                {/* Icon Overlay */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xl text-white drop-shadow-lg">{type.icon}</span>
                </div>
              </div>

              {/* Type Info */}
              <div className="space-y-0.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">{type.name}</span>
                  {isSelected && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="p-0.5 rounded-full bg-primary"
                    >
                      <Check className="h-2.5 w-2.5 text-primary-foreground" />
                    </motion.div>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground line-clamp-1">
                  {type.description}
                </p>
                {/* Motion transition hint */}
                {isSelected && (type.id === 'wipe' || type.id === 'slide') && (
                  <p className="text-[9px] text-amber-500 mt-0.5 line-clamp-2">
                    ⚡ Vorschau kann leicht versetzt wirken — Export ist framegenau
                  </p>
                )}
              </div>

              {/* AI Badge */}
              {isAiRecommended && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="absolute -top-1 -right-1"
                >
                  <Badge className="bg-primary text-[8px] px-1.5 py-0 h-4 border-0">
                    <Sparkles className="h-2 w-2 mr-0.5" />
                    AI
                  </Badge>
                </motion.div>
              )}

              {/* AI Score Indicator */}
              {type.aiScore && isHovered && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute bottom-1 right-1"
                >
                  <Badge variant="secondary" className="text-[8px] px-1 py-0 h-3">
                    {Math.round(type.aiScore * 100)}%
                  </Badge>
                </motion.div>
              )}
            </motion.button>
          );
        })}
      </div>

      {/* Duration Slider */}
      {selectedType !== 'none' && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="space-y-3 p-3 rounded-xl bg-muted/50 backdrop-blur-sm"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Dauer</span>
            </div>
            <Badge variant="outline" className="font-mono">
              {duration.toFixed(1)}s
            </Badge>
          </div>
          <Slider
            value={[duration * 10]}
            onValueChange={([v]) => onDurationChange(v / 10)}
            min={1}
            max={20}
            step={1}
            className="py-2"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>0.1s</span>
            <span>Schnell</span>
            <span>Langsam</span>
            <span>2.0s</span>
          </div>
        </motion.div>
      )}
    </div>
  );
}
