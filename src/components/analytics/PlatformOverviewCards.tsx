import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Eye, Heart, MessageCircle, TrendingUp, Instagram, Facebook, Youtube, Music, Linkedin, Twitter } from "lucide-react";

const PLATFORMS = [
  { id: "instagram", label: "Instagram", icon: Instagram, color: "text-pink-500", glow: "drop-shadow-[0_0_8px_rgba(236,72,153,0.6)]" },
  { id: "facebook", label: "Facebook", icon: Facebook, color: "text-blue-500", glow: "drop-shadow-[0_0_8px_rgba(59,130,246,0.6)]" },
  { id: "youtube", label: "YouTube", icon: Youtube, color: "text-red-600", glow: "drop-shadow-[0_0_8px_rgba(220,38,38,0.6)]" },
  { id: "tiktok", label: "TikTok", icon: Music, color: "text-foreground", glow: "drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]" },
  { id: "linkedin", label: "LinkedIn", icon: Linkedin, color: "text-blue-600", glow: "drop-shadow-[0_0_8px_rgba(37,99,235,0.6)]" },
  { id: "x", label: "X", icon: Twitter, color: "text-foreground", glow: "drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]" },
];

interface PlatformMetrics {
  provider: string;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  avgEngagement: number;
  postCount: number;
  connected: boolean;
}

export function PlatformOverviewCards() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<Record<string, PlatformMetrics>>({});
  const [connections, setConnections] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    try {
      // Load connections
      const { data: conns } = await supabase
        .from("social_connections")
        .select("provider")
        .eq("user_id", user.id);
      
      const connSet = new Set((conns || []).map(c => c.provider));
      setConnections(connSet);

      // Load metrics per platform
      const { data: metricsData } = await supabase
        .from("post_metrics")
        .select("provider, impressions, likes, comments, shares, engagement_rate")
        .eq("user_id", user.id);

      const grouped: Record<string, PlatformMetrics> = {};
      for (const p of PLATFORMS) {
        const platformData = (metricsData || []).filter(m => m.provider === p.id);
        grouped[p.id] = {
          provider: p.id,
          totalViews: platformData.reduce((s, m) => s + (m.impressions || 0), 0),
          totalLikes: platformData.reduce((s, m) => s + (m.likes || 0), 0),
          totalComments: platformData.reduce((s, m) => s + (m.comments || 0), 0),
          totalShares: platformData.reduce((s, m) => s + (m.shares || 0), 0),
          avgEngagement: platformData.length > 0
            ? platformData.reduce((s, m) => s + (m.engagement_rate || 0), 0) / platformData.length
            : 0,
          postCount: platformData.length,
          connected: connSet.has(p.id),
        };
      }
      setMetrics(grouped);
    } catch (err) {
      console.error("Error loading platform metrics:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="pb-3"><div className="h-5 bg-muted rounded w-1/2" /></CardHeader>
            <CardContent><div className="h-16 bg-muted rounded" /></CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {PLATFORMS.map(p => {
        const m = metrics[p.id];
        return (
          <Card
            key={p.id}
            className="cursor-pointer hover:shadow-lg transition-all hover:scale-[1.02]"
            onClick={() => navigate(`/analytics/platform/${p.id}`)}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <span className="text-xl">{p.icon}</span>
                  {p.label}
                </CardTitle>
                <Badge variant={m?.connected ? "default" : "secondary"}>
                  {m?.connected ? "Verbunden" : "Nicht verbunden"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-1.5">
                  <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-medium">{(m?.totalViews || 0).toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Heart className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-medium">{(m?.totalLikes || 0).toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <MessageCircle className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-medium">{(m?.totalComments || 0).toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-medium">{(m?.avgEngagement || 0).toFixed(1)}%</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">{m?.postCount || 0} Posts</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
