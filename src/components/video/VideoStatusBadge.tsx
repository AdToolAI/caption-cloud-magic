import { tx } from '@/lib/i18nText';
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
      label: tx({ de: 'Wartend', en: 'Pending', es: 'Esperando' }),
      variant: 'secondary',
      icon: Clock
    },
    rendering: {
      label: tx({ de: 'Wird erstellt', en: 'Rendering', es: 'Representación' }),
      variant: 'default',
      icon: Loader2
    },
    completed: {
      label: tx({ de: 'Fertig', en: 'Completed', es: 'Terminado' }),
      variant: 'default',
      icon: CheckCircle2,
      className: 'bg-green-600 hover:bg-green-700'
    },
    failed: {
      label: tx({ de: 'Fehlgeschlagen', en: 'Failed', es: 'Fallido' }),
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
