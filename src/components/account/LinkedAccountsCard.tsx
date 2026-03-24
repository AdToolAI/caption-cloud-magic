import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Link2, Loader2, Check, X } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";

type Platform = "instagram" | "tiktok" | "linkedin" | "youtube" | "facebook" | "x";

interface PlatformInfo {
  name: string;
  color: string;
  icon: string;
}

const PLATFORMS: Record<Platform, PlatformInfo> = {
  instagram: { name: "Instagram", color: "bg-gradient-to-r from-purple-500 to-pink-500", icon: "📸" },
  tiktok: { name: "TikTok", color: "bg-black", icon: "🎵" },
  linkedin: { name: "LinkedIn", color: "bg-blue-600", icon: "💼" },
  youtube: { name: "YouTube", color: "bg-red-600", icon: "▶️" },
  facebook: { name: "Facebook", color: "bg-blue-500", icon: "👤" },
  x: { name: "X (Twitter)", color: "bg-black", icon: "𝕏" },
};

interface Credential {
  platform: Platform;
  is_connected: boolean;
  last_verified_at: string | null;
  connection_id?: string;
}

export const LinkedAccountsCard = () => {
  const { user } = useAuth();
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<Platform | null>(null);

  useEffect(() => {
    const loadCredentials = async () => {
      if (!user) return;

      try {
        const { data, error } = await supabase
          .from("platform_credentials")
          .select("platform, is_connected, last_verified_at")
          .eq("user_id", user.id);

        if (error) throw error;
        setCredentials((data as Credential[]) || []);
      } catch (error) {
        console.error("Error loading credentials:", error);
      } finally {
        setLoading(false);
      }
    };

    loadCredentials();
  }, [user]);

  const getCredential = (platform: Platform): Credential | undefined => {
    return credentials.find((c) => c.platform === platform);
  };

  const handleConnect = (platform: Platform) => {
    // Redirect to platform connection flow
    toast.info(`Weiterleitung zu ${PLATFORMS[platform].name}...`);
    // TODO: Implement OAuth flow for each platform
  };

  const handleDisconnect = async (platform: Platform) => {
    if (!user) return;

    setActionLoading(platform);
    try {
      const { error } = await supabase
        .from("platform_credentials")
        .update({ is_connected: false })
        .eq("user_id", user.id)
        .eq("platform", platform);

      if (error) throw error;

      setCredentials((prev) =>
        prev.map((c) =>
          c.platform === platform ? { ...c, is_connected: false } : c
        )
      );
      toast.success(`${PLATFORMS[platform].name} getrennt`);
    } catch (error: any) {
      toast.error(error.message || "Fehler beim Trennen");
    } finally {
      setActionLoading(null);
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
    <Card className="bg-card/60 backdrop-blur-xl border-white/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-5 w-5 text-primary" />
          Verknüpfte Konten
        </CardTitle>
        <CardDescription>
          Verbinde deine Social-Media-Konten
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {(Object.keys(PLATFORMS) as Platform[]).map((platform) => {
          const info = PLATFORMS[platform];
          const credential = getCredential(platform);
          const isConnected = credential?.is_connected ?? false;
          const isLoading = actionLoading === platform;

          return (
            <div
              key={platform}
              className="flex items-center justify-between p-3 rounded-lg bg-muted/20 border border-white/5"
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${info.color} text-white text-lg`}>
                  {info.icon}
                </div>
                <div>
                  <p className="font-medium">{info.name}</p>
                  {isConnected && credential?.last_verified_at && (
                    <p className="text-xs text-muted-foreground">
                      Zuletzt verifiziert: {format(new Date(credential.last_verified_at), "dd. MMM yyyy", { locale: de })}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {isConnected ? (
                  <>
                    <Badge variant="outline" className="border-green-500/50 text-green-500">
                      <Check className="h-3 w-3 mr-1" />
                      Verbunden
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDisconnect(platform)}
                      disabled={isLoading}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      {isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <X className="h-4 w-4" />
                      )}
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleConnect(platform)}
                    className="border-white/10"
                  >
                    Verbinden
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};
