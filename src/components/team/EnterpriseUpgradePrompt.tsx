import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Crown, Users, Zap } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { trackEvent, ANALYTICS_EVENTS } from "@/lib/analytics";

interface EnterpriseUpgradePromptProps {
  onUpgrade: () => void;
  currency: "EUR" | "USD";
}

export const EnterpriseUpgradePrompt = ({ onUpgrade, currency }: EnterpriseUpgradePromptProps) => {
  const { t } = useTranslation();
  const price = currency === "EUR" ? "€49.99" : "$49.99";

  const handleUpgradeClick = () => {
    trackEvent(ANALYTICS_EVENTS.UPGRADE_CLICKED, {
      from_plan: 'unknown',
      to_plan: 'enterprise',
      feature: 'enterprise_team_prompt',
      currency
    });
    onUpgrade();
  };

  return (
    <Card className="border-2 border-primary/20">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Crown className="h-5 w-5 text-primary" />
          <CardTitle>Enterprise Team Features</CardTitle>
        </div>
        <CardDescription>
          Unlock team collaboration with multiple members
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span>Add unlimited team members</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Zap className="h-4 w-4 text-muted-foreground" />
            <span>Collaborative workspace features</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Crown className="h-4 w-4 text-muted-foreground" />
            <span>Priority support & advanced tools</span>
          </div>
        </div>
        
        <div className="rounded-lg bg-muted p-4">
          <p className="text-sm font-medium">Pricing</p>
          <p className="text-2xl font-bold text-primary">{price}</p>
          <p className="text-xs text-muted-foreground">per member per month</p>
        </div>

        <Button onClick={handleUpgradeClick} className="w-full" size="lg">
          <Crown className="mr-2 h-4 w-4" />
          Upgrade to Enterprise
        </Button>
      </CardContent>
    </Card>
  );
};
