import { useState, useEffect } from "react";
import { Calendar, RefreshCw, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContextSwitcher } from "./ContextSwitcher";
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
      .maybeSingle();

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

      toast.success(`✅ ${t('calendar.syncSuccess')}`);
      fetchGoogleStatus();
    } catch (error: any) {
      console.error("Sync failed:", error);
      toast.error(`❌ ${t('calendar.syncFailed')}`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className={cn(
      "flex gap-3 px-4 py-3 backdrop-blur-xl bg-card/60 border border-white/10 rounded-xl",
      isMobile ? "flex-col" : "items-center justify-between"
    )}>
      <ContextSwitcher
        workspaceId={workspaceId}
        clientId={clientId}
        brandId={brandId}
        workspaces={workspaces}
        clients={clients}
        brands={brands}
        onWorkspaceChange={onWorkspaceChange}
        onClientChange={onClientChange}
        onBrandChange={onBrandChange}
      />


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
