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

      await supabase
        .from("calendar_integrations")
        .update({ updated_at: new Date().toISOString() })
        .eq("workspace_id", workspaceId);

      toast.success("✅ Kalender erfolgreich synchronisiert");
      fetchGoogleStatus();
    } catch (error: any) {
      console.error("Sync failed:", error);
      toast.error("❌ Synchronisierung fehlgeschlagen");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className={cn(
      "flex gap-3 px-4 py-3 backdrop-blur-xl bg-card/60 border border-white/10 rounded-xl",
      isMobile ? "flex-col" : "items-center justify-between"
    )}>
      {/* Left: Filter Dropdowns */}
      <div className={cn(
        "flex gap-2",
        isMobile ? "flex-col w-full" : "items-center"
      )}>
        <Select value={workspaceId || undefined} onValueChange={onWorkspaceChange}>
          <SelectTrigger className={cn(
            "h-9 bg-muted/30 border-white/10 hover:border-primary/40 focus:border-primary/60 transition-all duration-200",
            isMobile ? "w-full" : "w-[160px]"
          )}>
            <SelectValue placeholder={t("calendar.selectWorkspace")} />
          </SelectTrigger>
          <SelectContent className="backdrop-blur-xl bg-popover/95 border-white/10">
            {workspaces.map((workspace) => (
              <SelectItem key={workspace.id} value={workspace.id}>
                {workspace.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {!isMobile && <ChevronRight className="w-3 h-3 text-primary/60" />}

        <Select value={clientId || undefined} onValueChange={onClientChange} disabled={!workspaceId}>
          <SelectTrigger className={cn(
            "h-9 bg-muted/30 border-white/10 hover:border-primary/40 focus:border-primary/60 transition-all duration-200",
            isMobile ? "w-full" : "w-[160px]"
          )}>
            <SelectValue placeholder={t("calendar.selectClient")} />
          </SelectTrigger>
          <SelectContent className="backdrop-blur-xl bg-popover/95 border-white/10">
            <SelectItem value="all">{t("calendar.allClients")}</SelectItem>
            {clients.map((client) => (
              <SelectItem key={client.id} value={client.id}>
                {client.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {!isMobile && <ChevronRight className="w-3 h-3 text-primary/60" />}

        <Select value={brandId || undefined} onValueChange={onBrandChange} disabled={!workspaceId}>
          <SelectTrigger className={cn(
            "h-9 bg-muted/30 border-white/10 hover:border-primary/40 focus:border-primary/60 transition-all duration-200",
            isMobile ? "w-full" : "w-[160px]"
          )}>
            <SelectValue placeholder={t("calendar.selectBrand")} />
          </SelectTrigger>
          <SelectContent className="backdrop-blur-xl bg-popover/95 border-white/10">
            <SelectItem value="all">{t("calendar.allBrands")}</SelectItem>
            {brands.map((brand) => (
              <SelectItem key={brand.id} value={brand.id}>
                {brand.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Right: Google Calendar Status (compact) */}
      {workspaceId && (
        <div className={cn(
          "flex gap-2",
          isMobile ? "flex-wrap" : "items-center"
        )}>
          {googleConnected ? (
            <Badge className="gap-1 h-7 bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
              <CheckCircle2 className="w-3 h-3" />
              Google
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 h-7 border-white/20 text-muted-foreground">
              <XCircle className="w-3 h-3" />
              Google
            </Badge>
          )}
          
          {googleConnected && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleQuickSync}
              disabled={syncing}
              className="h-7 px-2 hover:bg-primary/10"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", syncing && "animate-spin")} />
            </Button>
          )}
          
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenIntegrations}
            className="h-7 px-2 hover:bg-primary/10"
          >
            <Calendar className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
