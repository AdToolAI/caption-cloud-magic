import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState } from "react";
import { Loader2, RefreshCw, Unlink, Twitter } from "lucide-react";
import { TokenStatusBadge } from "./TokenStatusBadge";
import { TokenExpiryBadge } from "./TokenExpiryBadge";

interface XConnectionCardProps {
  connection: any;
  onSync: () => void;
  isSyncing: boolean;
}

export const XConnectionCard = ({ connection, onSync, isSyncing }: XConnectionCardProps) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const handleConnect = async () => {
    try {
      setIsConnecting(true);
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast.error("Bitte melde dich zuerst an");
        return;
      }

      const { data, error } = await supabase.functions.invoke('x-oauth-start', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) throw error;

      if (data.authUrl) {
        window.location.href = data.authUrl;
      }
    } catch (error: any) {
      console.error('X connection error:', error);
      toast.error(error.message || "Fehler beim Verbinden mit X");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleRefreshToken = async () => {
    if (!connection) return;
    
    try {
      setIsRefreshing(true);
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast.error("Bitte melde dich zuerst an");
        return;
      }

      const { error } = await supabase.functions.invoke('x-refresh-token', {
        body: { connectionId: connection.id },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) throw error;

      toast.success("X Token erfolgreich erneuert");
      window.location.reload();
    } catch (error: any) {
      console.error('X token refresh error:', error);
      toast.error(error.message || "Fehler beim Erneuern des Tokens");
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleDisconnect = async () => {
    if (!connection) return;
    
    if (!confirm("Möchtest du die X-Verbindung wirklich trennen?")) {
      return;
    }

    try {
      setIsDisconnecting(true);
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast.error("Bitte melde dich zuerst an");
        return;
      }

      const { error } = await supabase.functions.invoke('x-disconnect', {
        body: { connectionId: connection.id },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) throw error;

      toast.success("X-Verbindung getrennt");
      window.location.reload();
    } catch (error: any) {
      console.error('X disconnect error:', error);
      toast.error(error.message || "Fehler beim Trennen");
    } finally {
      setIsDisconnecting(false);
    }
  };

  if (!connection) {
    return (
      <Card className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-black flex items-center justify-center">
              <Twitter className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="font-semibold">X (Twitter)</h3>
              <p className="text-sm text-muted-foreground">Noch nicht verbunden</p>
            </div>
          </div>
          <Badge variant="outline">Nicht verbunden</Badge>
        </div>
        
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Verbinde dein X-Konto, um Posts zu veröffentlichen und Performance-Daten zu tracken.
          </p>
          <Badge variant="outline" className="text-xs">
            Media Upload via v1.1 • Tweet via v2
          </Badge>
          <Button 
            onClick={handleConnect} 
            disabled={isConnecting}
            className="w-full"
          >
            {isConnecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Mit X verbinden
          </Button>
        </div>
      </Card>
    );
  }

  const metadata = connection.account_metadata || {};

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarImage src={metadata.profile_image_url} />
            <AvatarFallback>
              <Twitter className="h-5 w-5" />
            </AvatarFallback>
          </Avatar>
          <div>
            <h3 className="font-semibold">{metadata.name || "X Account"}</h3>
            <p className="text-sm text-muted-foreground">{connection.account_name}</p>
          </div>
        </div>
        <div className="flex flex-col gap-2 items-end">
          <TokenStatusBadge 
            lastSyncAt={connection.last_sync_at}
            hasError={connection.token_expires_at && new Date(connection.token_expires_at) < new Date()}
          />
          <TokenExpiryBadge provider="x" />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex gap-2">
          <Button 
            onClick={onSync} 
            disabled={isSyncing}
            variant="outline"
            className="flex-1"
          >
            {isSyncing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Jetzt synchronisieren
          </Button>
          <Button
            onClick={handleRefreshToken}
            disabled={isRefreshing}
            variant="outline"
            size="icon"
          >
            {isRefreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
          <Button
            onClick={handleDisconnect}
            disabled={isDisconnecting}
            variant="outline"
            size="icon"
          >
            {isDisconnecting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Unlink className="h-4 w-4" />
            )}
          </Button>
        </div>
        
        {connection.last_sync_at && (
          <p className="text-xs text-muted-foreground">
            Letzte Synchronisierung: {new Date(connection.last_sync_at).toLocaleString('de-DE')}
          </p>
        )}
      </div>
    </Card>
  );
};
