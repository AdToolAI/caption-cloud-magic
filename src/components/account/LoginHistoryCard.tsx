import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { History, Monitor, Smartphone, Tablet, Loader2, MapPin } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";

interface LoginEntry {
  id: string;
  device_info: string;
  browser: string;
  os: string;
  location: string;
  created_at: string;
}

export const LoginHistoryCard = () => {
  const { user } = useAuth();
  const [history, setHistory] = useState<LoginEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadHistory = async () => {
      if (!user) return;

      try {
        const { data, error } = await supabase
          .from("user_sessions")
          .select("id, device_info, browser, os, location, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(10);

        if (error) throw error;
        setHistory(data || []);
      } catch (error) {
        console.error("Error loading login history:", error);
      } finally {
        setLoading(false);
      }
    };

    loadHistory();
  }, [user]);

  const getDeviceIcon = (deviceInfo: string) => {
    const lowerDevice = deviceInfo.toLowerCase();
    if (lowerDevice.includes("mobile") || lowerDevice.includes("phone")) {
      return <Smartphone className="h-4 w-4" />;
    }
    if (lowerDevice.includes("tablet") || lowerDevice.includes("ipad")) {
      return <Tablet className="h-4 w-4" />;
    }
    return <Monitor className="h-4 w-4" />;
  };

  return (
    <Card className="bg-card/60 backdrop-blur-xl border-white/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5 text-primary" />
          Login-Verlauf
        </CardTitle>
        <CardDescription>
          Deine letzten 10 Anmeldungen
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : history.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">
            Keine Login-Daten verfügbar
          </p>
        ) : (
          <div className="space-y-3">
            {history.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/20 border border-white/5"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-primary/10 text-primary">
                    {getDeviceIcon(entry.device_info)}
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      {entry.browser} auf {entry.os}
                    </p>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      {entry.location || "Unbekannt"}
                    </div>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">
                  {format(new Date(entry.created_at), "dd. MMM yyyy, HH:mm", { locale: de })}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
