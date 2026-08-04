import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { OVERLAY_PRESETS, OVERLAY_CATEGORIES, type OverlayPreset } from '@/lib/directors-cut/overlayPresets';
import { OverlayGraphic } from '@/remotion/components/OverlayGraphic';

interface OverlayLibraryProps {
  onPick: (preset: OverlayPreset) => void;
}

/** Kachel mit echter Live-Vorschau des Bausteins (gleicher Renderer wie Export). */
function PresetTile({ preset, onPick }: { preset: OverlayPreset; onPick: () => void }) {
  const overlay = useMemo(
    () => ({ id: preset.id, startTime: 0, endTime: null, ...preset.build() }),
    [preset],
  );

  return (
    <motion.button
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onPick}
      className="group min-w-0 text-left rounded-xl border border-white/10 bg-white/5 hover:border-primary/50 transition-all overflow-hidden"
    >
      <div className="relative aspect-video bg-[linear-gradient(135deg,hsl(var(--muted))_0%,hsl(var(--background))_100%)] overflow-hidden">
        <div className="absolute inset-0">
          <OverlayGraphic overlay={overlay} t={99} duration={Number.POSITIVE_INFINITY} canvasWidth={320} />
        </div>
      </div>
      <div className="p-2 min-w-0">
        <div className="text-xs font-medium truncate group-hover:text-primary transition-colors">{preset.name}</div>
        <div className="text-[11px] text-muted-foreground truncate">{preset.description}</div>
      </div>
    </motion.button>
  );
}

export function OverlayLibrary({ onPick }: OverlayLibraryProps) {
  const [category, setCategory] = useState<string>('Alle');
  const categories = ['Alle', ...OVERLAY_CATEGORIES];
  const items = category === 'Alle' ? OVERLAY_PRESETS : OVERLAY_PRESETS.filter((p) => p.category === category);

  return (
    <div className="space-y-3 min-w-0">
      <div className="flex flex-wrap gap-1.5">
        {categories.map((c) => (
          <button key={c} onClick={() => setCategory(c)} className="min-w-0">
            <Badge
              variant={category === c ? 'default' : 'outline'}
              className={category === c ? 'bg-primary/20 text-primary border-primary/40' : 'border-white/15'}
            >
              {c}
            </Badge>
          </button>
        ))}
      </div>

      <ScrollArea className="h-[300px] pr-2">
        <div className="grid grid-cols-2 gap-2 min-w-0">
          {items.map((preset) => (
            <PresetTile key={preset.id} preset={preset} onPick={() => onPick(preset)} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
