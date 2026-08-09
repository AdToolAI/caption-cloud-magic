import { tx } from "@/lib/i18nText";
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
  const [googletx({ de: "Verbunden", en: "Connected", es: "Conectado" }), setGoogletx({ de: "Verbunden", en: "Connected", es: "Conectado" })] = useState(false);
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
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      console.error("Failed to fetch integration:", error);
    }

    if (data) {
      setGoogletx({ de: "Verbunden", en: "Connected", es: "Conectado" })(data.google_calendar_connected || false);
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
      console.error("Failed to connect tx({ de: "Google Calendar", en: "Google Calendar", es: "Google Calendar" }):", error);
      toast.error(tx({ de: "Fehler beim Verbinden mit tx({ de: "Google Calendar", en: "Google Calendar", es: "Google Calendar" })", en: "Failed to connect tx({ de: "Google Calendar", en: "Google Calendar", es: "Google Calendar" })", es: "Error al conectar con tx({ de: "Google Calendar", en: "Google Calendar", es: "Google Calendar" })" }));
    }
  };

  const handletx({ de: "Trennen", en: "Disconnect", es: "Desconectar" })Google = async () => {
    try {
      const { error } = await supabase.functions.invoke(
        "calendar-google-oauth/disconnect",
        {
          body: { workspace_id: workspaceId },
        }
      );

      if (error) throw error;

      setGoogletx({ de: "Verbunden", en: "Connected", es: "Conectado" })(false);
      toast.success(tx({ de: "tx({ de: "Google Calendar", en: "Google Calendar", es: "Google Calendar" }) getrennt", en: "tx({ de: "Google Calendar", en: "Google Calendar", es: "Google Calendar" }) disconnected", es: "tx({ de: "Google Calendar", en: "Google Calendar", es: "Google Calendar" }) desconectado" }));
    } catch (error: any) {
      console.error("Failed to disconnect tx({ de: "Google Calendar", en: "Google Calendar", es: "Google Calendar" }):", error);
      toast.error(tx({ de: "Fehler beim Trennen", en: "Failed to disconnect", es: "Error al desconectar" }));
    }
  };

  const handleSyncNow = async () => {
    setSyncing(true);

    try {
      const { error } = await supabase.functions.invoke("calendar-sync-google", {
        body: { workspace_id: workspaceId, sync_direction: syncDirection },
      });

      if (error) throw error;

      toast.success(tx({ de: "✅ Sync abgeschlossen", en: "✅ Sync completed", es: "✅ Sincronización completada" }));
      // Update last sync time
      await supabase
        .from("calendar_integrations")
        .update({ updated_at: new Date().toISOString() })
        .eq("workspace_id", workspaceId);
    } catch (error: any) {
      console.error("Sync failed:", error);
      toast.error(tx({ de: "❌ Sync fehlgeschlagen", en: "❌ Sync failed", es: "❌ Falló la sincronización" }));
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
      toast.error(tx({ de: "Fehler beim Aktualisieren der Sync-Richtung", en: "Failed to update sync direction", es: "Error al actualizar la dirección de sincronización" }));
    } else {
      toast.success(tx({ de: "Sync-Richtung aktualisiert", en: "Sync direction updated", es: "Dirección de sincronización actualizada" }));
    }
  };

  if (loading) {
    return <div className="text-center py-8">{tx({ de: "Integrationen werden geladen...", en: "Loading integrations...", es: "Cargando integraciones..." })}</div>;
  }

  return (
    <Tabs defaultValue="google" className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="google" className="gap-2">
          <Calendar className="w-4 h-4" />
          tx({ de: "Google Calendar", en: "Google Calendar", es: "Google Calendar" })
        </TabsTrigger>
        <TabsTrigger value="notifications" className="gap-2">
          <MessageSquare className="w-4 h-4" />
          tx({ de: "Benachrichtigungen", en: "Notifications", es: "Notificaciones" })
        </TabsTrigger>
      </TabsList>

      <TabsContent value="google" className="space-y-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>tx({ de: "Google Calendar", en: "Google Calendar", es: "Google Calendar" }) Integration</CardTitle>
                <CardDescription>
                  Sync your calendar events with tx({ de: "Google Calendar", en: "Google Calendar", es: "Google Calendar" })
                </CardDescription>
              </div>
              {googletx({ de: "Verbunden", en: "Connected", es: "Conectado" }) ? (
                <Badge variant="default" className="gap-2">
                  tx({ de: "Verbunden", en: "Connected", es: "Conectado" })
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-2">
                  Not tx({ de: "Verbunden", en: "Connected", es: "Conectado" })
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {!googletx({ de: "Verbunden", en: "Connected", es: "Conectado" }) ? (
              <Button onClick={handleConnectGoogle} className="w-full">
                <Calendar className="w-4 h-4 mr-2" />
                Connect tx({ de: "Google Calendar", en: "Google Calendar", es: "Google Calendar" })
              </Button>
            ) : (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{tx({ de: "Sync-Richtung", en: "Sync direction", es: "Dirección de sincronización" })}</label>
                  <Select value={syncDirection} onValueChange={handleSyncDirectionChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="push">
                        tx({ de: "Nur Push (Kalender → Google)", en: "Push Only (Calendar → Google)", es: "Solo push (Calendario → Google)" })
                      </SelectItem>
                      <SelectItem value="pull">
                        tx({ de: "Nur Pull (Google → Kalender)", en: "Pull Only (Google → Calendar)", es: "Solo pull (Google → Calendario)" })
                      </SelectItem>
                      <SelectItem value="two_way">
                        tx({ de: "Zwei-Wege-Sync", en: "Two-way sync", es: "Sincronización bidireccional" })
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {syncDirection === "push" && "Events are synced from your calendar to tx({ de: "Google Calendar", en: "Google Calendar", es: "Google Calendar" })"}
                    {syncDirection === "pull" && "Events are synced from tx({ de: "Google Calendar", en: "Google Calendar", es: "Google Calendar" }) to your calendar"}
                    {syncDirection === "two_way" && "tx({ de: "Ereignisse werden in beide Richtungen synchronisiert", en: "Events are synced in both directions", es: "Los eventos se sincronizan en ambas direcciones." })"}
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button onClick={handleSyncNow} disabled={syncing} className="flex-1">
                    <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
                    {syncing ? tx({ de: "Synchronisiere...", en: "Syncing...", es: "Sincronizando..." }) : tx({ de: "Jetzt synchronisieren", en: "Sync now", es: "Sincronizar ahora" })}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handletx({ de: "Trennen", en: "Disconnect", es: "Desconectar" })Google}
                  >
                    <Link2Off className="w-4 h-4 mr-2" />
                    tx({ de: "Trennen", en: "Disconnect", es: "Desconectar" })
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