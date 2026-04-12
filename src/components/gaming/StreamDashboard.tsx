import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Radio, Users, Eye, Clock, Wifi, WifiOff, ExternalLink, Loader2, X, Gamepad2, Edit3, Save, Scissors, CheckCircle2, AlertCircle, Monitor } from "lucide-react";
import { useTwitch } from "@/hooks/useTwitch";
import { toast } from "sonner";
import { motion } from "framer-motion";
import CountUp from "@/components/ui/count-up";
import { useTranslation } from "@/hooks/useTranslation";

const cardClass = "backdrop-blur-xl bg-card/60 border border-white/10 shadow-[0_0_20px_rgba(145,70,255,0.08)]";
const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

export function StreamDashboard() {
  const {
    twitchUser, stream, channel, loading,
    isConnected, isLive, connectTwitch, disconnectTwitch,
    updateChannel, searchGames, createClip,
  } = useTwitch();
  const { t } = useTranslation();

  const [showConnectDialog, setShowConnectDialog] = useState(false);
  const [username, setUsername] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editGameQuery, setEditGameQuery] = useState("");
  const [editGameId, setEditGameId] = useState("");
  const [editTags, setEditTags] = useState("");
  const [gameResults, setGameResults] = useState<any[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clipping, setClipping] = useState(false);

  useEffect(() => {
    if (stream) {
      setEditTitle(stream.title || "");
      setEditGameQuery(stream.game_name || "");
    } else if (channel) {
      setEditTitle(channel.title || "");
      setEditGameQuery(channel.game_name || "");
    }
  }, [stream, channel]);

  useEffect(() => {
    if (editGameQuery.length < 2) { setGameResults([]); return; }
    const timer = setTimeout(async () => {
      const results = await searchGames(editGameQuery);
      setGameResults(results);
    }, 300);
    return () => clearTimeout(timer);
  }, [editGameQuery, searchGames]);

  const handleConnect = async () => {
    if (!username.trim()) return;
    setConnecting(true);
    try {
      await connectTwitch(username.trim());
      setShowConnectDialog(false);
      setUsername("");
      toast.success(t('gaming.twitchConnected'));
    } catch (e: any) {
      toast.error(e.message || t('gaming.connectionFailed'));
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    await disconnectTwitch();
    toast.success(t('gaming.twitchDisconnected'));
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      await updateChannel(editTitle || undefined, editGameId || undefined, editTags ? editTags.split(",").map(t => t.trim()) : undefined);
      toast.success(t('gaming.streamSettingsSaved'));
      setIsEditing(false);
    } catch (e: any) {
      toast.error(e.message || t('gaming.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const handleCreateClip = async () => {
    setClipping(true);
    try {
      const result = await createClip();
      if (result?.edit_url) {
        toast.success(t('gaming.clipCreated'), {
          action: { label: t('gaming.openBtn'), onClick: () => window.open(result.edit_url, '_blank') },
        });
      } else {
        toast.success(t('gaming.clipCreating'));
      }
    } catch (e: any) {
      toast.error(e.message || t('gaming.clipCreateError'));
    } finally {
      setClipping(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
      </div>
    );
  }

  if (!isConnected) {
    return (
      <>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center justify-center py-20 space-y-6"
        >
          <div className="relative p-6 rounded-full bg-purple-500/10 border border-purple-500/20 shadow-[0_0_30px_rgba(145,70,255,0.15)]">
            <WifiOff className="h-16 w-16 text-purple-400" />
            <div className="absolute inset-0 rounded-full bg-purple-500/5 animate-ping" />
          </div>
          <div className="text-center space-y-2 max-w-md">
            <h2 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-violet-400 bg-clip-text text-transparent">{t('gaming.connectTwitch')}</h2>
            <p className="text-muted-foreground">
              {t('gaming.connectTwitchDesc')}
            </p>
          </div>
          <Button
            size="lg"
            className="gap-2 bg-[#9146FF] hover:bg-[#7B2FFF] text-white shadow-[0_0_20px_rgba(145,70,255,0.3)]"
            onClick={() => setShowConnectDialog(true)}
          >
            <TwitchIcon />
            {t('gaming.connectWithTwitch')}
          </Button>
        </motion.div>

        <Dialog open={showConnectDialog} onOpenChange={setShowConnectDialog}>
          <DialogContent className={cardClass}>
            <DialogHeader>
              <DialogTitle>{t('gaming.enterUsername')}</DialogTitle>
            </DialogHeader>
            <Input
              placeholder={t('gaming.usernamePlaceholder')}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
            />
            <p className="text-xs text-muted-foreground">
              {t('gaming.usernameHint')}
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowConnectDialog(false)}>{t('gaming.cancelBtn')}</Button>
              <Button onClick={handleConnect} disabled={connecting || !username.trim()} className="bg-[#9146FF] hover:bg-[#7B2FFF] text-white">
                {connecting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {t('gaming.connectBtn')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  const uptime = stream?.started_at
    ? (() => {
        const diff = Date.now() - new Date(stream.started_at).getTime();
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        return `${h}h ${m}m`;
      })()
    : null;

  const checklist = [
    { label: t('gaming.titleSet'), ok: !!editTitle },
    { label: t('gaming.categoryChosen'), ok: !!editGameQuery },
    { label: t('gaming.obsReady'), ok: false },
  ];

  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="show"
      className="space-y-6 mt-4"
    >
      {/* Connected Account Header */}
      <motion.div variants={fadeUp} className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {twitchUser?.profile_image_url && (
            <img src={twitchUser.profile_image_url} alt="" className="h-10 w-10 rounded-full ring-2 ring-purple-500/30" />
          )}
          <div>
            <p className="font-semibold">{twitchUser?.display_name || twitchUser?.login}</p>
            <p className="text-xs text-muted-foreground">twitch.tv/{twitchUser?.login}</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={handleDisconnect} className="text-destructive">
          <X className="h-4 w-4 mr-1" /> {t('gaming.disconnectBtn')}
        </Button>
      </motion.div>

      {isLive && stream ? (
        <motion.div variants={fadeUp} className="space-y-4">
          <Card className={`${cardClass} border-green-500/30 relative overflow-hidden`}>
            {/* Live glow */}
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-green-500/0 via-green-500 to-green-500/0" />
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Radio className="h-5 w-5 text-green-500" />
                    <span className="absolute -top-1 -right-1 h-3 w-3 bg-green-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.5)]" />
                  </div>
                  <CardTitle className="text-lg">{t('gaming.streamLive')}</CardTitle>
                  <Badge className="bg-green-500/20 text-green-400 border-green-500/30 shadow-[0_0_10px_rgba(34,197,94,0.2)]">
                    LIVE
                  </Badge>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="gap-2 border-white/10" onClick={handleCreateClip} disabled={clipping}>
                    {clipping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scissors className="h-4 w-4" />}
                    {t('gaming.quickClip')}
                  </Button>
                  <Button variant="outline" size="sm" className="gap-2 border-white/10" onClick={() => setIsEditing(!isEditing)}>
                    <Edit3 className="h-4 w-4" />
                    {t('gaming.editBtn')}
                  </Button>
                  <Button
                    variant="outline" size="sm" className="gap-2 border-white/10"
                    onClick={() => window.open(`https://twitch.tv/${twitchUser?.login}`, '_blank')}
                  >
                    <ExternalLink className="h-4 w-4" />
                    {t('gaming.onTwitch')}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isEditing ? (
                <StreamSettingsForm
                  editTitle={editTitle} setEditTitle={setEditTitle}
                  editGameQuery={editGameQuery} setEditGameQuery={setEditGameQuery}
                  editGameId={editGameId} setEditGameId={setEditGameId}
                  editTags={editTags} setEditTags={setEditTags}
                  gameResults={gameResults}
                  saving={saving} onSave={handleSaveSettings}
                  onCancel={() => setIsEditing(false)}
                  t={t}
                />
              ) : (
                <>
                  <p className="text-lg font-semibold mb-1">{stream.title}</p>
                  {stream.game_name && (
                    <p className="text-sm text-muted-foreground mb-4 flex items-center gap-1">
                      <Gamepad2 className="h-3 w-3" /> {stream.game_name}
                    </p>
                  )}
                </>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-4">
                <StatCard icon={Users} label={t('gaming.viewers')} value={stream.viewer_count} />
                <StatCard icon={Clock} label={t('gaming.uptime')} value={uptime || '-'} isText />
                <StatCard icon={Eye} label={t('gaming.game')} value={stream.game_name || '-'} isText />
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <motion.div variants={stagger} className="space-y-4">
          <motion.div variants={fadeUp}>
            <Card className={cardClass}>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Monitor className="h-5 w-5 text-purple-400" />
                  <span className="bg-gradient-to-r from-purple-400 to-violet-400 bg-clip-text text-transparent">{t('gaming.prepareStream')}</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <StreamSettingsForm
                  editTitle={editTitle} setEditTitle={setEditTitle}
                  editGameQuery={editGameQuery} setEditGameQuery={setEditGameQuery}
                  editGameId={editGameId} setEditGameId={setEditGameId}
                  editTags={editTags} setEditTags={setEditTags}
                  gameResults={gameResults}
                  saving={saving} onSave={handleSaveSettings}
                  t={t}
                />
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={fadeUp}>
            <Card className={cardClass}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">{t('gaming.preStreamChecklist')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {checklist.map((item, i) => (
                    <motion.div
                      key={item.label}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.1 }}
                      className="flex items-center gap-2 text-sm"
                    >
                      {item.ok ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className={item.ok ? "text-foreground" : "text-muted-foreground"}>{item.label}</span>
                    </motion.div>
                  ))}
                </div>
                <Button
                  className="w-full mt-4 gap-2 border-white/10"
                  variant="outline"
                  onClick={() => window.open('obsproject://', '_blank')}
                >
                  <Monitor className="h-4 w-4" />
                  {t('gaming.openObs')}
                </Button>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={fadeUp}>
            <Card className={`${cardClass} text-center`}>
              <CardContent className="py-8">
                <WifiOff className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
                <p className="text-lg font-semibold">{t('gaming.offline')}</p>
                <p className="text-sm text-muted-foreground">{channel?.title || t('gaming.noActiveStream')}</p>
                {channel?.game_name && (
                  <p className="text-xs text-muted-foreground mt-1">{t('gaming.lastPlayed')} {channel.game_name}</p>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>
      )}
    </motion.div>
  );
}

function StreamSettingsForm({
  editTitle, setEditTitle,
  editGameQuery, setEditGameQuery,
  editGameId, setEditGameId,
  editTags, setEditTags,
  gameResults,
  saving, onSave, onCancel,
  t,
}: {
  editTitle: string; setEditTitle: (v: string) => void;
  editGameQuery: string; setEditGameQuery: (v: string) => void;
  editGameId: string; setEditGameId: (v: string) => void;
  editTags: string; setEditTags: (v: string) => void;
  gameResults: any[];
  saving: boolean; onSave: () => void; onCancel?: () => void;
  t: (key: string) => string;
}) {
  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm">{t('gaming.streamTitle')}</Label>
        <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder={t('gaming.streamTitlePlaceholder')} className="mt-1 border-white/10" />
      </div>
      <div className="relative">
        <Label className="text-sm">{t('gaming.category')}</Label>
        <Input
          value={editGameQuery}
          onChange={(e) => { setEditGameQuery(e.target.value); setEditGameId(""); }}
          placeholder={t('gaming.categoryPlaceholder')}
          className="mt-1 border-white/10"
        />
        {gameResults.length > 0 && !editGameId && (
          <div className="absolute z-10 w-full mt-1 bg-popover/95 backdrop-blur-xl border border-white/10 rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {gameResults.map((g: any) => (
              <button
                key={g.id}
                className="w-full px-3 py-2 text-left text-sm hover:bg-purple-500/10 flex items-center gap-2 transition-colors"
                onClick={() => { setEditGameQuery(g.name); setEditGameId(g.id); }}
              >
                {g.box_art_url && (
                  <img src={g.box_art_url.replace('{width}', '28').replace('{height}', '38')} alt="" className="h-6 w-5 rounded-sm object-cover" />
                )}
                {g.name}
              </button>
            ))}
          </div>
        )}
      </div>
      <div>
        <Label className="text-sm">{t('gaming.tagsLabel')}</Label>
        <Input value={editTags} onChange={(e) => setEditTags(e.target.value)} placeholder={t('gaming.tagsPlaceholder')} className="mt-1 border-white/10" />
      </div>
      <div className="flex gap-2">
        <Button onClick={onSave} disabled={saving} className="gap-2 bg-[#9146FF] hover:bg-[#7B2FFF] text-white shadow-[0_0_15px_rgba(145,70,255,0.2)]">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {t('gaming.saveBtn')}
        </Button>
        {onCancel && <Button variant="outline" onClick={onCancel} className="border-white/10">{t('gaming.cancelBtn')}</Button>}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, isText }: { icon: any; label: string; value: any; isText?: boolean }) {
  return (
    <motion.div
      whileHover={{ y: -2, scale: 1.02 }}
      className="p-3 rounded-lg bg-card/60 backdrop-blur border border-white/10 text-center shadow-[0_0_15px_rgba(145,70,255,0.06)]"
    >
      <Icon className="h-4 w-4 mx-auto text-purple-400 mb-1" />
      <p className="text-xl font-bold">
        {isText ? value : <CountUp end={Number(value) || 0} duration={1.5} />}
      </p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </motion.div>
  );
}

function TwitchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current">
      <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
    </svg>
  );
}
