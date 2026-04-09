import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { toast } from "sonner";
import { useTranslation } from "@/hooks/useTranslation";
import { BellRing, Loader2, Smartphone, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface NotificationPreferences {
  email_reminders: boolean;
  in_app_notifications: boolean;
  render_complete_notify: boolean;
  approval_request_notify: boolean;
}

export const NotificationSettings = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    email_reminders: true,
    in_app_notifications: true,
    render_complete_notify: true,
    approval_request_notify: true,
  });

  useEffect(() => {
    const loadPreferences = async () => {
      if (!user) return;
      try {
        const { data, error } = await supabase
          .from("notification_preferences")
          .select("*")
          .eq("user_id", user.id)
          .single();
        if (error && error.code !== "PGRST116") throw error;
        if (data) {
          setPreferences({
            email_reminders: data.email_reminders ?? true,
            in_app_notifications: data.in_app_notifications ?? true,
            render_complete_notify: data.render_complete_notify ?? true,
            approval_request_notify: data.approval_request_notify ?? true,
          });
        }
      } catch (error) {
        console.error("Error loading notification preferences:", error);
      } finally {
        setLoading(false);
      }
    };
    loadPreferences();
  }, [user]);

  const updatePreference = async (key: keyof NotificationPreferences, value: boolean) => {
    if (!user) return;
    setSaving(true);
    const newPreferences = { ...preferences, [key]: value };
    setPreferences(newPreferences);
    try {
      const { error } = await supabase
        .from("notification_preferences")
        .upsert({
          user_id: user.id,
          ...newPreferences,
          updated_at: new Date().toISOString(),
        });
      if (error) throw error;
      toast.success(t("accountNotifications.saved"));
    } catch (error: any) {
      setPreferences(preferences);
      toast.error(error.message || t("accountNotifications.saveError"));
    } finally {
      setSaving(false);
    }
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
    <>
      <Card className="bg-card/60 backdrop-blur-xl border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BellRing className="h-5 w-5 text-primary" />
            {t("accountNotifications.title")}
          </CardTitle>
          <CardDescription>
            {t("accountNotifications.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t("accountNotifications.emailReminders")}</Label>
              <p className="text-xs text-muted-foreground">
                {t("accountNotifications.emailRemindersDesc")}
              </p>
            </div>
            <Switch
              checked={preferences.email_reminders}
              onCheckedChange={(checked) => updatePreference("email_reminders", checked)}
              disabled={saving}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t("accountNotifications.inAppNotifications")}</Label>
              <p className="text-xs text-muted-foreground">
                {t("accountNotifications.inAppNotificationsDesc")}
              </p>
            </div>
            <Switch
              checked={preferences.in_app_notifications}
              onCheckedChange={(checked) => updatePreference("in_app_notifications", checked)}
              disabled={saving}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t("accountNotifications.renderComplete")}</Label>
              <p className="text-xs text-muted-foreground">
                {t("accountNotifications.renderCompleteDesc")}
              </p>
            </div>
            <Switch
              checked={preferences.render_complete_notify}
              onCheckedChange={(checked) => updatePreference("render_complete_notify", checked)}
              disabled={saving}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t("accountNotifications.approvalRequests")}</Label>
              <p className="text-xs text-muted-foreground">
                {t("accountNotifications.approvalRequestsDesc")}
              </p>
            </div>
            <Switch
              checked={preferences.approval_request_notify}
              onCheckedChange={(checked) => updatePreference("approval_request_notify", checked)}
              disabled={saving}
            />
          </div>
        </CardContent>
      </Card>

      <PushNotificationCard />
    </>
  );
};

function PushNotificationCard() {
  const { t } = useTranslation();
  const { status, pushEnabled, loading, togglePush, isSupported, isDenied } = usePushNotifications();

  return (
    <Card className="bg-card/60 backdrop-blur-xl border-white/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Smartphone className="h-5 w-5 text-primary" />
          {t("accountNotifications.pushTitle")}
        </CardTitle>
        <CardDescription>
          {t("accountNotifications.pushDesc")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isSupported ? (
          <div className="flex items-start gap-3 rounded-lg bg-muted/50 p-3">
            <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5 shrink-0" />
            <div className="text-sm text-muted-foreground">
              <p className="font-medium text-foreground">{t("accountNotifications.notSupported")}</p>
              <p>{t("accountNotifications.notSupportedDesc")}</p>
              <p className="mt-1 text-xs">{t("accountNotifications.notSupportedIos")}</p>
            </div>
          </div>
        ) : isDenied ? (
          <div className="flex items-start gap-3 rounded-lg bg-destructive/10 p-3">
            <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
            <div className="text-sm text-muted-foreground">
              <p className="font-medium text-foreground">{t("accountNotifications.blocked")}</p>
              <p>{t("accountNotifications.blockedDesc")}</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t("accountNotifications.enablePush")}</Label>
              <p className="text-xs text-muted-foreground">
                {pushEnabled
                  ? t("accountNotifications.pushEnabled")
                  : t("accountNotifications.pushDisabled")}
              </p>
            </div>
            <Switch
              checked={pushEnabled}
              onCheckedChange={togglePush}
              disabled={loading}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
