import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ArrowUp, ArrowDown, Minus, Zap } from 'lucide-react';

export type QueuePriority = 'low' | 'normal' | 'high' | 'urgent';

interface QueuePrioritySelectorProps {
  value: QueuePriority;
  onChange: (priority: QueuePriority) => void;
  disabled?: boolean;
}

const PRIORITY_CONFIG = {
  low: {
    label: 'Niedrig',
    icon: ArrowDown,
    color: 'text-muted-foreground',
    badgeVariant: 'secondary' as const,
    description: 'Wird später verarbeitet'
  },
  normal: {
    label: 'Normal',
    icon: Minus,
    color: 'text-foreground',
    badgeVariant: 'outline' as const,
    description: 'Standard Priorität'
  },
  high: {
    label: 'Hoch',
    icon: ArrowUp,
    color: 'text-orange-500',
    badgeVariant: 'default' as const,
    description: 'Wird bevorzugt verarbeitet'
  },
  urgent: {
    label: 'Dringend',
    icon: Zap,
    color: 'text-red-500',
    badgeVariant: 'destructive' as const,
    description: 'Höchste Priorität'
  }
};

export function QueuePrioritySelector({ value, onChange, disabled }: QueuePrioritySelectorProps) {
  const currentConfig = PRIORITY_CONFIG[value];
  const Icon = currentConfig.icon;

  return (
    <div className="space-y-2">
      <Select value={value} onValueChange={(v) => onChange(v as QueuePriority)} disabled={disabled}>
        <SelectTrigger className="w-full">
          <SelectValue>
            <div className="flex items-center gap-2">
              <Icon className={`h-4 w-4 ${currentConfig.color}`} />
              <span>{currentConfig.label}</span>
              <Badge variant={currentConfig.badgeVariant} className="ml-auto">
                {value.toUpperCase()}
              </Badge>
            </div>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {Object.entries(PRIORITY_CONFIG).map(([priority, config]) => {
            const PriorityIcon = config.icon;
            return (
              <SelectItem key={priority} value={priority}>
                <div className="flex items-center gap-3 py-1">
                  <PriorityIcon className={`h-4 w-4 ${config.color}`} />
                  <div className="flex-1">
                    <div className="font-medium">{config.label}</div>
                    <div className="text-xs text-muted-foreground">{config.description}</div>
                  </div>
                  <Badge variant={config.badgeVariant} className="ml-2">
                    {priority.toUpperCase()}
                  </Badge>
                </div>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        {currentConfig.description}
      </p>
    </div>
  );
}

export function PriorityBadge({ priority }: { priority: QueuePriority }) {
  const config = PRIORITY_CONFIG[priority];
  const Icon = config.icon;

  return (
    <Badge variant={config.badgeVariant} className="flex items-center gap-1">
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}
