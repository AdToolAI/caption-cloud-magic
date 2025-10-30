import { ReactNode } from 'react';
import { canQuickCalendarPost } from '@/lib/entitlements';
import { PlanId } from '@/config/pricing-v21';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

interface QuickPostGateProps {
  userPlan: PlanId | null | undefined;
  children: ReactNode;
  showUpgrade?: boolean;
}

export function QuickPostGate({ userPlan, children, showUpgrade = true }: QuickPostGateProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const hasAccess = canQuickCalendarPost(userPlan);

  if (hasAccess) {
    return <>{children}</>;
  }

  if (!showUpgrade) {
    return null;
  }

  return (
    <div className="p-6 border-2 border-dashed border-primary/50 rounded-lg bg-accent/50">
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-full bg-primary/10">
          <Sparkles className="w-6 h-6 text-primary" />
        </div>
        <div className="flex-1 space-y-2">
          <h3 className="font-semibold text-lg">
            {t('pricing.features.quickPostLocked')}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t('pricing.features.quickPostDesc')}
          </p>
          <Button onClick={() => navigate('/pricing')} size="sm" className="mt-2">
            {t('pricing.upgrade.toPro')}
          </Button>
        </div>
      </div>
    </div>
  );
}
