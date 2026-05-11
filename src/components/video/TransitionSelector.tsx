import { Label } from '@/components/ui/label';
import { TransitionPreviewTile, type TransitionId } from '@/components/studio-visual/TransitionPreviewTile';

const TRANSITIONS = [
  { id: 'none', name: 'Cut', description: 'Harter Schnitt — Artlist-Standard' },
  { id: 'crossfade', name: 'Crossfade', description: 'Sanftes Morphing zwischen Szenen' },
  { id: 'fade', name: 'Fade', description: 'Sanftes Ein-/Ausblenden' },
  { id: 'slide', name: 'Slide', description: 'Seitliches Gleiten' },
  { id: 'zoom', name: 'Zoom', description: 'Hinein-/Herauszoomen' },
  { id: 'wipe', name: 'Wipe', description: 'Wischbewegung' },
  { id: 'blur', name: 'Blur', description: 'Weichzeichner-Übergang' },
  { id: 'push', name: 'Push', description: 'Szene schiebt Szene' },
] as const;

interface TransitionSelectorProps {
  value: string;
  onChange: (transition: string) => void;
  availableTransitions?: string[];
  disabled?: boolean;
  label?: string;
}

export function TransitionSelector({
  value,
  onChange,
  // Phase 4 (Artlist-style): default palette is intentionally minimal —
  // a hard "Cut" plus a single soft "Crossfade". Other engines remain
  // available, but only when a caller explicitly opts in.
  availableTransitions = ['none', 'crossfade'],
  disabled = false,
  label = 'Übergangseffekt'
}: TransitionSelectorProps) {
  const filteredTransitions = TRANSITIONS.filter(t =>
    availableTransitions.includes(t.id)
  );

  return (
    <div className="space-y-3">
      <Label>{label}</Label>
      <div className={`grid gap-2 ${filteredTransitions.length <= 2 ? 'grid-cols-2' : 'grid-cols-3'} ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
        {filteredTransitions.map((transition) => (
          <div key={transition.id} className="space-y-1">
            <TransitionPreviewTile
              transitionId={transition.id as TransitionId}
              label={transition.name}
              isActive={value === transition.id}
              size="md"
              onClick={() => onChange(transition.id)}
            />
            <p className="text-[10px] text-muted-foreground line-clamp-1 px-0.5">
              {transition.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
