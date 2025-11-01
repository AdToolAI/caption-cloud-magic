import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Lock, Zap, TrendingUp, HardDrive } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { pricingPlans } from "@/config/pricing";

interface PlanLimitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feature: string;
}

export const PlanLimitDialog = ({ open, onOpenChange, feature }: PlanLimitDialogProps) => {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center">Upgrade Required</DialogTitle>
          <DialogDescription className="text-center">
            {feature} requires a Pro or higher plan. Choose the plan that fits your needs.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100">
              <Zap className="h-4 w-4 text-green-600" />
            </div>
            <div>
              <h4 className="font-semibold">API Connections</h4>
              <p className="text-sm text-muted-foreground">
                Connect up to 3 social media accounts with automatic sync
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100">
              <TrendingUp className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <h4 className="font-semibold">AI Insights</h4>
              <p className="text-sm text-muted-foreground">
                Get AI-powered recommendations to boost engagement
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-100">
              <Lock className="h-4 w-4 text-purple-600" />
            </div>
            <div>
              <h4 className="font-semibold">Unlimited Posts</h4>
              <p className="text-sm text-muted-foreground">
                Analyze unlimited posts and track long-term trends
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100">
              <HardDrive className="h-4 w-4 text-amber-600" />
            </div>
            <div>
              <h4 className="font-semibold">Media Storage</h4>
              <p className="text-sm text-muted-foreground">
                Basic: 2 GB • Pro: 5 GB • Enterprise: 10 GB
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-center">
            <div className="text-lg font-bold">Pro Plan</div>
            <div className="text-2xl font-bold">{pricingPlans.pro.currency}{pricingPlans.pro.price.EUR}</div>
            <div className="text-sm text-muted-foreground">per month</div>
          </div>
          <div className="rounded-lg border border-primary/20 bg-gradient-to-br from-purple-500/10 to-pink-500/10 p-3 text-center">
            <div className="text-lg font-bold">Enterprise Plan</div>
            <div className="text-2xl font-bold">{pricingPlans.enterprise.currency}{pricingPlans.enterprise.price.EUR}</div>
            <div className="text-sm text-muted-foreground">per month</div>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            Maybe Later
          </Button>
          <Button onClick={() => window.location.href = '/#pricing'} className="flex-1">
            Upgrade Now
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
