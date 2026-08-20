import { tx } from "@/lib/i18nText";
import { AlertTriangle, Zap } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

interface CreditLimitWarningProps {
  balance: number;
  monthlyCredits: number;
  planCode: string;
}

export const CreditLimitWarning = ({ balance, monthlyCredits, planCode }: CreditLimitWarningProps) => {
  const navigate = useNavigate();
  const usagePercent = (balance / monthlyCredits) * 100;

  // Only show warning at 20% or less
  if (usagePercent > 20) return null;

  // Critical warning at 5% or less
  const isCritical = usagePercent <= 5;

  return (
    <Alert variant={isCritical ? 'destructive' : 'default'} className="mb-4">
      {isCritical ? (
        <AlertTriangle className="h-4 w-4" />
      ) : (
        <Zap className="h-4 w-4" />
      )}
      <AlertTitle>
        {isCritical ? tx({ de: "Credits fast aufgebraucht!", en: "Credits almost used up!", es: "¡Créditos casi agotados!" }) : tx({ de: 'Credits werden knapp', en: 'Credits are becoming scarce', es: 'Los créditos son cada vez más escasos.' })}
      </AlertTitle>
      <AlertDescription className="flex items-center justify-between">
        <span>
          {tx({ de: "Sie haben nur noch", en: "You only have", es: "Solo tienes" })} <strong>{balance} Credits</strong> ({usagePercent.toFixed(0)}{tx({ de: "%) übrig.", en: "%) left.", es: "%) restante." })}
          {planCode === 'free' && tx({ de: ' Upgraden Sie für mehr Credits!', en: ' Upgrade for more credits!', es: ' ¡Actualiza para obtener más créditos!' })}
        </span>
        <Button 
          size="sm" 
          variant={isCritical ? 'default' : 'outline'}
          onClick={() => navigate(planCode === 'free' ? '/pricing' : '/credits')}
        >
          {planCode === 'free' ? tx({ de: 'Plan upgraden', en: 'Upgrade plan', es: 'Mejorar plan' }) : tx({ de: 'Credits kaufen', en: 'Buy credits', es: 'Comprar créditos' })}
        </Button>
      </AlertDescription>
    </Alert>
  );
};
