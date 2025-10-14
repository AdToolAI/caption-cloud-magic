import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

interface NotificationSettingsProps {
  workspaceId: string;
}

export function NotificationSettings({ workspaceId }: NotificationSettingsProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Slack Settings
  const [slackWebhookUrl, setSlackWebhookUrl] = useState("");
  const [slackChannel, setSlackChannel] = useState("");
  const [slackEnabled, setSlackEnabled] = useState(false);
  
  // Discord Settings
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState("");
  const [discordEnabled, setDiscordEnabled] = useState(false);
  
  // Notification Triggers
  const [notify24h, setNotify24h] = useState(true);
  const [notify1h, setNotify1h] = useState(true);
  const [notifyPublished, setNotifyPublished] = useState(true);
  const [notifyApproval, setNotifyApproval] = useState(true);
  const [notifyStatusChange, setNotifyStatusChange] = useState(false);

  useEffect(() => {
    if (workspaceId) {
      fetchSettings();
    }
  }, [workspaceId]);

  const fetchSettings = async () => {
    setLoading(true);
    
    const { data, error } = await supabase
      .from("calendar_integrations")
      .select("*")
      .eq("workspace_id", workspaceId)
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("Failed to fetch settings:", error);
      setLoading(false);
      return;
    }

    if (data) {
      setSlackWebhookUrl(data.slack_webhook_url || "");
      setSlackChannel(data.slack_channel || "");
      
      const settings = (data.settings_json as Record<string, any>) || {};
      setDiscordWebhookUrl(settings.discord_webhook_url as string || "");
      setSlackEnabled(!!data.slack_webhook_url);
      setDiscordEnabled(!!settings.discord_webhook_url);
      
      // Load notification preferences
      setNotify24h(settings.notify_24h !== false);
      setNotify1h(settings.notify_1h !== false);
      setNotifyPublished(settings.notify_published !== false);
      setNotifyApproval(settings.notify_approval !== false);
      setNotifyStatusChange(settings.notify_status_change || false);
    }
    
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);

    const settings = {
      discord_webhook_url: discordEnabled ? discordWebhookUrl : null,
      notify_24h: notify24h,
      notify_1h: notify1h,
      notify_published: notifyPublished,
      notify_approval: notifyApproval,
      notify_status_change: notifyStatusChange,
    };

    const payload = {
      workspace_id: workspaceId,
      slack_webhook_url: slackEnabled ? slackWebhookUrl : null,
      slack_channel: slackEnabled ? slackChannel : null,
      settings_json: settings,
    };

    const { error } = await supabase
      .from("calendar_integrations")
      .upsert(payload, { onConflict: "workspace_id" });

    if (error) {
      console.error("Failed to save settings:", error);
      toast.error("Failed to save notification settings");
    } else {
      toast.success("Notification settings saved");
    }

    setSaving(false);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Loading...</CardTitle>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Slack Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Slack Notifications</CardTitle>
              <CardDescription>
                Send notifications to your Slack workspace
              </CardDescription>
            </div>
            <Switch checked={slackEnabled} onCheckedChange={setSlackEnabled} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Webhook URL</Label>
            <Input
              type="url"
              placeholder="https://hooks.slack.com/services/..."
              value={slackWebhookUrl}
              onChange={(e) => setSlackWebhookUrl(e.target.value)}
              disabled={!slackEnabled}
            />
            <p className="text-xs text-muted-foreground">
              Create a webhook at{" "}
              <a
                href="https://api.slack.com/messaging/webhooks"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Slack API
              </a>
            </p>
          </div>
          
          <div className="space-y-2">
            <Label>Channel (optional)</Label>
            <Input
              placeholder="#calendar-updates"
              value={slackChannel}
              onChange={(e) => setSlackChannel(e.target.value)}
              disabled={!slackEnabled}
            />
          </div>
        </CardContent>
      </Card>

      {/* Discord Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Discord Notifications</CardTitle>
              <CardDescription>
                Send notifications to your Discord server
              </CardDescription>
            </div>
            <Switch checked={discordEnabled} onCheckedChange={setDiscordEnabled} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Webhook URL</Label>
            <Input
              type="url"
              placeholder="https://discord.com/api/webhooks/..."
              value={discordWebhookUrl}
              onChange={(e) => setDiscordWebhookUrl(e.target.value)}
              disabled={!discordEnabled}
            />
            <p className="text-xs text-muted-foreground">
              Create a webhook in your Discord server settings → Integrations
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Notification Triggers */}
      <Card>
        <CardHeader>
          <CardTitle>Notification Triggers</CardTitle>
          <CardDescription>
            Choose when to send notifications
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="notify-24h">24h Before Publishing</Label>
            <Switch
              id="notify-24h"
              checked={notify24h}
              onCheckedChange={setNotify24h}
            />
          </div>
          
          <div className="flex items-center justify-between">
            <Label htmlFor="notify-1h">1h Before Publishing</Label>
            <Switch
              id="notify-1h"
              checked={notify1h}
              onCheckedChange={setNotify1h}
            />
          </div>
          
          <div className="flex items-center justify-between">
            <Label htmlFor="notify-published">When Published</Label>
            <Switch
              id="notify-published"
              checked={notifyPublished}
              onCheckedChange={setNotifyPublished}
            />
          </div>
          
          <div className="flex items-center justify-between">
            <Label htmlFor="notify-approval">Approval Requested</Label>
            <Switch
              id="notify-approval"
              checked={notifyApproval}
              onCheckedChange={setNotifyApproval}
            />
          </div>
          
          <div className="flex items-center justify-between">
            <Label htmlFor="notify-status">Status Changes</Label>
            <Switch
              id="notify-status"
              checked={notifyStatusChange}
              onCheckedChange={setNotifyStatusChange}
            />
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="w-full">
        <Save className="w-4 h-4 mr-2" />
        {saving ? "Saving..." : "Save Notification Settings"}
      </Button>
    </div>
  );
}