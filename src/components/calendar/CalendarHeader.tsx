import { useState, useEffect } from "react";
import { ChevronRight, Calendar, RefreshCw, CheckCircle2, XCircle } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/hooks/useTranslation";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface CalendarHeaderProps {
  workspaceId: string | null;
  clientId: string | null;
  brandId: string | null;
  onWorkspaceChange: (id: string) => void;
  onClientChange: (id: string) => void;
  onBrandChange: (id: string) => void;
  workspaces: Array<{ id: string; name: string }>;
  clients: Array<{ id: string; name: string }>;
  brands: Array<{ id: string; name: string }>;
  onOpenIntegrations?: () => void;
}

export function CalendarHeader({
  workspaceId,
  clientId,
  brandId,
  onWorkspaceChange,
  onClientChange,
  onBrandChange,
  workspaces,
  clients,
  brands,
  onOpenIntegrations,
}: CalendarHeaderProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [googleConnected, setGoogleConnected] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [syncDirection, setSyncDirection] = useState<string>("push");

  useEffect(() => {
    if (workspaceId) {
      fetchGoogleStatus();
    }
  }, [workspaceId]);

  const fetchGoogleStatus = async () => {
    if (!workspaceId) return;
    
    const { data } = await supabase
      .from("calendar_integrations")
      .select("*")
      .eq("workspace_id", workspaceId)
      .single();

    if (data) {
      setGoogleConnected(data.google_calendar_connected || false);
      setLastSync(data.updated_at || null);
      setSyncDirection(data.google_sync_direction || "push");
    }
  };

  const handleQuickSync = async () => {
    if (!workspaceId) return;
    
    setSyncing(true);
    try {
      const { error } = await supabase.functions.invoke("calendar-sync-google", {
        body: { workspace_id: workspaceId, sync_direction: syncDirection },
      });

      if (error) throw error;

      // Update last sync timestamp
      await supabase
        .from("calendar_integrations")
        .update({ updated_at: new Date().toISOString() })
        .eq("workspace_id", workspaceId);

      toast.success("✅ Kalender erfolgreich synchronisiert");
      fetchGoogleStatus(); // Refresh status
    } catch (error: any) {
      console.error("Sync failed:", error);
      toast.error("❌ Synchronisierung fehlgeschlagen");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-4 mb-6">
      {/* Filter Row */}
      <div className={cn(
        "flex gap-2 px-4 py-3 bg-muted/50 rounded-lg",
        isMobile ? "flex-col" : "items-center"
      )}>
      <Select value={workspaceId || undefined} onValueChange={onWorkspaceChange}>
        <SelectTrigger className={isMobile ? "w-full" : "w-[200px]"}>
          <SelectValue placeholder={t("calendar.selectWorkspace")} />
        </SelectTrigger>
        <SelectContent>
          {workspaces.map((workspace) => (
            <SelectItem key={workspace.id} value={workspace.id}>
              {workspace.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {!isMobile && <ChevronRight className="w-4 h-4 text-muted-foreground" />}

      <Select value={clientId || undefined} onValueChange={onClientChange} disabled={!workspaceId}>
        <SelectTrigger className={isMobile ? "w-full" : "w-[200px]"}>
          <SelectValue placeholder={t("calendar.selectClient")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("calendar.allClients")}</SelectItem>
          {clients.map((client) => (
            <SelectItem key={client.id} value={client.id}>
              {client.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {!isMobile && <ChevronRight className="w-4 h-4 text-muted-foreground" />}

      <Select value={brandId || undefined} onValueChange={onBrandChange} disabled={!workspaceId}>
        <SelectTrigger className={isMobile ? "w-full" : "w-[200px]"}>
          <SelectValue placeholder={t("calendar.selectBrand")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("calendar.allBrands")}</SelectItem>
          {brands.map((brand) => (
            <SelectItem key={brand.id} value={brand.id}>
              {brand.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      </div>

      {/* Google Calendar Sync Status */}
      {workspaceId && (
        <div className={cn(
          "flex gap-3 px-4 py-3 bg-card border rounded-lg",
          isMobile ? "flex-col" : "items-center justify-between"
        )}>
          <div className="flex items-center gap-3">
            <Calendar className="w-5 h-5 text-muted-foreground" />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">Google Calendar</span>
                {googleConnected ? (
                  <Badge variant="default" className="gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Verbunden
                  </Badge>
                ) : (
                  <Badge variant="outline" className="gap-1">
                    <XCircle className="w-3 h-3" />
                    Nicht verbunden
                  </Badge>
                )}
              </div>
              {lastSync && googleConnected && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Letzte Sync: {new Date(lastSync).toLocaleString('de-DE')}
                </p>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {googleConnected && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleQuickSync}
                disabled={syncing}
                className="gap-2"
              >
                <RefreshCw className={cn("w-4 h-4", syncing && "animate-spin")} />
                {syncing ? "Sync läuft..." : "Jetzt synchronisieren"}
              </Button>
            )}
            <Button
              variant={googleConnected ? "outline" : "default"}
              size="sm"
              onClick={onOpenIntegrations}
              className="gap-2"
            >
              <Calendar className="w-4 h-4" />
              {googleConnected ? "Einstellungen" : "Verbinden"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}