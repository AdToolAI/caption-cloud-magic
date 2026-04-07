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

export function StreamDashboard() {
  const {
    twitchUser, stream, channel, loading,
    isConnected, isLive, connectTwitch, disconnectTwitch,
    updateChannel, searchGames, createClip,
  } = useTwitch();

  const [showConnectDialog, setShowConnectDialog] = useState(false);
  const [username, setUsername] = useState("");
  const [connecting, setConnecting] = useState(false);

  // Stream setup state
  const [editTitle, setEditTitle] = useState("");
  const [editGameQuery, setEditGameQuery] = useState("");
  const [editGameId, setEditGameId] = useState("");
  const [editTags, setEditTags] = useState("");
  const [gameResults, setGameResults] = useState<any[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clipping, setClipping] = useState(false);

  // Init edit fields from channel/stream data
  useEffect(() => {
    if (stream) {
      setEditTitle(stream.title || "");
      setEditGameQuery(stream.game_name || "");
    } else if (channel) {
      setEditTitle(channel.title || "");
      setEditGameQuery(channel.game_name || "");
    }
  }, [stream, channel]);

  // Game search debounce
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

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      await updateChannel(editTitle || undefined, editGameId || undefined, editTags ? editTags.split(",").map(t => t.trim()) : undefined);
      toast.success("Stream-Einstellungen gespeichert!");
      setIsEditing(false);
    } catch (e: any) {
      toast.error(e.message || "Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateClip = async () => {
    setClipping(true);
    try {
      const result = await createClip();
      if (result?.edit_url) {
        toast.success("Clip erstellt! Wird in wenigen Sekunden verfügbar.", {
          action: { label: "Öffnen", onClick: () => window.open(result.edit_url, '_blank') },
        });
      } else {
        toast.success("Clip wird erstellt...");
      }
    } catch (e: any) {
      toast.error(e.message || "Clip konnte nicht erstellt werden");
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
            <TwitchIcon />
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
              <Button variant="outline" onClick={() => setShowConnectDialog(false)}>Abbrechen</Button>
              <Button onClick={handleConnect} disabled={connecting || !username.trim()} className="bg-[#9146FF] hover:bg-[#7B2FFF] text-white">
                {connecting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Verbinden
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

  // Pre-stream checklist
  const checklist = [
    { label: "Titel gesetzt", ok: !!editTitle },
    { label: "Kategorie gewählt", ok: !!editGameQuery },
    { label: "OBS bereit", ok: false },
  ];

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
        <div className="space-y-4">
          <Card className="border-green-500/30 bg-green-500/5">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Radio className="h-5 w-5 text-green-500" />
                    <span className="absolute -top-1 -right-1 h-3 w-3 bg-green-500 rounded-full animate-pulse" />
                  </div>
                  <CardTitle className="text-lg">Stream Live</CardTitle>
                  <Badge variant="outline" className="border-green-500/50 text-green-500">LIVE</Badge>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="gap-2" onClick={handleCreateClip} disabled={clipping}>
                    {clipping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scissors className="h-4 w-4" />}
                    Quick-Clip
                  </Button>
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => setIsEditing(!isEditing)}>
                    <Edit3 className="h-4 w-4" />
                    Bearbeiten
                  </Button>
                  <Button
                    variant="outline" size="sm" className="gap-2"
                    onClick={() => window.open(`https://twitch.tv/${twitchUser?.login}`, '_blank')}
                  >
                    <ExternalLink className="h-4 w-4" />
                    Auf Twitch
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
                <StatCard icon={Users} label="Zuschauer" value={stream.viewer_count.toLocaleString()} />
                <StatCard icon={Clock} label="Uptime" value={uptime || '-'} />
                <StatCard icon={Eye} label="Spiel" value={stream.game_name || '-'} />
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        /* Offline State — Stream Setup */
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Monitor className="h-5 w-5 text-purple-400" />
                Stream vorbereiten
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
              />
            </CardContent>
          </Card>

          {/* Pre-Stream Checklist */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Pre-Stream Checkliste</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {checklist.map((item) => (
                  <div key={item.label} className="flex items-center gap-2 text-sm">
                    {item.ok ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className={item.ok ? "text-foreground" : "text-muted-foreground"}>{item.label}</span>
                  </div>
                ))}
              </div>
              <Button
                className="w-full mt-4 gap-2"
                variant="outline"
                onClick={() => window.open('obsproject://', '_blank')}
              >
                <Monitor className="h-4 w-4" />
                OBS öffnen
              </Button>
            </CardContent>
          </Card>

          {/* Offline Info */}
          <Card>
            <CardContent className="py-8 text-center">
              <WifiOff className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
              <p className="text-lg font-semibold">Offline</p>
              <p className="text-sm text-muted-foreground">{channel?.title || 'Kein aktiver Stream'}</p>
              {channel?.game_name && (
                <p className="text-xs text-muted-foreground mt-1">Zuletzt: {channel.game_name}</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function StreamSettingsForm({
  editTitle, setEditTitle,
  editGameQuery, setEditGameQuery,
  editGameId, setEditGameId,
  editTags, setEditTags,
  gameResults,
  saving, onSave, onCancel,
}: {
  editTitle: string; setEditTitle: (v: string) => void;
  editGameQuery: string; setEditGameQuery: (v: string) => void;
  editGameId: string; setEditGameId: (v: string) => void;
  editTags: string; setEditTags: (v: string) => void;
  gameResults: any[];
  saving: boolean; onSave: () => void; onCancel?: () => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm">Stream-Titel</Label>
        <Input
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          placeholder="Mein epischer Stream..."
          className="mt-1"
        />
      </div>
      <div className="relative">
        <Label className="text-sm">Kategorie</Label>
        <Input
          value={editGameQuery}
          onChange={(e) => { setEditGameQuery(e.target.value); setEditGameId(""); }}
          placeholder="Spiel oder Kategorie suchen..."
          className="mt-1"
        />
        {gameResults.length > 0 && !editGameId && (
          <div className="absolute z-10 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {gameResults.map((g: any) => (
              <button
                key={g.id}
                className="w-full px-3 py-2 text-left text-sm hover:bg-accent flex items-center gap-2"
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
        <Label className="text-sm">Tags (kommagetrennt)</Label>
        <Input
          value={editTags}
          onChange={(e) => setEditTags(e.target.value)}
          placeholder="Deutsch, Gaming, FPS..."
          className="mt-1"
        />
      </div>
      <div className="flex gap-2">
        <Button onClick={onSave} disabled={saving} className="gap-2 bg-[#9146FF] hover:bg-[#7B2FFF] text-white">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Speichern
        </Button>
        {onCancel && (
          <Button variant="outline" onClick={onCancel}>Abbrechen</Button>
        )}
      </div>
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

function TwitchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current">
      <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
    </svg>
  );
}
