import { ConnectionsTab } from "@/components/performance/ConnectionsTab";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { Card } from "@/components/ui/card";
import { SEO } from "@/components/SEO";
import { Link2, Shield, Zap } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/hooks/useTranslation";

export default function Integrations() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [userPlan, setUserPlan] = useState<string>("free");

  useEffect(() => {
    if (user) {
      loadUserPlan();
    }
  }, [user]);

  const loadUserPlan = async () => {
    if (!user) return;
    
    const { data } = await supabase
      .from("profiles")
      .select("plan, test_mode_plan")
      .eq("id", user.id)
      .single();
    
    if (data) {
      setUserPlan(data.test_mode_plan || data.plan);
    }
  };

  const planLimits = {
    free: { connections: 0, label: t('socialIntegrations.noConnections') },
    pro: { connections: 3, label: t('socialIntegrations.upTo3') },
    enterprise: { connections: Infinity, label: t('socialIntegrations.unlimited') }
  };

  const currentLimit = planLimits[userPlan as keyof typeof planLimits] || planLimits.free;

  return (
    <PageWrapper>
      <SEO
        title={`${t('socialIntegrations.title')} | CaptionGenie`}
        description={t('socialIntegrations.seoDescription')}
      />
      
      <div className="space-y-6 max-w-7xl mx-auto p-6">
        {/* Hero Section */}
        <Card className="p-8 bg-gradient-to-br from-primary/5 via-secondary/5 to-accent/5 border-primary/10">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-primary/10 rounded-lg">
              <Link2 className="h-8 w-8 text-primary" />
            </div>
            <div className="flex-1">
              <h1 className="text-3xl font-bold mb-2">{t('socialIntegrations.title')}</h1>
              <p className="text-muted-foreground text-lg mb-4">
                {t('socialIntegrations.subtitle')}
              </p>
              <div className="flex flex-wrap gap-3">
                <Badge variant="outline" className="gap-2">
                  <Shield className="h-3 w-3" />
                  {t('socialIntegrations.secureOAuth')}
                </Badge>
                <Badge variant="outline" className="gap-2">
                  <Zap className="h-3 w-3" />
                  {t('socialIntegrations.autoSync')}
                </Badge>
              </div>
            </div>
          </div>
        </Card>

        {/* Plan Limits Info */}
        <Card className="p-6 bg-card/50 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold mb-1">{t('socialIntegrations.currentPlan')}</h3>
              <p className="text-sm text-muted-foreground">
                {currentLimit.label}
              </p>
            </div>
            <Badge variant="secondary" className="text-base px-4 py-2">
              {userPlan.toUpperCase()}
            </Badge>
          </div>
          
          {userPlan === "free" && (
            <div className="mt-4 p-4 bg-primary/5 rounded-lg border border-primary/10">
             <p className="text-sm text-muted-foreground mb-2">
                💡 {t('socialIntegrations.proHint')}
              </p>
              <a 
                href="/pricing" 
                className="text-sm text-primary hover:underline font-medium"
              >
                {t('socialIntegrations.upgradeNow')}
              </a>
            </div>
          )}
        </Card>

        {/* Connections Tab */}
        <ConnectionsTab />
      </div>
    </PageWrapper>
  );
}
