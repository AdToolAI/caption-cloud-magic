import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useTranslation } from "@/hooks/useTranslation";
import { Link2, Loader2, Check, X } from "lucide-react";
import { format } from "date-fns";
import { de, enUS, es } from "date-fns/locale";

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
  const { t, language } = useTranslation();
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<Platform | null>(null);

  const dateLocale = language === 'de' ? de : language === 'es' ? es : enUS;

  useEffect(() => {
    const loadCredentials = async () => {
      if (!user) return;
      try {
        const { data, error } = await supabase
          .from("social_connections")
          .select("id, provider, last_sync_at")
          .eq("user_id", user.id);
        if (error) throw error;
        setCredentials((data || []).map((row: any) => ({
          platform: row.provider as Platform,
          is_connected: true,
          last_verified_at: row.last_sync_at,
          connection_id: row.id,
        })));
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
    toast.info(`${t("accountLinked.redirecting")} ${PLATFORMS[platform].name}...`);
  };

  const handleDisconnect = async (platform: Platform) => {
    if (!user) return;
    setActionLoading(platform);
    try {
      const credential = getCredential(platform);
      if (!credential?.connection_id) return;
      const { error } = await supabase
        .from("social_connections")
        .delete()
        .eq("id", credential.connection_id);
      if (error) throw error;
      setCredentials((prev) =>
        prev.map((c) =>
          c.platform === platform ? { ...c, is_connected: false } : c
        )
      );
      toast.success(`${PLATFORMS[platform].name} ${t("accountLinked.disconnected")}`);
    } catch (error: any) {
      toast.error(error.message || t("accountLinked.disconnectError"));
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
          {t("accountLinked.title")}
        </CardTitle>
        <CardDescription>
          {t("accountLinked.description")}
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
                      {t("accountLinked.lastVerified")}: {format(new Date(credential.last_verified_at), "dd. MMM yyyy", { locale: dateLocale })}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {isConnected ? (
                  <>
                    <Badge variant="outline" className="border-green-500/50 text-green-500">
                      <Check className="h-3 w-3 mr-1" />
                      {t("accountLinked.connected")}
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
                    {t("accountLinked.connect")}
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
