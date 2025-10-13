import { Loader2, CheckCircle2, XCircle, Clock, CreditCard, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface AICallStatusProps {
  stage: 'idle' | 'rate_check' | 'credit_check' | 'executing' | 'retrying' | 'success' | 'error';
  message: string;
  retryAttempt?: number;
}

export function AICallStatus({ stage, message, retryAttempt }: AICallStatusProps) {
  if (stage === 'idle') return null;

  const stageConfig = {
    rate_check: { icon: Clock, color: 'text-muted-foreground', variant: 'outline' as const },
    credit_check: { icon: CreditCard, color: 'text-primary', variant: 'secondary' as const },
    executing: { icon: Sparkles, color: 'text-primary', variant: 'default' as const },
    retrying: { icon: Loader2, color: 'text-warning', variant: 'secondary' as const },
    success: { icon: CheckCircle2, color: 'text-success', variant: 'default' as const },
    error: { icon: XCircle, color: 'text-destructive', variant: 'destructive' as const },
  };

  const config = stageConfig[stage];
  const Icon = config.icon;
  const isAnimating = stage === 'executing' || stage === 'retrying' || stage === 'rate_check' || stage === 'credit_check';

  return (
    <Badge variant={config.variant} className="gap-2">
      <Icon className={`h-3 w-3 ${config.color} ${isAnimating ? 'animate-spin' : ''}`} />
      <span className="text-xs">
        {message}
        {retryAttempt && ` (${retryAttempt}/3)`}
      </span>
    </Badge>
  );
}
