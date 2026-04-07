import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, TrendingUp, Users, Clock, Target, Loader2, Heart, Star } from "lucide-react";
import { useTwitch } from "@/hooks/useTwitch";
import { motion } from "framer-motion";
import CountUp from "@/components/ui/count-up";

const cardClass = "backdrop-blur-xl bg-card/60 border border-white/10 shadow-[0_0_20px_rgba(145,70,255,0.08)]";
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.1 } } };
const fadeUp = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

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

  const topClips = [...clips].sort((a, b) => b.view_count - a.view_count).slice(0, 5);

  const kpiCards = [
    { icon: Users, label: "Follower", value: stats.followers, color: "text-purple-400", glow: "shadow-[0_0_20px_rgba(145,70,255,0.15)]" },
    { icon: Heart, label: "Subscriber", value: stats.subscribers, color: "text-pink-400", glow: "shadow-[0_0_20px_rgba(236,72,153,0.15)]" },
    { icon: Star, label: "Clips gesamt", value: clips.length, color: "text-yellow-400", glow: "shadow-[0_0_20px_rgba(250,204,21,0.15)]" },
    { icon: TrendingUp, label: "Clip-Views gesamt", value: clips.reduce((sum, c) => sum + c.view_count, 0), color: "text-green-400", glow: "shadow-[0_0_20px_rgba(34,197,94,0.15)]" },
  ];

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-6 mt-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map(({ icon: Icon, label, value, color, glow }) => (
          <motion.div key={label} variants={fadeUp} whileHover={{ y: -4, scale: 1.02 }}>
            <Card className={`${cardClass} ${glow}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Icon className={`h-4 w-4 ${color}`} />
                  <span className="text-xs text-muted-foreground">{label}</span>
                </div>
                <p className="text-2xl font-bold">
                  {loadingStats ? "..." : <CountUp end={value} duration={2} />}
                </p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Top Clips */}
      <motion.div variants={fadeUp}>
        <Card className={cardClass}>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-purple-400" />
              <span className="bg-gradient-to-r from-purple-400 to-violet-400 bg-clip-text text-transparent">Top Clips nach Views</span>
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
                  <motion.div
                    key={clip.id}
                    whileHover={{ x: 4, backgroundColor: "rgba(145,70,255,0.05)" }}
                    className="flex items-center gap-3 p-2 rounded-lg transition-colors"
                  >
                    <span className="text-lg font-bold text-muted-foreground w-6">#{i + 1}</span>
                    <img src={clip.thumbnail_url} alt="" className="h-10 w-16 rounded object-cover ring-1 ring-white/10" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{clip.title}</p>
                      <p className="text-xs text-muted-foreground">{clip.view_count.toLocaleString()} Views · {Math.floor(clip.duration)}s</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Channel Info */}
      {twitchUser && (
        <motion.div variants={fadeUp}>
          <Card className={cardClass}>
            <CardHeader>
              <CardTitle className="text-lg">Kanal-Info</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                {twitchUser.profile_image_url && (
                  <img src={twitchUser.profile_image_url} alt="" className="h-16 w-16 rounded-full ring-2 ring-purple-500/30" />
                )}
                <div>
                  <p className="text-lg font-bold">{twitchUser.display_name}</p>
                  <p className="text-sm text-muted-foreground">{twitchUser.description || 'Keine Beschreibung'}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </motion.div>
  );
}
