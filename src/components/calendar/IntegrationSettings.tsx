import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Calendar, Slack, MessageSquare, RefreshCw, Link2Off } from "lucide-react";
import { NotificationSettings } from "./NotificationSettings";
import { useTranslation } from "@/hooks/useTranslation";

interface IntegrationSettingsProps {
  workspaceId: string;
}

export function IntegrationSettings({ workspaceId }: IntegrationSettingsProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [syncDirection, setSyncDirection] = useState<string>("push");

  useEffect(() => {
    if (workspaceId) {
      fetchIntegrationStatus();
    }
  }, [workspaceId]);

  const fetchIntegrationStatus = async () => {
    setLoading(true);
    
    const { data, error } = await supabase
      .from("calendar_integrations")
      .select("*")
      .eq("workspace_id", workspaceId)
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("Failed to fetch integration:", error);
    }

    if (data) {
      setGoogleConnected(data.google_calendar_connected || false);
      setSyncDirection(data.google_sync_direction || "push");
    }

    setLoading(false);
  };

  const handleConnectGoogle = async () => {
    try {
      const { data, error } = await supabase.functions.invoke(
        "calendar-google-oauth/authorize",
        {
          body: { workspace_id: workspaceId },
        }
      );

      if (error) throw error;

      // Open OAuth window
      window.location.href = data.authorization_url;
    } catch (error: any) {
      console.error("Failed to connect Google Calendar:", error);
      toast.error("Failed to connect Google Calendar");
    }
  };

  const handleDisconnectGoogle = async () => {
    try {
      const { error } = await supabase.functions.invoke(
        "calendar-google-oauth/disconnect",
        {
          body: { workspace_id: workspaceId },
        }
      );

      if (error) throw error;

      setGoogleConnected(false);
      toast.success("Google Calendar disconnected");
    } catch (error: any) {
      console.error("Failed to disconnect Google Calendar:", error);
      toast.error("Failed to disconnect");
    }
  };

  const handleSyncNow = async () => {
    setSyncing(true);

    try {
      const { error } = await supabase.functions.invoke("calendar-sync-google", {
        body: { workspace_id: workspaceId, sync_direction: syncDirection },
      });

      if (error) throw error;

      toast.success("Sync completed successfully");
    } catch (error: any) {
      console.error("Sync failed:", error);
      toast.error("Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const handleSyncDirectionChange = async (direction: string) => {
    setSyncDirection(direction);

    const { error } = await supabase
      .from("calendar_integrations")
      .update({ google_sync_direction: direction })
      .eq("workspace_id", workspaceId);

    if (error) {
      console.error("Failed to update sync direction:", error);
      toast.error("Failed to update sync direction");
    } else {
      toast.success("Sync direction updated");
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading integrations...</div>;
  }

  return (
    <Tabs defaultValue="google" className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="google" className="gap-2">
          <Calendar className="w-4 h-4" />
          Google Calendar
        </TabsTrigger>
        <TabsTrigger value="notifications" className="gap-2">
          <MessageSquare className="w-4 h-4" />
          Notifications
        </TabsTrigger>
      </TabsList>

      <TabsContent value="google" className="space-y-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Google Calendar Integration</CardTitle>
                <CardDescription>
                  Sync your calendar events with Google Calendar
                </CardDescription>
              </div>
              {googleConnected ? (
                <Badge variant="default" className="gap-2">
                  Connected
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-2">
                  Not Connected
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {!googleConnected ? (
              <Button onClick={handleConnectGoogle} className="w-full">
                <Calendar className="w-4 h-4 mr-2" />
                Connect Google Calendar
              </Button>
            ) : (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Sync Direction</label>
                  <Select value={syncDirection} onValueChange={handleSyncDirectionChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="push">
                        Push Only (Calendar → Google)
                      </SelectItem>
                      <SelectItem value="pull">
                        Pull Only (Google → Calendar)
                      </SelectItem>
                      <SelectItem value="two_way">
                        Two-Way Sync
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {syncDirection === "push" && "Events are synced from your calendar to Google Calendar"}
                    {syncDirection === "pull" && "Events are synced from Google Calendar to your calendar"}
                    {syncDirection === "two_way" && "Events are synced in both directions"}
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button onClick={handleSyncNow} disabled={syncing} className="flex-1">
                    <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
                    {syncing ? "Syncing..." : "Sync Now"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleDisconnectGoogle}
                  >
                    <Link2Off className="w-4 h-4 mr-2" />
                    Disconnect
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="notifications">
        <NotificationSettings workspaceId={workspaceId} />
      </TabsContent>
    </Tabs>
  );
}