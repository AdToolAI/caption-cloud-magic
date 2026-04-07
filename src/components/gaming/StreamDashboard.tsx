import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Radio, Users, Eye, Clock, Wifi, WifiOff, ExternalLink, Loader2, X, Gamepad2 } from "lucide-react";
import { useTwitch } from "@/hooks/useTwitch";
import { toast } from "sonner";

export function StreamDashboard() {
  const {
    twitchUser, stream, channel, loading,
    isConnected, isLive, connectTwitch, disconnectTwitch,
  } = useTwitch();

  const [showConnectDialog, setShowConnectDialog] = useState(false);
  const [username, setUsername] = useState("");
  const [connecting, setConnecting] = useState(false);

  const handleConnect = async () => {
    if (!username.trim()) return;
    setConnecting(true);
    try {
      await connectTwitch(username.trim());
      setShowConnectDialog(false);
      setUsername("");
      toast.success("Twitch verbunden!");
    } catch (e: any) {
      toast.error(e.message || "Verbindung fehlgeschlagen");
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    await disconnectTwitch();
    toast.success("Twitch getrennt");
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
            onClick={() => setShowConnectDialog(true)}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current">
              <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
            </svg>
            Mit Twitch verbinden
          </Button>
        </div>

        <Dialog open={showConnectDialog} onOpenChange={setShowConnectDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Twitch-Benutzername eingeben</DialogTitle>
            </DialogHeader>
            <Input
              placeholder="z.B. ninja, pokimane..."
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
            />
            <p className="text-xs text-muted-foreground">
              Gib deinen Twitch-Benutzernamen ein, um deinen Kanal zu verbinden.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowConnectDialog(false)}>
                Abbrechen
              </Button>
              <Button
                onClick={handleConnect}
                disabled={connecting || !username.trim()}
                className="bg-[#9146FF] hover:bg-[#7B2FFF] text-white"
              >
                {connecting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Verbinden
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // Calculate uptime
  const uptime = stream?.started_at
    ? (() => {
        const diff = Date.now() - new Date(stream.started_at).getTime();
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        return `${h}h ${m}m`;
      })()
    : null;

  return (
    <div className="space-y-6 mt-4">
      {/* Connected Account Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {twitchUser?.profile_image_url && (
            <img src={twitchUser.profile_image_url} alt="" className="h-10 w-10 rounded-full" />
          )}
          <div>
            <p className="font-semibold">{twitchUser?.display_name || twitchUser?.login}</p>
            <p className="text-xs text-muted-foreground">twitch.tv/{twitchUser?.login}</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={handleDisconnect} className="text-destructive">
          <X className="h-4 w-4 mr-1" /> Trennen
        </Button>
      </div>

      {isLive && stream ? (
        /* Live State */
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
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => window.open(`https://twitch.tv/${twitchUser?.login}`, '_blank')}
              >
                <ExternalLink className="h-4 w-4" />
                Auf Twitch ansehen
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold mb-1">{stream.title}</p>
            {stream.game_name && (
              <p className="text-sm text-muted-foreground mb-4 flex items-center gap-1">
                <Gamepad2 className="h-3 w-3" /> {stream.game_name}
              </p>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <StatCard icon={Users} label="Zuschauer" value={stream.viewer_count.toLocaleString()} />
              <StatCard icon={Clock} label="Uptime" value={uptime || '-'} />
              <StatCard icon={Eye} label="Spiel" value={stream.game_name || '-'} />
            </div>
          </CardContent>
        </Card>
      ) : (
        /* Offline State */
        <Card>
          <CardContent className="py-12 text-center">
            <WifiOff className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
            <p className="text-lg font-semibold">Offline</p>
            <p className="text-sm text-muted-foreground">
              {channel?.title || 'Kein aktiver Stream'}
            </p>
            {channel?.game_name && (
              <p className="text-xs text-muted-foreground mt-1">
                Zuletzt gespielt: {channel.game_name}
              </p>
            )}
          </CardContent>
        </Card>
      )}
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
