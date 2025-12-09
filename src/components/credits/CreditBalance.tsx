import { motion } from "framer-motion";
import { Coins, TrendingUp, Infinity as InfinityIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCredits } from "@/hooks/useCredits";
import { Skeleton } from "@/components/ui/skeleton";
import { CreditLimitWarning } from "./CreditLimitWarning";

export const CreditBalance = () => {
  const { balance, loading, error } = useCredits();

  if (loading) {
    return (
      <Card className="backdrop-blur-xl bg-card/60 border border-white/10 rounded-2xl">
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
      <Card className="backdrop-blur-xl bg-card/60 border border-white/10 rounded-2xl">
        <CardHeader>
          <CardTitle className="text-destructive">Fehler</CardTitle>
          <CardDescription>Credits konnten nicht geladen werden</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const isEnterprise = balance.plan_code === 'enterprise';
  const usagePercent = !isEnterprise && balance.monthly_credits > 0 
    ? Math.round((balance.balance / balance.monthly_credits) * 100)
    : 0;

  return (
    <>
      {!isEnterprise && (
        <CreditLimitWarning 
          balance={balance.balance}
          monthlyCredits={balance.monthly_credits}
          planCode={balance.plan_code}
        />
      )}
      
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Card className="relative overflow-hidden backdrop-blur-xl bg-card/60 border border-white/10 rounded-2xl hover:shadow-[0_0_30px_hsla(43,90%,68%,0.15)] transition-all duration-300">
          {/* Background Glow */}
          <motion.div 
            className="absolute top-0 right-0 w-40 h-40 bg-primary/10 rounded-full blur-3xl -translate-y-20 translate-x-20"
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.2, 0.3, 0.2],
            }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          />
          
          <CardHeader className="relative">
            <div className="flex items-center gap-2">
              <motion.div
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              >
                <Coins className="h-5 w-5 text-primary" />
              </motion.div>
              <CardTitle>Verfügbare Credits</CardTitle>
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 w-fit mt-2">
              <span className="text-sm font-medium text-primary">
                {balance.plan_code === 'free' && 'Kostenloser Plan'}
                {balance.plan_code === 'basic' && 'Basic Plan'}
                {balance.plan_code === 'pro' && 'Pro Plan'}
                {balance.plan_code === 'enterprise' && 'Enterprise Plan'}
              </span>
            </div>
          </CardHeader>
          <CardContent className="relative">
            {isEnterprise ? (
              <div className="flex items-center gap-4">
                <motion.div
                  animate={{
                    scale: [1, 1.1, 1],
                  }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  className="text-6xl font-bold text-primary drop-shadow-[0_0_20px_hsla(43,90%,68%,0.5)]"
                >
                  <InfinityIcon className="h-16 w-16" />
                </motion.div>
                <div className="text-sm text-muted-foreground">
                  <div className="font-semibold text-foreground">Unbegrenzte Credits</div>
                  <div>Nutzen Sie alle Features ohne Limit</div>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-baseline gap-2">
                  <motion.span 
                    className="text-5xl font-bold bg-gradient-to-r from-primary to-amber-400 bg-clip-text text-transparent"
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                  >
                    {balance.balance.toLocaleString()}
                  </motion.span>
                  <span className="text-muted-foreground">/ {balance.monthly_credits.toLocaleString()}</span>
                </div>
                
                <div className="mt-6 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Verbrauch</span>
                    <span className="font-medium text-primary">{usagePercent}%</span>
                  </div>
                  
                  {/* Premium Progress Bar */}
                  <div className="h-3 bg-muted/30 rounded-full overflow-hidden border border-white/5">
                    <motion.div 
                      className="h-full bg-gradient-to-r from-primary via-amber-400 to-primary rounded-full relative"
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(usagePercent, 100)}%` }}
                      transition={{ duration: 1, delay: 0.3, ease: "easeOut" }}
                    >
                      {/* Glow Effect */}
                      <div className="absolute inset-0 bg-gradient-to-r from-primary via-amber-400 to-primary blur-sm opacity-50" />
                    </motion.div>
                  </div>
                </div>

                {usagePercent > 80 && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.5 }}
                    className="mt-4 flex items-center gap-2 text-sm px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20"
                  >
                    <TrendingUp className="h-4 w-4 text-amber-500" />
                    <span className="text-amber-500">Ihr Credit-Guthaben wird knapp</span>
                  </motion.div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </>
  );
};
