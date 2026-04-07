import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Image, Send, Calendar, Sparkles, Loader2, Gift, Crown, Star } from "lucide-react";
import { useTwitch } from "@/hooks/useTwitch";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

const cardClass = "backdrop-blur-xl bg-card/60 border border-white/10 shadow-[0_0_20px_rgba(145,70,255,0.08)]";
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.1 } } };
const fadeUp = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

export function GamingContentStudio() {
  const { isConnected, twitchUser, loading, getSchedule, getRewards, getVips } = useTwitch();
  const [schedule, setSchedule] = useState<any>(null);
  const [rewards, setRewards] = useState<any[]>([]);
  const [vips, setVips] = useState<any[]>([]);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [loadingRewards, setLoadingRewards] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!isConnected || !twitchUser?.id) return;
    setLoadingSchedule(true);
    getSchedule().then(setSchedule).finally(() => setLoadingSchedule(false));
    setLoadingRewards(true);
    Promise.all([getRewards(), getVips()]).then(([r, v]) => {
      setRewards(r);
      setVips(v);
    }).finally(() => setLoadingRewards(false));
  }, [isConnected, twitchUser?.id, getSchedule, getRewards, getVips]);

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

  const scheduleSegments = schedule?.data?.segments || [];

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-6 mt-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Thumbnail Generator */}
        <motion.div variants={fadeUp} whileHover={{ y: -4, scale: 1.01 }}>
          <Card className={`${cardClass} hover:shadow-[0_0_25px_rgba(145,70,255,0.15)] transition-shadow h-full`}>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Image className="h-5 w-5 text-purple-400" />
                <span className="bg-gradient-to-r from-purple-400 to-violet-400 bg-clip-text text-transparent">KI Thumbnail Generator</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Erstelle professionelle Gaming-Thumbnails mit KI — optimiert für YouTube und Twitch.
              </p>
              <Button className="w-full gap-2 bg-[#9146FF] hover:bg-[#7B2FFF] text-white shadow-[0_0_15px_rgba(145,70,255,0.2)]" onClick={() => navigate('/picture-studio')}>
                <Sparkles className="h-4 w-4" />
                Zum KI Picture Studio
              </Button>
            </CardContent>
          </Card>
        </motion.div>

        {/* Going Live Auto-Post */}
        <motion.div variants={fadeUp} whileHover={{ y: -4, scale: 1.01 }}>
          <Card className={`${cardClass} hover:shadow-[0_0_25px_rgba(34,197,94,0.12)] transition-shadow h-full`}>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Send className="h-5 w-5 text-green-400" />
                "Going Live" Auto-Posts
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Sobald dein Stream startet, werden automatisch Ankündigungen gepostet.
              </p>
              <div className="space-y-3">
                {["Instagram", "TikTok", "X (Twitter)", "Discord"].map((platform) => (
                  <div key={platform} className="flex items-center justify-between p-3 rounded-lg bg-black/20 border border-white/5">
                    <span className="text-sm font-medium">{platform}</span>
                    <Button variant="outline" size="sm" className="h-7 text-xs border-white/10">Einrichten</Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Stream Schedule */}
        <motion.div variants={fadeUp} whileHover={{ y: -4, scale: 1.01 }}>
          <Card className={`${cardClass} hover:shadow-[0_0_25px_rgba(59,130,246,0.12)] transition-shadow h-full`}>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="h-5 w-5 text-blue-400" />
                Stream-Kalender
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingSchedule ? (
                <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-purple-400" /></div>
              ) : scheduleSegments.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Kein Stream-Kalender konfiguriert.</p>
              ) : (
                <div className="space-y-2">
                  {scheduleSegments.slice(0, 5).map((seg: any, i: number) => (
                    <motion.div
                      key={i}
                      whileHover={{ x: 4 }}
                      className="flex items-center justify-between p-2 rounded-lg bg-black/20 border border-white/5 text-sm"
                    >
                      <div>
                        <p className="font-medium">{seg.title || 'Stream'}</p>
                        <p className="text-xs text-muted-foreground">
                          {seg.start_time ? new Date(seg.start_time).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-'}
                        </p>
                      </div>
                      {seg.category?.name && <Badge variant="outline" className="text-xs border-white/10">{seg.category.name}</Badge>}
                    </motion.div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Channel Points & Rewards */}
        <motion.div variants={fadeUp} whileHover={{ y: -4, scale: 1.01 }}>
          <Card className={`${cardClass} hover:shadow-[0_0_25px_rgba(250,204,21,0.12)] transition-shadow h-full`}>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Gift className="h-5 w-5 text-yellow-400" />
                Channel Points & Rewards
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingRewards ? (
                <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-purple-400" /></div>
              ) : rewards.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Keine Custom Rewards konfiguriert.</p>
              ) : (
                <div className="space-y-2">
                  {rewards.map((r: any) => (
                    <motion.div
                      key={r.id}
                      whileHover={{ x: 4 }}
                      className="flex items-center justify-between p-2 rounded-lg bg-black/20 border border-white/5 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <Star className="h-3 w-3 text-yellow-400" />
                        <span>{r.title}</span>
                      </div>
                      <Badge variant="outline" className="text-xs border-yellow-500/30 text-yellow-400">{r.cost} Points</Badge>
                    </motion.div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* VIP List */}
      {vips.length > 0 && (
        <motion.div variants={fadeUp}>
          <Card className={cardClass}>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Crown className="h-4 w-4 text-yellow-400" />
                VIPs ({vips.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {vips.map((v: any, i: number) => (
                  <Badge key={i} variant="outline" className="text-xs border-yellow-500/20 text-yellow-300">{v.user_name || v.user_login}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </motion.div>
  );
}
