import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { 
  Scissors, 
  Copy, 
  Trash2, 
  Gauge,
  Sparkles,
  ChevronRight,
  Zap
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface ContextualActionBarProps {
  visible: boolean;
  onSpeedChange: (speed: number) => void;
  onSplit: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onApplyEffect: () => void;
  currentSpeed?: number;
  sceneName?: string;
}

const speedPresets = [
  { value: 0.5, label: '0.5x', icon: '🐢' },
  { value: 1, label: '1x', icon: '▶️' },
  { value: 2, label: '2x', icon: '⚡' },
  { value: 4, label: '4x', icon: '🚀' },
];

export function ContextualActionBar({
  visible,
  onSpeedChange,
  onSplit,
  onCopy,
  onDelete,
  onApplyEffect,
  currentSpeed = 1,
  sceneName = 'Szene'
}: ContextualActionBarProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
        >
          <div className="backdrop-blur-2xl bg-card/90 border border-border/50 rounded-2xl shadow-2xl p-2 flex items-center gap-1">
            {/* Scene indicator */}
            <div className="px-3 py-1.5 bg-primary/10 rounded-xl mr-1">
              <span className="text-xs font-medium text-primary">{sceneName}</span>
            </div>

            {/* Divider */}
            <div className="w-px h-8 bg-border/50" />

            {/* Speed Presets */}
            <TooltipProvider delayDuration={200}>
              <div className="flex items-center gap-0.5 px-1">
                <Gauge className="w-4 h-4 text-muted-foreground mr-1" />
                {speedPresets.map((preset) => (
                  <Tooltip key={preset.value}>
                    <TooltipTrigger asChild>
                      <Button
                        variant={currentSpeed === preset.value ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => onSpeedChange(preset.value)}
                        className={`h-8 px-2.5 text-xs font-medium transition-all ${
                          currentSpeed === preset.value 
                            ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25' 
                            : 'hover:bg-muted'
                        }`}
                      >
                        {preset.label}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      {preset.icon} {preset.value < 1 ? 'Zeitlupe' : preset.value === 1 ? 'Normal' : 'Zeitraffer'}
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>

              {/* Divider */}
              <div className="w-px h-8 bg-border/50" />

              {/* Quick Actions */}
              <div className="flex items-center gap-0.5 px-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onSplit}
                      className="h-8 w-8 p-0 hover:bg-amber-500/20 hover:text-amber-500"
                    >
                      <Scissors className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    <span className="flex items-center gap-1">
                      Szene teilen <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">S</kbd>
                    </span>
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onCopy}
                      className="h-8 w-8 p-0 hover:bg-blue-500/20 hover:text-blue-500"
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    <span className="flex items-center gap-1">
                      Duplizieren <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">D</kbd>
                    </span>
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onDelete}
                      className="h-8 w-8 p-0 hover:bg-destructive/20 hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    <span className="flex items-center gap-1">
                      Löschen <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">⌫</kbd>
                    </span>
                  </TooltipContent>
                </Tooltip>
              </div>

              {/* Divider */}
              <div className="w-px h-8 bg-border/50" />

              {/* Effects Button */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onApplyEffect}
                    className="h-8 px-3 gap-1.5 hover:bg-purple-500/20 hover:text-purple-500"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span className="text-xs font-medium">Effekte</span>
                    <ChevronRight className="w-3 h-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  Effekte & Filter anwenden
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Keyboard hint */}
            <div className="ml-1 px-2 py-1 bg-muted/50 rounded-lg">
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Zap className="w-3 h-3" /> Shortcuts aktiv
              </span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
