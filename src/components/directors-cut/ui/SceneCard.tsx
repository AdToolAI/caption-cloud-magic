import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Clock, Palette } from 'lucide-react';
import { SceneAnalysis } from '@/types/directors-cut';
import { cn } from '@/lib/utils';

interface SceneCardProps {
  scene: SceneAnalysis;
  index: number;
  isSelected: boolean;
  thumbnail?: string;
  transitionType?: string;
  onClick: () => void;
}

const MOOD_COLORS: Record<string, string> = {
  'calm': 'from-blue-500/20 to-cyan-500/20',
  'energetic': 'from-orange-500/20 to-red-500/20',
  'dramatic': 'from-purple-500/20 to-pink-500/20',
  'happy': 'from-yellow-500/20 to-green-500/20',
  'sad': 'from-slate-500/20 to-blue-500/20',
  'neutral': 'from-gray-500/20 to-slate-500/20',
};

export function SceneCard({
  scene,
  index,
  isSelected,
  thumbnail,
  transitionType,
  onClick,
}: SceneCardProps) {
  const duration = scene.end_time - scene.start_time;
  const moodGradient = MOOD_COLORS[scene.mood?.toLowerCase() || 'neutral'] || MOOD_COLORS.neutral;

  return (
    <motion.div
      layoutId={`scene-card-${scene.id}`}
      onClick={onClick}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      whileHover={{ 
        scale: 1.02, 
        y: -4,
        transition: { type: 'spring', stiffness: 400 }
      }}
      whileTap={{ scale: 0.98 }}
      className={cn(
        "relative cursor-pointer rounded-2xl overflow-hidden",
        "backdrop-blur-xl border transition-all duration-300",
        "bg-gradient-to-br",
        moodGradient,
        isSelected 
          ? "border-primary ring-2 ring-primary/30 shadow-[0_0_30px_hsl(var(--primary)/0.3)]" 
          : "border-white/20 dark:border-white/10 hover:border-primary/50"
      )}
    >
      {/* Thumbnail Area */}
      <div className="relative aspect-video bg-black/20 overflow-hidden">
        {thumbnail ? (
          <img 
            src={thumbnail} 
            alt={`Scene ${index + 1}`}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted/50 to-muted">
            <span className="text-4xl font-bold text-muted-foreground/30">
              {index + 1}
            </span>
          </div>
        )}
        
        {/* Scene Number Badge */}
        <div className="absolute top-2 left-2">
          <Badge 
            variant="secondary" 
            className="backdrop-blur-md bg-black/50 text-white border-0 font-mono"
          >
            #{index + 1}
          </Badge>
        </div>

        {/* Duration Badge */}
        <div className="absolute top-2 right-2">
          <Badge 
            variant="secondary" 
            className="backdrop-blur-md bg-black/50 text-white border-0 font-mono text-xs"
          >
            <Clock className="h-3 w-3 mr-1" />
            {duration.toFixed(1)}s
          </Badge>
        </div>

        {/* Transition Indicator */}
        {transitionType && transitionType !== 'none' && (
          <motion.div 
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            className="absolute bottom-2 right-2"
          >
            <Badge 
              className="backdrop-blur-md bg-primary/80 text-primary-foreground border-0 text-xs capitalize"
            >
              <Sparkles className="h-3 w-3 mr-1" />
              {transitionType}
            </Badge>
          </motion.div>
        )}

        {/* Hover Overlay */}
        <motion.div
          initial={{ opacity: 0 }}
          whileHover={{ opacity: 1 }}
          className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent flex items-end p-3"
        >
          <span className="text-white text-xs font-medium">Click to edit</span>
        </motion.div>
      </div>

      {/* Content Area */}
      <div className="p-3 space-y-2">
        {/* Time Range */}
        <div className="flex items-center justify-between text-xs">
          <span className="font-mono text-muted-foreground">
            {scene.start_time.toFixed(1)}s – {scene.end_time.toFixed(1)}s
          </span>
          {scene.mood && (
            <Badge variant="outline" className="text-[10px] capitalize">
              <Palette className="h-2.5 w-2.5 mr-1" />
              {scene.mood}
            </Badge>
          )}
        </div>

        {/* Description */}
        <p className="text-sm font-medium line-clamp-2 text-foreground/90">
          {scene.description || `Szene ${index + 1}`}
        </p>

        {/* AI Suggestions Preview */}
        {scene.ai_suggestions && scene.ai_suggestions.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {scene.ai_suggestions.slice(0, 2).map((suggestion, i) => (
              <Badge 
                key={i} 
                variant="secondary" 
                className="text-[9px] bg-primary/10 text-primary border-0"
              >
                <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                {suggestion}
              </Badge>
            ))}
            {scene.ai_suggestions.length > 2 && (
              <Badge variant="secondary" className="text-[9px]">
                +{scene.ai_suggestions.length - 2}
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Selection Glow Effect */}
      {isSelected && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 pointer-events-none rounded-2xl"
          style={{
            boxShadow: 'inset 0 0 30px hsl(var(--primary) / 0.2)',
          }}
        />
      )}
    </motion.div>
  );
}
