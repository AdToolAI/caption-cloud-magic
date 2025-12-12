import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Cookie, Loader2 } from "lucide-react";
import posthog from "posthog-js";

export const CookieSettings = () => {
  const { user } = useAuth();
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

      // Handle PostHog tracking based on analytics setting
      if (field === "analytics_enabled") {
        if (value) {
          posthog.opt_in_capturing();
        } else {
          posthog.opt_out_capturing();
        }
      }

      toast.success("Einstellung gespeichert");
    } catch (error: any) {
      toast.error(error.message || "Fehler beim Speichern");
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
          Cookie & Tracking
        </CardTitle>
        <CardDescription>
          Verwalte deine Datenschutz-Einstellungen
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Analytics-Tracking</Label>
            <p className="text-xs text-muted-foreground">
              Hilft uns, die App zu verbessern
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
            <Label>Personalisierte Empfehlungen</Label>
            <p className="text-xs text-muted-foreground">
              Inhalte basierend auf deiner Nutzung
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
            Notwendige Cookies für die Grundfunktionalität können nicht deaktiviert werden.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
