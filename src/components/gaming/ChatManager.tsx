import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Shield, Bot, Send, TrendingUp } from "lucide-react";

const mockMessages = [
  { user: "GamerDude42", msg: "GG! That was insane!", sentiment: "positive" },
  { user: "StreamFan", msg: "How do you aim so well?", sentiment: "neutral" },
  { user: "ProViewer", msg: "Best play I've seen today 🔥", sentiment: "positive" },
  { user: "NewFollower", msg: "Just followed! Love the stream", sentiment: "positive" },
];

export function ChatManager() {
  const [message, setMessage] = useState("");

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-4">
      {/* Live Chat */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-purple-400" />
              Live-Chat
            </CardTitle>
            <Badge variant="outline" className="text-xs">Demo-Modus</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-80 overflow-y-auto space-y-2 mb-4 p-3 rounded-lg bg-muted/30 border border-border">
            {mockMessages.map((m, i) => (
              <div key={i} className="flex gap-2 text-sm">
                <span className="font-semibold text-purple-400 shrink-0">{m.user}:</span>
                <span className="text-foreground">{m.msg}</span>
                {m.sentiment === "positive" && (
                  <Badge variant="secondary" className="text-[10px] h-4 ml-auto shrink-0">😊</Badge>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Nachricht senden..."
              className="flex-1"
            />
            <Button size="icon" className="bg-purple-600 hover:bg-purple-700">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Chat Tools */}
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-400" />
              Chat-Sentiment
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>😊 Positiv</span>
                <span className="font-semibold text-green-400">75%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>😐 Neutral</span>
                <span className="font-semibold">20%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>😠 Negativ</span>
                <span className="font-semibold text-red-400">5%</span>
              </div>
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
