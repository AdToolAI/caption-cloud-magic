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
        {isCritical ? 'Credits fast aufgebraucht!' : 'Credits werden knapp'}
      </AlertTitle>
      <AlertDescription className="flex items-center justify-between">
        <span>
          Sie haben nur noch <strong>{balance} Credits</strong> ({usagePercent.toFixed(0)}%) übrig.
          {planCode === 'free' && ' Upgraden Sie für mehr Credits!'}
        </span>
        <Button 
          size="sm" 
          variant={isCritical ? 'default' : 'outline'}
          onClick={() => navigate(planCode === 'free' ? '/pricing' : '/credits')}
        >
          {planCode === 'free' ? 'Plan upgraden' : 'Credits kaufen'}
        </Button>
      </AlertDescription>
    </Alert>
  );
};
