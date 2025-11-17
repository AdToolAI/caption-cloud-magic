import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react';

interface VideoStatusBadgeProps {
  status: string;
}

export const VideoStatusBadge = ({ status }: VideoStatusBadgeProps) => {
  const variants: Record<string, {
    label: string;
    variant: 'default' | 'secondary' | 'destructive';
    icon: typeof Clock;
    className?: string;
  }> = {
    pending: {
      label: 'Wartend',
      variant: 'secondary',
      icon: Clock
    },
    rendering: {
      label: 'Wird erstellt',
      variant: 'default',
      icon: Loader2
    },
    completed: {
      label: 'Fertig',
      variant: 'default',
      icon: CheckCircle2,
      className: 'bg-green-600 hover:bg-green-700'
    },
    failed: {
      label: 'Fehlgeschlagen',
      variant: 'destructive',
      icon: XCircle
    }
  };

  const config = variants[status] || variants.pending;
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className={config.className}>
      <Icon className={`h-3 w-3 mr-1 ${status === 'rendering' ? 'animate-spin' : ''}`} />
      {config.label}
    </Badge>
  );
};
