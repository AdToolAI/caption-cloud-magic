/**
 * Badge component to show AI job status
 */

import { Badge } from '@/components/ui/badge';
import { tx } from "@/lib/i18nText";
import { Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react';

interface AIJobStatusBadgeProps {
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  retryCount?: number;
}

export function AIJobStatusBadge({ status, retryCount }: AIJobStatusBadgeProps) {
  const config = {
    pending: {
      icon: Clock,
      label: tx({ de: 'Warteschlange', en: 'Queue', es: 'Cola' }),
      variant: 'secondary' as const,
      className: 'text-muted-foreground'
    },
    processing: {
      icon: Loader2,
      label: tx({ de: 'Verarbeitung', en: 'Processing', es: 'Procesamiento' }),
      variant: 'default' as const,
      className: 'text-primary animate-spin'
    },
    completed: {
      icon: CheckCircle2,
      label: tx({ de: 'Abgeschlossen', en: 'Completed', es: 'Completado' }),
      variant: 'default' as const,
      className: 'text-success'
    },
    failed: {
      icon: XCircle,
      label: tx({ de: 'Fehlgeschlagen', en: 'Failed', es: 'Fallido' }),
      variant: 'destructive' as const,
      className: 'text-destructive'
    },
    cancelled: {
      icon: XCircle,
      label: tx({ de: 'Abgebrochen', en: 'Cancelled', es: 'Cancelado' }),
      variant: 'outline' as const,
      className: 'text-muted-foreground'
    }
  };

  const { icon: Icon, label, variant, className } = config[status];

  return (
    <Badge variant={variant} className="gap-2">
      <Icon className={`h-3 w-3 ${className}`} />
      <span className="text-xs">
        {label}
        {retryCount && retryCount > 0 ? tx({ de: ` (Versuch ${retryCount})`, en: ` (Attempt ${retryCount})`, es: ` (Intento ${retryCount})` }) : ''}
      </span>
    </Badge>
  );
}
