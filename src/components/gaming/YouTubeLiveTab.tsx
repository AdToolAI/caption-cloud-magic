import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useYouTubeLive } from "@/hooks/useYouTubeLive";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Radio, Eye, Copy, Send, Play, Square, Clock, RefreshCw,
  Key, Link2, MessageSquare, Users, ThumbsUp, AlertCircle, ExternalLink, Plus
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import CountUp from "@/components/ui/count-up";
import { useTranslation } from "@/hooks/useTranslation";

const card = "backdrop-blur-xl bg-card/60 border border-white/10 rounded-2xl p-6 shadow-[0_0_20px_rgba(145,70,255,0.08)]";
const ytRed = "#FF0000";

export function YouTubeLiveTab() {
  const yt = useYouTubeLive();
  const { toast } = useToast();
  const { t, language } = useTranslation();

  const getLocaleStr = () => language === 'de' ? 'de-DE' : language === 'es' ? 'es-ES' : 'en-US';

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [privacy, setPrivacy] = useState("unlisted");
  const [scheduledTime, setScheduledTime] = useState("");
  const [creating, setCreating] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [selectedBroadcast, setSelectedBroadcast] = useState<string | null>(null);
  const [videoStats, setVideoStats] = useState<any>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (yt.isConnected) {
      yt.fetchBroadcasts();
      yt.fetchStreams();
    }
  }, [yt.isConnected]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [yt.chatMessages]);

  const activeBroadcast = yt.broadcasts.find(
    b => b.status.lifeCycleStatus === "live" || b.status.lifeCycleStatus === "testing"
  );

  const currentBroadcast = selectedBroadcast
    ? yt.broadcasts.find(b => b.id === selectedBroadcast)
    : activeBroadcast || yt.broadcasts[0];

  const activeStream = yt.streams[0];

  useEffect(() => {
    if (!activeBroadcast) return;
    const poll = async () => {
      const stats = await yt.getVideoStats(activeBroadcast.id);
      if (stats) setVideoStats(stats);
    };
    poll();
    const iv = setInterval(poll, 15000);
    return () => clearInterval(iv);
  }, [activeBroadcast?.id]);

  const handleCreate = async () => {
    if (!title.trim()) return;
    setCreating(true);
    try {
      const res = await yt.createBroadcast(
        title, description, scheduledTime || new Date().toISOString(), privacy
      );
      setTitle(""); setDescription(""); setScheduledTime("");
      if (activeStream && res?.id) {
        await yt.bindStream(res.id, activeStream.id);
      }
    } catch (err: any) {
      toast({ title: t('gaming.errorLabel'), description: err.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleSendChat = async () => {
    if (!chatInput.trim() || !currentBroadcast?.snippet.liveChatId) return;
    try {
      await yt.sendChatMessage(currentBroadcast.snippet.liveChatId, chatInput);
      setChatInput("");
    } catch (err: any) {
      toast({ title: t('gaming.chatError'), description: err.message, variant: "destructive" });
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `📋 ${label} ${t('gaming.copied')}` });
  };

  // Not connected state
  if (yt.isConnected === false) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className={card}>
        <div className="text-center py-12 space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-[#FF0000]/10 flex items-center justify-center mx-auto">
            <svg viewBox="0 0 24 24" className="w-8 h-8 text-[#FF0000]" fill="currentColor">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-foreground">{t('gaming.ytConnectTitle')}</h3>
          <p className="text-muted-foreground max-w-md mx-auto">
            {t('gaming.ytConnectDesc')}
          </p>
          <Button variant="outline" className="border-[#FF0000]/30 text-[#FF0000] hover:bg-[#FF0000]/10" asChild>
            <a href="/integrations">{t('gaming.ytGoToIntegration')}</a>
          </Button>
        </div>
      </motion.div>
    );
  }

  if (yt.isConnected === null) {
    return (
      <div className={card}>
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  const isLive = activeBroadcast?.status.lifeCycleStatus === "live";
  const isTesting = activeBroadcast?.status.lifeCycleStatus === "testing";
  const concurrentViewers = videoStats?.liveStreamingDetails?.concurrentViewers || 0;
  const likeCount = videoStats?.statistics?.likeCount || 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-4"
    >
      {/* Live Status Bar */}
      {activeBroadcast && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`${card} border-[#FF0000]/30`}
        >
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              {isLive && (
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF0000] opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-[#FF0000]" />
                </span>
              )}
              <Badge className={isLive ? "bg-[#FF0000]/20 text-[#FF0000] border-[#FF0000]/40" : "bg-yellow-500/20 text-yellow-400 border-yellow-500/40"}>
                {isLive ? "🔴 LIVE" : isTesting ? "🟡 TESTING" : activeBroadcast.status.lifeCycleStatus.toUpperCase()}
              </Badge>
              <span className="font-semibold text-foreground">{activeBroadcast.snippet.title}</span>
            </div>

            <div className="flex items-center gap-6 text-sm">
              {isLive && (
                <>
                  <div className="flex items-center gap-1.5 text-[#FF0000]">
                    <Eye className="w-4 h-4" />
                    <CountUp end={Number(concurrentViewers)} className="font-bold" />
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <ThumbsUp className="w-4 h-4" />
                    <CountUp end={Number(likeCount)} className="font-medium" />
                  </div>
                </>
              )}
            </div>

            <div className="flex gap-2">
              {isTesting && (
                <Button size="sm" className="bg-[#FF0000] hover:bg-[#CC0000] text-white"
                  onClick={() => yt.transitionBroadcast(activeBroadcast.id, "live")}>
                  <Play className="w-4 h-4 mr-1" /> {t('gaming.goLive')}
                </Button>
              )}
              {isLive && (
                <Button size="sm" variant="destructive"
                  onClick={() => yt.transitionBroadcast(activeBroadcast.id, "complete")}>
                  <Square className="w-4 h-4 mr-1" /> {t('gaming.endStream')}
                </Button>
              )}
              <Button size="sm" variant="ghost" asChild>
                <a href={`https://youtube.com/watch?v=${activeBroadcast.id}`} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4" />
                </a>
              </Button>
            </div>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Create Broadcast */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className={card}>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-[#FF0000]/10 flex items-center justify-center">
              <Plus className="w-4 h-4 text-[#FF0000]" />
            </div>
            <h3 className="text-lg font-bold text-foreground">{t('gaming.createBroadcast')}</h3>
          </div>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">{t('gaming.titleLabel')}</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder={t('gaming.streamTitlePlaceholderYt')}
                className="bg-background/50 border-white/10" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">{t('gaming.descriptionLabel')}</Label>
              <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder={t('gaming.streamDescPlaceholder')}
                className="bg-background/50 border-white/10 min-h-[60px]" rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">{t('gaming.schedule')}</Label>
                <Input type="datetime-local" value={scheduledTime} onChange={e => setScheduledTime(e.target.value)}
                  className="bg-background/50 border-white/10" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">{t('gaming.visibility')}</Label>
                <Select value={privacy} onValueChange={setPrivacy}>
                  <SelectTrigger className="bg-background/50 border-white/10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">{t('gaming.visPublic')}</SelectItem>
                    <SelectItem value="unlisted">{t('gaming.visUnlisted')}</SelectItem>
                    <SelectItem value="private">{t('gaming.visPrivate')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button className="w-full bg-[#FF0000] hover:bg-[#CC0000] text-white" disabled={!title.trim() || creating}
              onClick={handleCreate}>
              {creating ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Radio className="w-4 h-4 mr-2" />}
              {t('gaming.createBroadcast')}
            </Button>
          </div>
        </motion.div>

        {/* Stream Key */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className={card}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[#FF0000]/10 flex items-center justify-center">
                <Key className="w-4 h-4 text-[#FF0000]" />
              </div>
              <h3 className="text-lg font-bold text-foreground">{t('gaming.streamKey')}</h3>
            </div>
            {!activeStream && (
              <Button size="sm" variant="outline" className="border-[#FF0000]/30 text-[#FF0000]"
                onClick={() => yt.createStream("CaptionGenie Stream")}>
                <Plus className="w-3 h-3 mr-1" /> {t('gaming.createStreamKey')}
              </Button>
            )}
          </div>

          {activeStream ? (
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">{t('gaming.streamKey')}</Label>
                <div className="flex gap-2">
                  <Input readOnly value={showKey ? activeStream.cdn.ingestionInfo.streamName : "••••••••••••••••••••"}
                    className="bg-background/50 border-white/10 font-mono text-xs" />
                  <Button size="icon" variant="ghost" onClick={() => setShowKey(!showKey)}>
                    <Eye className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost"
                    onClick={() => copyToClipboard(activeStream.cdn.ingestionInfo.streamName, t('gaming.streamKey'))}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">{t('gaming.serverUrl')}</Label>
                <div className="flex gap-2">
                  <Input readOnly value={activeStream.cdn.ingestionInfo.ingestionAddress}
                    className="bg-background/50 border-white/10 font-mono text-xs" />
                  <Button size="icon" variant="ghost"
                    onClick={() => copyToClipboard(activeStream.cdn.ingestionInfo.ingestionAddress, t('gaming.serverUrl'))}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div className="flex gap-2 text-xs text-muted-foreground">
                <Badge variant="outline" className="border-white/10">{activeStream.cdn.resolution}</Badge>
                <Badge variant="outline" className="border-white/10">{activeStream.cdn.frameRate}</Badge>
                {activeStream.status?.streamStatus && (
                  <Badge variant="outline" className={
                    activeStream.status.streamStatus === "active"
                      ? "border-green-500/30 text-green-400"
                      : "border-white/10"
                  }>{activeStream.status.streamStatus}</Badge>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-6 text-muted-foreground text-sm">
              <Key className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p>{t('gaming.noStreamKey')}</p>
            </div>
          )}
        </motion.div>

        {/* Broadcasts */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className={card}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[#FF0000]/10 flex items-center justify-center">
                <Clock className="w-4 h-4 text-[#FF0000]" />
              </div>
              <h3 className="text-lg font-bold text-foreground">{t('gaming.broadcasts')}</h3>
            </div>
            <Button size="sm" variant="ghost" onClick={yt.fetchBroadcasts} disabled={yt.loading}>
              <RefreshCw className={`w-4 h-4 ${yt.loading ? "animate-spin" : ""}`} />
            </Button>
          </div>

          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {yt.broadcasts.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-4">{t('gaming.noBroadcasts')}</p>
            ) : (
              yt.broadcasts.map(b => (
                <div key={b.id}
                  onClick={() => setSelectedBroadcast(b.id)}
                  className={`p-3 rounded-xl border cursor-pointer transition-all hover:border-[#FF0000]/30 ${
                    selectedBroadcast === b.id ? "border-[#FF0000]/40 bg-[#FF0000]/5" : "border-white/10 bg-background/30"
                  }`}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm text-foreground truncate">{b.snippet.title}</span>
                    <Badge variant="outline" className={
                      b.status.lifeCycleStatus === "live" ? "border-[#FF0000]/40 text-[#FF0000]" :
                      b.status.lifeCycleStatus === "ready" ? "border-green-500/30 text-green-400" :
                      "border-white/10 text-muted-foreground"
                    }>{b.status.lifeCycleStatus}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(b.snippet.scheduledStartTime).toLocaleString(getLocaleStr())}
                  </p>
                  {b.status.lifeCycleStatus === "ready" && activeStream && (
                    <div className="flex gap-2 mt-2">
                      <Button size="sm" variant="outline" className="h-7 text-xs border-yellow-500/30 text-yellow-400"
                        onClick={e => { e.stopPropagation(); yt.transitionBroadcast(b.id, "testing"); }}>
                        {t('gaming.startTest')}
                      </Button>
                      {!b.contentDetails?.boundStreamId && (
                        <Button size="sm" variant="outline" className="h-7 text-xs border-[#FF0000]/30 text-[#FF0000]"
                          onClick={e => { e.stopPropagation(); yt.bindStream(b.id, activeStream.id); }}>
                          <Link2 className="w-3 h-3 mr-1" /> {t('gaming.bindStream')}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </motion.div>

        {/* Live Chat */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className={card}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[#FF0000]/10 flex items-center justify-center">
                <MessageSquare className="w-4 h-4 text-[#FF0000]" />
              </div>
              <h3 className="text-lg font-bold text-foreground">{t('gaming.ytLiveChat')}</h3>
            </div>
            {currentBroadcast?.snippet.liveChatId && (
              <Button size="sm" variant={yt.chatPolling ? "destructive" : "outline"}
                className={!yt.chatPolling ? "border-[#FF0000]/30 text-[#FF0000]" : ""}
                onClick={() => yt.chatPolling
                  ? yt.stopChatPolling()
                  : yt.startChatPolling(currentBroadcast.snippet.liveChatId!)
                }>
                {yt.chatPolling ? "Stop" : t('gaming.startChat')}
              </Button>
            )}
          </div>

          <div className="h-[220px] overflow-y-auto space-y-1.5 mb-3 bg-background/30 rounded-xl p-3 border border-white/5">
            {yt.chatMessages.length === 0 ? (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                {!currentBroadcast?.snippet.liveChatId
                  ? t('gaming.noActiveLiveChat')
                  : yt.chatPolling
                    ? t('gaming.waitingForMessages')
                    : t('gaming.pressStartChat')}
              </div>
            ) : (
              yt.chatMessages.map(msg => (
                <div key={msg.id} className="flex gap-2 text-sm">
                  <img src={msg.authorDetails.profileImageUrl} alt="" className="w-5 h-5 rounded-full mt-0.5 shrink-0" />
                  <div>
                    <span className={`font-medium text-xs ${
                      msg.authorDetails.isChatOwner ? "text-[#FF0000]" :
                      msg.authorDetails.isChatModerator ? "text-blue-400" : "text-foreground"
                    }`}>
                      {msg.authorDetails.displayName}
                      {msg.authorDetails.isChatOwner && " 👑"}
                      {msg.authorDetails.isChatModerator && " 🔧"}
                    </span>
                    <span className="text-muted-foreground ml-1.5">{msg.snippet.displayMessage}</span>
                  </div>
                </div>
              ))
            )}
            <div ref={chatEndRef} />
          </div>

          {currentBroadcast?.snippet.liveChatId && yt.chatPolling && (
            <div className="flex gap-2">
              <Input value={chatInput} onChange={e => setChatInput(e.target.value)}
                placeholder={t('gaming.ytSendMessage')} className="bg-background/50 border-white/10"
                onKeyDown={e => e.key === "Enter" && handleSendChat()} />
              <Button size="icon" className="bg-[#FF0000] hover:bg-[#CC0000]" onClick={handleSendChat} disabled={!chatInput.trim()}>
                <Send className="w-4 h-4" />
              </Button>
            </div>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
}
