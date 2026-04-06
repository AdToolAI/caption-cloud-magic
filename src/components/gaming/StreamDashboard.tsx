import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Radio, Users, Eye, Clock, Wifi, WifiOff, ExternalLink } from "lucide-react";

export function StreamDashboard() {
  const [isConnected, setIsConnected] = useState(false);

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-6">
        <div className="p-6 rounded-full bg-purple-500/10 border border-purple-500/20">
          <WifiOff className="h-16 w-16 text-purple-400" />
        </div>
        <div className="text-center space-y-2 max-w-md">
          <h2 className="text-2xl font-bold">Twitch verbinden</h2>
          <p className="text-muted-foreground">
            Verbinde dein Twitch-Konto, um Stream-Status, Viewer-Daten und Chat in Echtzeit zu sehen.
          </p>
        </div>
        <Button
          size="lg"
          className="gap-2 bg-[#9146FF] hover:bg-[#7B2FFF] text-white"
          onClick={() => setIsConnected(true)}
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current">
            <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
          </svg>
          Mit Twitch verbinden
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 mt-4">
      {/* Live Status */}
      <Card className="border-green-500/30 bg-green-500/5">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Radio className="h-5 w-5 text-green-500" />
                <span className="absolute -top-1 -right-1 h-3 w-3 bg-green-500 rounded-full animate-pulse" />
              </div>
              <CardTitle className="text-lg">Stream Live</CardTitle>
              <Badge variant="outline" className="border-green-500/50 text-green-500">LIVE</Badge>
            </div>
            <Button variant="outline" size="sm" className="gap-2">
              <ExternalLink className="h-4 w-4" />
              Auf Twitch ansehen
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-lg font-semibold mb-4">🎮 Ranked Grind — Road to Diamond</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard icon={Users} label="Zuschauer" value="342" />
            <StatCard icon={Eye} label="Peak" value="512" />
            <StatCard icon={Clock} label="Uptime" value="2h 34m" />
            <StatCard icon={Wifi} label="Bitrate" value="6000 kbps" />
          </div>
        </CardContent>
      </Card>

      {/* Recent Streams */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Letzte Streams</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground text-center py-8">
            Hier erscheinen deine letzten Streams, sobald Twitch verbunden ist.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="p-3 rounded-lg bg-muted/50 text-center">
      <Icon className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
      <p className="text-xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
