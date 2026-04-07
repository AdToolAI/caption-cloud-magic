import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, TrendingUp, Users, Clock, Target, Loader2, Heart, Star } from "lucide-react";
import { useTwitch } from "@/hooks/useTwitch";

export function StreamAnalytics() {
  const { twitchUser, isConnected, loading, clips, getFollowerCount } = useTwitch();
  const [stats, setStats] = useState({ followers: 0, subscribers: 0 });
  const [loadingStats, setLoadingStats] = useState(false);

  useEffect(() => {
    if (!isConnected || !twitchUser?.id) return;
    setLoadingStats(true);
    getFollowerCount().then((data) => {
      setStats({ followers: data.followers || 0, subscribers: data.subscribers || 0 });
    }).finally(() => setLoadingStats(false));
  }, [isConnected, twitchUser?.id, getFollowerCount]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        Verbinde zuerst deinen Twitch-Kanal im "Stream"-Tab.
      </div>
    );
  }

  // Top clips by views
  const topClips = [...clips].sort((a, b) => b.view_count - a.view_count).slice(0, 5);

  const kpiCards = [
    { icon: Users, label: "Follower", value: loadingStats ? "..." : stats.followers.toLocaleString(), color: "text-purple-400" },
    { icon: Heart, label: "Subscriber", value: loadingStats ? "..." : stats.subscribers.toLocaleString(), color: "text-pink-400" },
    { icon: Star, label: "Clips gesamt", value: clips.length.toString(), color: "text-yellow-400" },
    { icon: TrendingUp, label: "Clip-Views gesamt", value: clips.reduce((sum, c) => sum + c.view_count, 0).toLocaleString(), color: "text-green-400" },
  ];

  return (
    <div className="space-y-6 mt-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map(({ icon: Icon, label, value, color }) => (
          <Card key={label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Icon className={`h-4 w-4 ${color}`} />
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
              <p className="text-2xl font-bold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Top Clips */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-purple-400" />
            Top Clips nach Views
          </CardTitle>
        </CardHeader>
        <CardContent>
          {topClips.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Noch keine Clips vorhanden.
            </p>
          ) : (
            <div className="space-y-3">
              {topClips.map((clip, i) => (
                <div key={clip.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50">
                  <span className="text-lg font-bold text-muted-foreground w-6">#{i + 1}</span>
                  <img src={clip.thumbnail_url} alt="" className="h-10 w-16 rounded object-cover" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{clip.title}</p>
                    <p className="text-xs text-muted-foreground">{clip.view_count.toLocaleString()} Views · {Math.floor(clip.duration)}s</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Channel Info */}
      {twitchUser && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Kanal-Info</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              {twitchUser.profile_image_url && (
                <img src={twitchUser.profile_image_url} alt="" className="h-16 w-16 rounded-full" />
              )}
              <div>
                <p className="text-lg font-bold">{twitchUser.display_name}</p>
                <p className="text-sm text-muted-foreground">{twitchUser.description || 'Keine Beschreibung'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
