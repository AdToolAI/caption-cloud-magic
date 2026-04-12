import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { MessageSquare, Shield, Bot, TrendingUp, Loader2, WifiOff, Send, Users, BarChart3, Vote, Trophy } from "lucide-react";
import { useTwitch } from "@/hooks/useTwitch";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { useTranslation } from "@/hooks/useTranslation";

const cardClass = "backdrop-blur-xl bg-card/60 border border-white/10 shadow-[0_0_20px_rgba(145,70,255,0.08)]";

interface ChatMessage {
  user: string;
  msg: string;
  color?: string;
  timestamp: number;
}

export function ChatManager() {
  const {
    twitchUsername, twitchUser, isConnected, isLive, loading,
    sendChat, getViewerList, createPoll, endPoll, getPolls,
    createPrediction, getPredictions,
  } = useTwitch();
  const { t } = useTranslation();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatConnected, setChatConnected] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [sending, setSending] = useState(false);
  const [viewers, setViewers] = useState<any[]>([]);
  const [showViewers, setShowViewers] = useState(false);
  const [showPollDialog, setShowPollDialog] = useState(false);
  const [pollTitle, setPollTitle] = useState("");
  const [pollChoices, setPollChoices] = useState(["", ""]);
  const [pollDuration, setPollDuration] = useState(60);
  const [showPredictionDialog, setShowPredictionDialog] = useState(false);
  const [predTitle, setPredTitle] = useState("");
  const [predOutcomes, setPredOutcomes] = useState(["", ""]);

  const wsRef = useRef<WebSocket | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [sentiment, setSentiment] = useState({ positive: 0, neutral: 0, negative: 0, total: 0 });

  const simpleSentiment = (msg: string): 'positive' | 'neutral' | 'negative' => {
    const positive = /❤️|🔥|😊|gg|nice|love|great|awesome|insane|best|wow|pog|hype|lol|lmao|🎉|👏|💪/i;
    const negative = /😡|😠|trash|bad|worst|hate|suck|toxic|noob|cringe|💩/i;
    if (positive.test(msg)) return 'positive';
    if (negative.test(msg)) return 'negative';
    return 'neutral';
  };

  const connectChat = useCallback(() => {
    if (!twitchUsername || wsRef.current) return;
    const ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');
    wsRef.current = ws;
    ws.onopen = () => {
      ws.send('CAP REQ :twitch.tv/tags');
      ws.send('NICK justinfan' + Math.floor(Math.random() * 100000));
      ws.send(`JOIN #${twitchUsername.toLowerCase()}`);
      setChatConnected(true);
    };
    ws.onmessage = (event) => {
      const lines = event.data.split('\r\n');
      for (const line of lines) {
        if (line.startsWith('PING')) { ws.send('PONG :tmi.twitch.tv'); continue; }
        const privmsgMatch = line.match(/:(\w+)!\w+@\w+\.tmi\.twitch\.tv PRIVMSG #\w+ :(.+)/);
        if (privmsgMatch) {
          const [, user, msg] = privmsgMatch;
          const colorMatch = line.match(/color=(#[0-9a-fA-F]{6})/);
          const newMsg: ChatMessage = { user, msg, color: colorMatch?.[1] || '#9146FF', timestamp: Date.now() };
          setMessages(prev => [...prev.slice(-200), newMsg]);
          const s = simpleSentiment(msg);
          setSentiment(prev => ({ ...prev, [s]: prev[s] + 1, total: prev.total + 1 }));
        }
      }
    };
    ws.onclose = () => { setChatConnected(false); wsRef.current = null; };
    ws.onerror = () => { ws.close(); };
  }, [twitchUsername]);

  useEffect(() => {
    if (isConnected && twitchUsername) connectChat();
    return () => { wsRef.current?.close(); wsRef.current = null; };
  }, [isConnected, twitchUsername, connectChat]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendChat = async () => {
    if (!chatInput.trim()) return;
    setSending(true);
    try {
      await sendChat(chatInput.trim());
      setChatInput("");
    } catch (e: any) {
      toast.error(e.message || t('gaming.messageSendError'));
    } finally {
      setSending(false);
    }
  };

  const handleLoadViewers = async () => {
    const v = await getViewerList();
    setViewers(v);
    setShowViewers(true);
  };

  const handleCreatePoll = async () => {
    const validChoices = pollChoices.filter(c => c.trim());
    if (!pollTitle.trim() || validChoices.length < 2) {
      toast.error(t('gaming.titleAnd2Options'));
      return;
    }
    try {
      await createPoll(pollTitle, validChoices, pollDuration);
      toast.success(t('gaming.pollCreated'));
      setShowPollDialog(false);
      setPollTitle(""); setPollChoices(["", ""]);
    } catch (e: any) {
      toast.error(e.message || t('gaming.pollCreateError'));
    }
  };

  const handleCreatePrediction = async () => {
    const validOutcomes = predOutcomes.filter(o => o.trim());
    if (!predTitle.trim() || validOutcomes.length < 2) {
      toast.error(t('gaming.titleAnd2Outcomes'));
      return;
    }
    try {
      await createPrediction(predTitle, validOutcomes);
      toast.success(t('gaming.predictionCreated'));
      setShowPredictionDialog(false);
      setPredTitle(""); setPredOutcomes(["", ""]);
    } catch (e: any) {
      toast.error(e.message || t('gaming.predictionCreateError'));
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
      <div className="text-center py-20 text-muted-foreground">
        {t('gaming.connectFirst')}
      </div>
    );
  }

  const pct = (val: number) => sentiment.total > 0 ? Math.round((val / sentiment.total) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-4"
    >
      {/* Live Chat */}
      <Card className={`lg:col-span-2 ${cardClass}`}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-purple-400" />
              <span className="bg-gradient-to-r from-purple-400 to-violet-400 bg-clip-text text-transparent">
                {t('gaming.liveChat')} — #{twitchUsername}
              </span>
            </CardTitle>
            <Badge variant="outline" className={chatConnected ? "text-green-400 border-green-500/30 shadow-[0_0_8px_rgba(34,197,94,0.2)]" : "text-muted-foreground"}>
              {chatConnected ? t('gaming.chatConnected') : t('gaming.chatConnecting')}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-72 overflow-y-auto space-y-1 mb-3 p-3 rounded-lg bg-black/20 backdrop-blur border border-white/5 font-mono text-sm">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                {isLive ? <p>{t('gaming.waitingForMessages')}</p> : (
                  <><WifiOff className="h-8 w-8 mb-2 opacity-50" /><p>{t('gaming.channelOfflineChat')}</p></>
                )}
              </div>
            ) : (
              messages.map((m, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -5 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex gap-2"
                >
                  <span className="font-semibold shrink-0" style={{ color: m.color }}>{m.user}:</span>
                  <span className="text-foreground break-all">{m.msg}</span>
                </motion.div>
              ))
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="flex gap-2">
            <Input
              placeholder={t('gaming.sendMessage')}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
              disabled={sending}
              className="border-white/10"
            />
            <Button
              size="icon"
              onClick={handleSendChat}
              disabled={sending || !chatInput.trim()}
              className="bg-[#9146FF] hover:bg-[#7B2FFF] text-white shadow-[0_0_10px_rgba(145,70,255,0.2)]"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Chat Tools */}
      <div className="space-y-4">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className={cardClass}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-400" />
                {t('gaming.chatSentiment')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <SentimentBar emoji="😊" label={t('gaming.positive')} value={pct(sentiment.positive)} color="bg-green-500" />
                <SentimentBar emoji="😐" label={t('gaming.neutral')} value={pct(sentiment.neutral)} color="bg-muted-foreground" />
                <SentimentBar emoji="😠" label={t('gaming.negative')} value={pct(sentiment.negative)} color="bg-red-500" />
                <p className="text-xs text-muted-foreground pt-1">{sentiment.total} {t('gaming.messagesAnalyzed')}</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className={cardClass}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-400" />
                {t('gaming.viewerInteraction')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" size="sm" className="w-full gap-2 border-white/10" onClick={handleLoadViewers}>
                <Users className="h-3 w-3" /> {t('gaming.viewerList')}
              </Button>
              <Button variant="outline" size="sm" className="w-full gap-2 border-white/10" onClick={() => setShowPollDialog(true)}>
                <Vote className="h-3 w-3" /> {t('gaming.createPoll')}
              </Button>
              <Button variant="outline" size="sm" className="w-full gap-2 border-white/10" onClick={() => setShowPredictionDialog(true)}>
                <Trophy className="h-3 w-3" /> {t('gaming.createPrediction')}
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Viewer List Dialog */}
      <Dialog open={showViewers} onOpenChange={setShowViewers}>
        <DialogContent className={cardClass}>
          <DialogHeader><DialogTitle>Viewer ({viewers.length})</DialogTitle></DialogHeader>
          <div className="max-h-60 overflow-y-auto space-y-1">
            {viewers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">{t('gaming.noViewersFound')}</p>
            ) : (
              viewers.map((v: any, i: number) => (
                <div key={i} className="flex items-center gap-2 p-2 rounded hover:bg-purple-500/10 text-sm transition-colors">
                  <Users className="h-3 w-3 text-muted-foreground" />
                  {v.user_login || v.user_name || 'Unknown'}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Poll Dialog */}
      <Dialog open={showPollDialog} onOpenChange={setShowPollDialog}>
        <DialogContent className={cardClass}>
          <DialogHeader><DialogTitle className="bg-gradient-to-r from-purple-400 to-violet-400 bg-clip-text text-transparent">{t('gaming.pollCreateTitle')}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder={t('gaming.questionPlaceholder')} value={pollTitle} onChange={(e) => setPollTitle(e.target.value)} className="border-white/10" />
            {pollChoices.map((c, i) => (
              <Input key={i} placeholder={`Option ${i + 1}`} value={c} onChange={(e) => { const n = [...pollChoices]; n[i] = e.target.value; setPollChoices(n); }} className="border-white/10" />
            ))}
            {pollChoices.length < 5 && (
              <Button variant="ghost" size="sm" onClick={() => setPollChoices([...pollChoices, ""])}>+ Option</Button>
            )}
            <Input type="number" placeholder={t('gaming.durationSeconds')} value={pollDuration} onChange={(e) => setPollDuration(Number(e.target.value))} className="border-white/10" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPollDialog(false)} className="border-white/10">{t('gaming.cancelBtn')}</Button>
            <Button onClick={handleCreatePoll} className="bg-[#9146FF] hover:bg-[#7B2FFF] text-white">{t('gaming.createBtn')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Prediction Dialog */}
      <Dialog open={showPredictionDialog} onOpenChange={setShowPredictionDialog}>
        <DialogContent className={cardClass}>
          <DialogHeader><DialogTitle className="bg-gradient-to-r from-purple-400 to-violet-400 bg-clip-text text-transparent">{t('gaming.predictionCreateTitle')}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder={t('gaming.questionTopicPlaceholder')} value={predTitle} onChange={(e) => setPredTitle(e.target.value)} className="border-white/10" />
            {predOutcomes.map((o, i) => (
              <Input key={i} placeholder={`Outcome ${i + 1}`} value={o} onChange={(e) => { const n = [...predOutcomes]; n[i] = e.target.value; setPredOutcomes(n); }} className="border-white/10" />
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPredictionDialog(false)} className="border-white/10">{t('gaming.cancelBtn')}</Button>
            <Button onClick={handleCreatePrediction} className="bg-[#9146FF] hover:bg-[#7B2FFF] text-white">{t('gaming.createBtn')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

function SentimentBar({ emoji, label, value, color }: { emoji: string; label: string; value: number; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span>{emoji} {label}</span>
        <span className="font-semibold">{value}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className={`h-full rounded-full ${color}`}
        />
      </div>
    </div>
  );
}
