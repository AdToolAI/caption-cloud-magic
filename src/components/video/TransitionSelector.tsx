import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Check } from 'lucide-react';

const TRANSITIONS = [
  { id: 'none', name: 'Keine', description: 'Harter Schnitt ohne Übergang' },
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
  availableTransitions = ['fade', 'slide', 'zoom', 'wipe'],
  disabled = false,
  label = 'Übergangseffekt'
}: TransitionSelectorProps) {
  const filteredTransitions = TRANSITIONS.filter(t => 
    availableTransitions.includes(t.id)
  );

  return (
    <div className="space-y-3">
      <Label>{label}</Label>
      <div className="grid grid-cols-2 gap-2">
        {filteredTransitions.map((transition) => (
          <Button
            key={transition.id}
            type="button"
            variant={value === transition.id ? 'default' : 'outline'}
            className="h-auto flex-col items-start p-3 relative"
            onClick={() => onChange(transition.id)}
            disabled={disabled}
          >
            {value === transition.id && (
              <Check className="absolute top-2 right-2 h-4 w-4" />
            )}
            <span className="font-medium text-sm">{transition.name}</span>
            <span className="text-xs text-muted-foreground font-normal mt-1">
              {transition.description}
            </span>
          </Button>
        ))}
      </div>
    </div>
  );
}
