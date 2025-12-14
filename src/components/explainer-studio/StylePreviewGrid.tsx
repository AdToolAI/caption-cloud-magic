import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ExplainerStyle } from '@/types/explainer-studio';
import { STYLE_PRESETS } from '@/types/explainer-studio';

interface StylePreviewGridProps {
  selectedStyle: ExplainerStyle;
  onSelectStyle: (style: ExplainerStyle) => void;
}

export function StylePreviewGrid({ selectedStyle, onSelectStyle }: StylePreviewGridProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      {STYLE_PRESETS.map((preset, index) => (
        <motion.button
          key={preset.id}
          onClick={() => onSelectStyle(preset.id)}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.05 }}
          className={cn(
            "relative group rounded-xl overflow-hidden border-2 transition-all duration-300",
            selectedStyle === preset.id
              ? "border-primary shadow-[0_0_25px_rgba(245,199,106,0.3)]"
              : "border-white/10 hover:border-white/30"
          )}
        >
          {/* Preview Image / Color Representation */}
          <div 
            className="aspect-video relative"
            style={{
              background: `linear-gradient(135deg, ${preset.colors[0]} 0%, ${preset.colors[1]} 50%, ${preset.colors[2]} 100%)`
            }}
          >
            {/* Style Icon/Pattern Overlay */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-white/80 text-4xl font-bold">
                {preset.id === 'flat-design' && '◼'}
                {preset.id === 'isometric' && '◇'}
                {preset.id === 'whiteboard' && '✎'}
                {preset.id === 'comic' && '💥'}
                {preset.id === 'corporate' && '📊'}
                {preset.id === 'modern-3d' && '◈'}
              </div>
            </div>

            {/* Selection Checkmark */}
            {selectedStyle === preset.id && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute top-2 right-2 w-6 h-6 rounded-full bg-primary flex items-center justify-center"
              >
                <Check className="h-4 w-4 text-primary-foreground" />
              </motion.div>
            )}

            {/* Hover Overlay */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
          </div>

          {/* Info Section */}
          <div className="p-3 bg-card/80 backdrop-blur-sm">
            <h4 className="font-semibold text-sm mb-1">{preset.name}</h4>
            <p className="text-xs text-muted-foreground line-clamp-2">{preset.description}</p>
            
            {/* Color Dots */}
            <div className="flex gap-1 mt-2">
              {preset.colors.map((color, i) => (
                <div
                  key={i}
                  className="w-4 h-4 rounded-full border border-white/20"
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>

            {/* Characteristics Tags */}
            <div className="flex flex-wrap gap-1 mt-2">
              {preset.characteristics.slice(0, 2).map((char, i) => (
                <span
                  key={i}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-muted/30 text-muted-foreground"
                >
                  {char}
                </span>
              ))}
            </div>
          </div>
        </motion.button>
      ))}
    </div>
  );
}
