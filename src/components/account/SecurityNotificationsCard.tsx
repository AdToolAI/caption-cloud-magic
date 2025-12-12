import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Bell, Loader2 } from "lucide-react";

export const SecurityNotificationsCard = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [securityAlerts, setSecurityAlerts] = useState(true);
  const [loginNotifications, setLoginNotifications] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      if (!user) return;

      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("security_alerts_enabled, login_notification_enabled")
          .eq("id", user.id)
          .single();

        if (error) throw error;
        
        if (data) {
          setSecurityAlerts(data.security_alerts_enabled ?? true);
          setLoginNotifications(data.login_notification_enabled ?? false);
        }
      } catch (error) {
        console.error("Error loading security settings:", error);
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
      toast.success("Einstellung gespeichert");
    } catch (error: any) {
      toast.error(error.message || "Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  };

  const handleSecurityAlertsChange = (checked: boolean) => {
    setSecurityAlerts(checked);
    updateSetting("security_alerts_enabled", checked);
  };

  const handleLoginNotificationsChange = (checked: boolean) => {
    setLoginNotifications(checked);
    updateSetting("login_notification_enabled", checked);
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
          <Bell className="h-5 w-5 text-primary" />
          Sicherheitsbenachrichtigungen
        </CardTitle>
        <CardDescription>
          Verwalte deine Sicherheits-E-Mails
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Sicherheitswarnungen</Label>
            <p className="text-xs text-muted-foreground">
              E-Mail bei verdächtigen Aktivitäten
            </p>
          </div>
          <Switch
            checked={securityAlerts}
            onCheckedChange={handleSecurityAlertsChange}
            disabled={saving}
          />
        </div>
        
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Login-Benachrichtigungen</Label>
            <p className="text-xs text-muted-foreground">
              E-Mail bei jeder neuen Anmeldung
            </p>
          </div>
          <Switch
            checked={loginNotifications}
            onCheckedChange={handleLoginNotificationsChange}
            disabled={saving}
          />
        </div>
      </CardContent>
    </Card>
  );
};
