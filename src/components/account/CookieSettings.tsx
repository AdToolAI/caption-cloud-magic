import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useTranslation } from "@/hooks/useTranslation";
import { Cookie, Loader2 } from "lucide-react";
import posthog from "posthog-js";

export const CookieSettings = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(true);
  const [personalizedRecommendations, setPersonalizedRecommendations] = useState(true);

  useEffect(() => {
    const loadSettings = async () => {
      if (!user) return;
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("analytics_enabled, personalized_recommendations")
          .eq("id", user.id)
          .single();
        if (error) throw error;
        if (data) {
          setAnalyticsEnabled(data.analytics_enabled ?? true);
          setPersonalizedRecommendations(data.personalized_recommendations ?? true);
        }
      } catch (error) {
        console.error("Error loading cookie settings:", error);
      } finally {
        setLoading(false);
      }
    };
    loadSettings();
  }, [user]);

  const updateSetting = async (field: string, value: boolean) => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ [field]: value })
        .eq("id", user.id);
      if (error) throw error;
      if (field === "analytics_enabled") {
        if (value) {
          posthog.opt_in_capturing();
        } else {
          posthog.opt_out_capturing();
        }
      }
      toast.success(t("accountCookie.saved"));
    } catch (error: any) {
      toast.error(error.message || t("accountCookie.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const handleAnalyticsChange = (checked: boolean) => {
    setAnalyticsEnabled(checked);
    updateSetting("analytics_enabled", checked);
  };

  const handleRecommendationsChange = (checked: boolean) => {
    setPersonalizedRecommendations(checked);
    updateSetting("personalized_recommendations", checked);
  };

  if (loading) {
    return (
      <Card className="bg-card/60 backdrop-blur-xl border-white/10">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card/60 backdrop-blur-xl border-white/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cookie className="h-5 w-5 text-primary" />
          {t("accountCookie.title")}
        </CardTitle>
        <CardDescription>
          {t("accountCookie.description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>{t("accountCookie.analytics")}</Label>
            <p className="text-xs text-muted-foreground">
              {t("accountCookie.analyticsDesc")}
            </p>
          </div>
          <Switch
            checked={analyticsEnabled}
            onCheckedChange={handleAnalyticsChange}
            disabled={saving}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>{t("accountCookie.recommendations")}</Label>
            <p className="text-xs text-muted-foreground">
              {t("accountCookie.recommendationsDesc")}
            </p>
          </div>
          <Switch
            checked={personalizedRecommendations}
            onCheckedChange={handleRecommendationsChange}
            disabled={saving}
          />
        </div>

        <div className="pt-2 border-t border-white/5">
          <p className="text-xs text-muted-foreground">
            {t("accountCookie.requiredNote")}
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
