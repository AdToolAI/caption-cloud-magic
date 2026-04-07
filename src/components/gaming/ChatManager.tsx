import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Shield, Bot, TrendingUp, Loader2, WifiOff } from "lucide-react";
import { useTwitch } from "@/hooks/useTwitch";

interface ChatMessage {
  user: string;
  msg: string;
  color?: string;
  timestamp: number;
}

export function ChatManager() {
  const { twitchUsername, isConnected, isLive, loading } = useTwitch();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatConnected, setChatConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Sentiment tracking
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
        if (line.startsWith('PING')) {
          ws.send('PONG :tmi.twitch.tv');
          continue;
        }

        // Parse PRIVMSG
        const privmsgMatch = line.match(/:(\w+)!\w+@\w+\.tmi\.twitch\.tv PRIVMSG #\w+ :(.+)/);
        if (privmsgMatch) {
          const [, user, msg] = privmsgMatch;
          // Extract color from tags
          const colorMatch = line.match(/color=(#[0-9a-fA-F]{6})/);
          const newMsg: ChatMessage = {
            user,
            msg,
            color: colorMatch?.[1] || '#9146FF',
            timestamp: Date.now(),
          };

          setMessages(prev => [...prev.slice(-200), newMsg]);

          const s = simpleSentiment(msg);
          setSentiment(prev => ({
            ...prev,
            [s]: prev[s] + 1,
            total: prev.total + 1,
          }));
        }
      }
    };

    ws.onclose = () => {
      setChatConnected(false);
      wsRef.current = null;
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [twitchUsername]);

  useEffect(() => {
    if (isConnected && twitchUsername) {
      connectChat();
    }
    return () => {
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [isConnected, twitchUsername, connectChat]);

  // Auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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

  const pct = (val: number) => sentiment.total > 0 ? Math.round((val / sentiment.total) * 100) : 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-4">
      {/* Live Chat */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-purple-400" />
              Live-Chat — #{twitchUsername}
            </CardTitle>
            <Badge variant="outline" className={chatConnected ? "text-green-500 border-green-500/50" : "text-muted-foreground"}>
              {chatConnected ? "Verbunden" : "Verbindet..."}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-80 overflow-y-auto space-y-1 mb-4 p-3 rounded-lg bg-muted/30 border border-border font-mono text-sm">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                {isLive ? (
                  <p>Warte auf Nachrichten...</p>
                ) : (
                  <>
                    <WifiOff className="h-8 w-8 mb-2 opacity-50" />
                    <p>Kanal ist offline — Chat wird trotzdem angezeigt</p>
                  </>
                )}
              </div>
            ) : (
              messages.map((m, i) => (
                <div key={i} className="flex gap-2">
                  <span className="font-semibold shrink-0" style={{ color: m.color }}>
                    {m.user}:
                  </span>
                  <span className="text-foreground break-all">{m.msg}</span>
                </div>
              ))
            )}
            <div ref={chatEndRef} />
          </div>
          <p className="text-xs text-muted-foreground">
            📖 Nur-Lese-Modus — Chat-Nachrichten werden live via IRC empfangen
          </p>
        </CardContent>
      </Card>

      {/* Chat Tools */}
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-400" />
              Chat-Sentiment (Live)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>😊 Positiv</span>
                <span className="font-semibold text-green-400">{pct(sentiment.positive)}%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>😐 Neutral</span>
                <span className="font-semibold">{pct(sentiment.neutral)}%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>😠 Negativ</span>
                <span className="font-semibold text-red-400">{pct(sentiment.negative)}%</span>
              </div>
              <p className="text-xs text-muted-foreground pt-2">
                {sentiment.total} Nachrichten analysiert
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="h-4 w-4 text-blue-400" />
              Moderation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Button variant="outline" size="sm" className="w-full gap-2 mb-2">
              <Shield className="h-3 w-3" />
              Auto-Mod konfigurieren
            </Button>
            <Button variant="outline" size="sm" className="w-full gap-2">
              <Bot className="h-3 w-3" />
              Auto-Antworten
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
