import { Coins, TrendingUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCredits } from "@/hooks/useCredits";
import { Skeleton } from "@/components/ui/skeleton";
import { CreditLimitWarning } from "./CreditLimitWarning";

export const CreditBalance = () => {
  const { balance, loading, error } = useCredits();

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-48 mt-2" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-12 w-24" />
        </CardContent>
      </Card>
    );
  }

  if (error || !balance) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-destructive">Fehler</CardTitle>
          <CardDescription>Credits konnten nicht geladen werden</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const usagePercent = balance.monthly_credits > 0 
    ? Math.round((balance.balance / balance.monthly_credits) * 100)
    : 0;

  return (
    <>
      <CreditLimitWarning 
        balance={balance.balance}
        monthlyCredits={balance.monthly_credits}
        planCode={balance.plan_code}
      />
      
      <Card className="relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -translate-y-16 translate-x-16" />
        <CardHeader className="relative">
          <div className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-primary" />
            <CardTitle>Verfügbare Credits</CardTitle>
          </div>
          <CardDescription>
            {balance.plan_code === 'free' && 'Kostenloser Plan (100 Credits/Monat)'}
            {balance.plan_code === 'basic' && 'Basic Plan (1.500 Credits/Monat)'}
            {balance.plan_code === 'pro' && 'Pro Plan (10.000 Credits/Monat)'}
            {balance.plan_code === 'enterprise' && 'Enterprise Plan'}
          </CardDescription>
        </CardHeader>
        <CardContent className="relative">
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold">{balance.balance.toLocaleString()}</span>
            <span className="text-muted-foreground">/ {balance.monthly_credits.toLocaleString()}</span>
          </div>
          
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Verbrauch</span>
              <span className="font-medium">{usagePercent}%</span>
            </div>
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary transition-all"
                style={{ width: `${Math.min(usagePercent, 100)}%` }}
              />
            </div>
          </div>

          {usagePercent > 80 && (
            <div className="mt-4 flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
              <TrendingUp className="h-4 w-4" />
              <span>Ihr Credit-Guthaben wird knapp</span>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
};
