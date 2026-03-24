import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Footer } from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Eye, Heart, MessageCircle, Share2, TrendingUp, Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MetricsChart } from "@/components/analytics/MetricsChart";

const PLATFORM_INFO: Record<string, { label: string; icon: string }> = {
  instagram: { label: "Instagram", icon: "📸" },
  facebook: { label: "Facebook", icon: "📘" },
  youtube: { label: "YouTube", icon: "▶️" },
  tiktok: { label: "TikTok", icon: "🎵" },
  linkedin: { label: "LinkedIn", icon: "💼" },
  x: { label: "X", icon: "𝕏" },
};

interface PlatformPost {
  id: string;
  caption_text: string | null;
  posted_at: string | null;
  impressions: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  engagement_rate: number | null;
}

export default function PlatformAnalytics() {
  const { platform } = useParams<{ platform: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<PlatformPost[]>([]);
  const [timeFilter, setTimeFilter] = useState<"7" | "30">("30");
  const [summary, setSummary] = useState({
    totalViews: 0, totalLikes: 0, totalComments: 0, totalShares: 0, avgEngagement: 0, postCount: 0,
  });

  const info = PLATFORM_INFO[platform || ""] || { label: platform, icon: "📊" };

  useEffect(() => {
    if (user && platform) loadData();
  }, [user, platform, timeFilter]);

  const loadData = async () => {
    if (!user || !platform) return;
    setLoading(true);
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - parseInt(timeFilter));

      const { data, error } = await supabase
        .from("post_metrics")
        .select("id, caption_text, posted_at, impressions, likes, comments, shares, engagement_rate")
        .eq("user_id", user.id)
        .eq("provider", platform)
        .gte("posted_at", cutoff.toISOString())
        .order("posted_at", { ascending: false });

      if (error) throw error;

      const postsData = data || [];
      setPosts(postsData);

      const totalViews = postsData.reduce((s, p) => s + (p.impressions || 0), 0);
      const totalLikes = postsData.reduce((s, p) => s + (p.likes || 0), 0);
      const totalComments = postsData.reduce((s, p) => s + (p.comments || 0), 0);
      const totalShares = postsData.reduce((s, p) => s + (p.shares || 0), 0);
      const avgEngagement = postsData.length > 0
        ? postsData.reduce((s, p) => s + (p.engagement_rate || 0), 0) / postsData.length
        : 0;

      setSummary({ totalViews, totalLikes, totalComments, totalShares, avgEngagement, postCount: postsData.length });
    } catch (err) {
      console.error("Error loading platform data:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate("/analytics")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <span className="text-2xl">{info.icon}</span>
              {info.label} Analytics
            </h1>
            <p className="text-muted-foreground">Detaillierte Performance-Metriken</p>
          </div>
          <div className="ml-auto">
            <Select value={timeFilter} onValueChange={(v) => setTimeFilter(v as "7" | "30")}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 Tage</SelectItem>
                <SelectItem value="30">30 Tage</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[
                { label: "Views", value: summary.totalViews, icon: Eye },
                { label: "Likes", value: summary.totalLikes, icon: Heart },
                { label: "Kommentare", value: summary.totalComments, icon: MessageCircle },
                { label: "Shares", value: summary.totalShares, icon: Share2 },
                { label: "Ø Engagement", value: `${summary.avgEngagement.toFixed(1)}%`, icon: TrendingUp },
              ].map((stat, i) => (
                <Card key={i}>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-1">
                      <stat.icon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">{stat.label}</span>
                    </div>
                    <p className="text-2xl font-bold">
                      {typeof stat.value === "number" ? stat.value.toLocaleString() : stat.value}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Top Posts */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Top Posts ({summary.postCount} gesamt)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {posts.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    Keine Posts für diesen Zeitraum gefunden
                  </p>
                ) : (
                  <div className="space-y-3">
                    {posts.slice(0, 10).map((post) => (
                      <div key={post.id} className="flex items-start justify-between p-3 rounded-lg border">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm line-clamp-2">{post.caption_text || "Kein Text"}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {post.posted_at ? new Date(post.posted_at).toLocaleDateString() : "—"}
                          </p>
                        </div>
                        <div className="flex items-center gap-4 ml-4 text-sm shrink-0">
                          <span className="flex items-center gap-1">
                            <Eye className="h-3.5 w-3.5" /> {(post.impressions || 0).toLocaleString()}
                          </span>
                          <span className="flex items-center gap-1">
                            <Heart className="h-3.5 w-3.5" /> {(post.likes || 0).toLocaleString()}
                          </span>
                          <Badge variant="secondary">
                            {(post.engagement_rate || 0).toFixed(1)}%
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
