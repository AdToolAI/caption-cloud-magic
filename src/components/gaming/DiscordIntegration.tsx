import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, CheckCircle2, XCircle, Webhook, Bell, Eye, Scissors, Radio, Settings2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { useTwitch } from "@/hooks/useTwitch";

const cardClass = "backdrop-blur-xl bg-card/60 border border-white/10 shadow-[0_0_20px_rgba(145,70,255,0.08)]";
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.1 } } };
const fadeUp = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

interface DiscordSettings {
  id?: string;
  webhook_url: string;
  auto_notify_live: boolean;
  auto_notify_offline: boolean;
  notify_on_clip: boolean;
  custom_go_live_message: string;
  custom_offline_message: string;
  embed_color: number;
  include_viewer_count: boolean;
  include_category: boolean;
  include_thumbnail: boolean;
  last_notification_at: string | null;
  notification_count: number;
}

const defaultSettings: DiscordSettings = {
  webhook_url: "",
  auto_notify_live: true,
  auto_notify_offline: false,
  notify_on_clip: false,
  custom_go_live_message: "",
  custom_offline_message: "",
  embed_color: 9520895,
  include_viewer_count: true,
  include_category: true,
  include_thumbnail: true,
  last_notification_at: null,
  notification_count: 0,
};

function intToHex(color: number): string {
  return "#" + color.toString(16).padStart(6, "0");
}
function hexToInt(hex: string): number {
  return parseInt(hex.replace("#", ""), 16);
}

export function DiscordIntegration() {
  const [settings, setSettings] = useState<DiscordSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [connected, setConnected] = useState(false);
  const { twitchUser, stream } = useTwitch();

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data } = await supabase
      .from("gaming_discord_settings" as any)
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (data) {
      setSettings(data as any);
      setConnected(true);
    }
    setLoading(false);
  };

  const saveSettings = async () => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    if (!settings.webhook_url.includes("discord.com/api/webhooks/") && !settings.webhook_url.includes("discordapp.com/api/webhooks/")) {
      toast.error("Ungültige Discord Webhook-URL");
      setSaving(false);
      return;
    }

    const payload = {
      user_id: user.id,
      webhook_url: settings.webhook_url,
      auto_notify_live: settings.auto_notify_live,
      auto_notify_offline: settings.auto_notify_offline,
      notify_on_clip: settings.notify_on_clip,
      custom_go_live_message: settings.custom_go_live_message || null,
      custom_offline_message: settings.custom_offline_message || null,
      embed_color: settings.embed_color,
      include_viewer_count: settings.include_viewer_count,
      include_category: settings.include_category,
      include_thumbnail: settings.include_thumbnail,
    };

    const { error } = connected
      ? await supabase.from("gaming_discord_settings" as any).update(payload).eq("user_id", user.id)
      : await supabase.from("gaming_discord_settings" as any).insert(payload);

    if (error) {
      toast.error("Fehler beim Speichern");
      console.error(error);
    } else {
      toast.success("Discord-Einstellungen gespeichert");
      setConnected(true);
    }
    setSaving(false);
  };

  const testWebhook = async () => {
    setTesting(true);
    const { data, error } = await supabase.functions.invoke("discord-webhook", {
      body: { type: "test", webhook_url: settings.webhook_url },
    });
    if (error || !data?.success) {
      toast.error("Webhook-Test fehlgeschlagen");
    } else {
      toast.success("Test-Nachricht gesendet! Prüfe deinen Discord-Kanal.");
      setConnected(true);
      loadSettings();
    }
    setTesting(false);
  };

  const sendNotification = async (type: "go_live" | "stream_end" | "new_clip") => {
    const { error } = await supabase.functions.invoke("discord-webhook", {
      body: {
        type,
        webhook_url: settings.webhook_url,
        stream_title: streamInfo?.title || twitchUser?.display_name + " ist live!",
        game_name: streamInfo?.game_name || "Just Chatting",
        viewer_count: streamInfo?.viewer_count || 0,
        embed_color: settings.embed_color,
        custom_message: type === "go_live" ? settings.custom_go_live_message : settings.custom_offline_message,
        include_viewer_count: settings.include_viewer_count,
        include_category: settings.include_category,
        include_thumbnail: settings.include_thumbnail,
        thumbnail_url: streamInfo?.thumbnail_url?.replace("{width}", "440").replace("{height}", "248"),
      },
    });
    if (error) {
      toast.error("Fehler beim Senden");
    } else {
      toast.success(`${type === "go_live" ? "Go-Live" : type === "stream_end" ? "Stream-Ende" : "Clip"}-Benachrichtigung gesendet!`);
      loadSettings();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
      </div>
    );
  }

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-6">
      {/* Header */}
      <motion.div variants={fadeUp} className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-[#5865F2]/20 flex items-center justify-center">
          <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#5865F2]" fill="currentColor">
            <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286z" />
          </svg>
        </div>
        <div>
          <h2 className="text-xl font-bold bg-gradient-to-r from-[#5865F2] to-purple-400 bg-clip-text text-transparent">
            Discord Integration
          </h2>
          <p className="text-sm text-muted-foreground">Automatische Benachrichtigungen für deinen Discord-Server</p>
        </div>
        <Badge variant={connected ? "default" : "secondary"} className={connected ? "ml-auto bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : "ml-auto"}>
          {connected ? <><CheckCircle2 className="h-3 w-3 mr-1" /> Verbunden</> : <><XCircle className="h-3 w-3 mr-1" /> Nicht verbunden</>}
        </Badge>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Webhook Setup */}
        <motion.div variants={fadeUp}>
          <Card className={cardClass}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Webhook className="h-4 w-4 text-[#5865F2]" /> Webhook einrichten
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3 rounded-lg bg-[#5865F2]/10 border border-[#5865F2]/20 text-xs text-muted-foreground">
                <p className="font-medium text-[#5865F2] mb-1">So findest du die Webhook-URL:</p>
                <ol className="list-decimal list-inside space-y-0.5">
                  <li>Discord → Server-Einstellungen</li>
                  <li>Integrationen → Webhooks</li>
                  <li>Neuer Webhook → URL kopieren</li>
                </ol>
              </div>
              <div className="space-y-2">
                <Label htmlFor="webhook-url">Webhook-URL</Label>
                <Input
                  id="webhook-url"
                  placeholder="https://discord.com/api/webhooks/..."
                  value={settings.webhook_url}
                  onChange={(e) => setSettings((s) => ({ ...s, webhook_url: e.target.value }))}
                  className="font-mono text-xs"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={testWebhook}
                  disabled={testing || !settings.webhook_url}
                  variant="outline"
                  size="sm"
                  className="border-[#5865F2]/30 hover:bg-[#5865F2]/10"
                >
                  {testing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
                  Test senden
                </Button>
                <Button onClick={saveSettings} disabled={saving || !settings.webhook_url} size="sm" className="bg-[#5865F2] hover:bg-[#4752C4]">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Settings2 className="h-4 w-4 mr-1" />}
                  Speichern
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Notification Settings */}
        <motion.div variants={fadeUp}>
          <Card className={cardClass}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Bell className="h-4 w-4 text-purple-400" /> Benachrichtigungen
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Radio className="h-4 w-4 text-red-400" />
                  <Label htmlFor="auto-live" className="text-sm">Go-Live Benachrichtigung</Label>
                </div>
                <Switch id="auto-live" checked={settings.auto_notify_live} onCheckedChange={(v) => setSettings((s) => ({ ...s, auto_notify_live: v }))} />
              </div>
              {settings.auto_notify_live && (
                <Textarea
                  placeholder="Eigene Go-Live Nachricht (optional)..."
                  value={settings.custom_go_live_message}
                  onChange={(e) => setSettings((s) => ({ ...s, custom_go_live_message: e.target.value }))}
                  className="text-xs min-h-[60px]"
                />
              )}

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-muted-foreground" />
                  <Label htmlFor="auto-offline" className="text-sm">Stream-Ende Benachrichtigung</Label>
                </div>
                <Switch id="auto-offline" checked={settings.auto_notify_offline} onCheckedChange={(v) => setSettings((s) => ({ ...s, auto_notify_offline: v }))} />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Scissors className="h-4 w-4 text-purple-400" />
                  <Label htmlFor="auto-clip" className="text-sm">Clips teilen</Label>
                </div>
                <Switch id="auto-clip" checked={settings.notify_on_clip} onCheckedChange={(v) => setSettings((s) => ({ ...s, notify_on_clip: v }))} />
              </div>

              <div className="border-t border-white/5 pt-3 space-y-3">
                <p className="text-xs text-muted-foreground font-medium">Embed-Inhalte</p>
                <div className="flex items-center justify-between">
                  <Label htmlFor="inc-viewers" className="text-xs">Zuschauerzahl</Label>
                  <Switch id="inc-viewers" checked={settings.include_viewer_count} onCheckedChange={(v) => setSettings((s) => ({ ...s, include_viewer_count: v }))} />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="inc-cat" className="text-xs">Kategorie</Label>
                  <Switch id="inc-cat" checked={settings.include_category} onCheckedChange={(v) => setSettings((s) => ({ ...s, include_category: v }))} />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="inc-thumb" className="text-xs">Thumbnail</Label>
                  <Switch id="inc-thumb" checked={settings.include_thumbnail} onCheckedChange={(v) => setSettings((s) => ({ ...s, include_thumbnail: v }))} />
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="embed-color" className="text-xs">Embed-Farbe</Label>
                  <input
                    id="embed-color"
                    type="color"
                    value={intToHex(settings.embed_color)}
                    onChange={(e) => setSettings((s) => ({ ...s, embed_color: hexToInt(e.target.value) }))}
                    className="h-6 w-8 rounded border border-white/10 cursor-pointer bg-transparent"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Live Embed Preview */}
        <motion.div variants={fadeUp}>
          <Card className={cardClass}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Eye className="h-4 w-4 text-purple-400" /> Embed-Vorschau
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg p-4" style={{ backgroundColor: "#36393f" }}>
                {/* Discord embed mock */}
                <div className="flex gap-3">
                  <div className="w-1 rounded-full flex-shrink-0" style={{ backgroundColor: intToHex(settings.embed_color) }} />
                  <div className="flex-1 min-w-0 space-y-2">
                    <p className="text-sm font-semibold text-white">
                      🔴 {streamInfo?.title || twitchUser?.display_name || "Mein Stream"} ist jetzt live!
                    </p>
                    <p className="text-xs" style={{ color: "#dcddde" }}>
                      {settings.custom_go_live_message || "Der Stream hat gerade begonnen — schau jetzt rein!"}
                    </p>
                    <div className="flex gap-4">
                      {settings.include_category && (
                        <div>
                          <p className="text-[10px] font-semibold" style={{ color: "#72767d" }}>🎮 Kategorie</p>
                          <p className="text-xs text-white">{streamInfo?.game_name || "Just Chatting"}</p>
                        </div>
                      )}
                      {settings.include_viewer_count && (
                        <div>
                          <p className="text-[10px] font-semibold" style={{ color: "#72767d" }}>👁 Zuschauer</p>
                          <p className="text-xs text-white">{streamInfo?.viewer_count || "0"}</p>
                        </div>
                      )}
                    </div>
                    {settings.include_thumbnail && (
                      <div className="rounded bg-black/30 h-24 flex items-center justify-center mt-2">
                        <p className="text-[10px] text-white/40">Stream Thumbnail</p>
                      </div>
                    )}
                    <p className="text-[10px]" style={{ color: "#72767d" }}>CaptionGenie Gaming Hub • Heute</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Notification History + Actions */}
        <motion.div variants={fadeUp}>
          <Card className={cardClass}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Send className="h-4 w-4 text-purple-400" /> Aktionen & Statistik
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-purple-500/10 border border-purple-500/20 p-3 text-center">
                  <p className="text-2xl font-bold text-purple-300">{settings.notification_count}</p>
                  <p className="text-[10px] text-muted-foreground">Notifications gesendet</p>
                </div>
                <div className="rounded-lg bg-purple-500/10 border border-purple-500/20 p-3 text-center">
                  <p className="text-sm font-medium text-purple-300">
                    {settings.last_notification_at
                      ? new Date(settings.last_notification_at).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
                      : "—"}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Letzte Benachrichtigung</p>
                </div>
              </div>

              <div className="space-y-2">
                <Button
                  onClick={() => sendNotification("go_live")}
                  disabled={!connected}
                  size="sm"
                  className="w-full bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30"
                  variant="outline"
                >
                  <Radio className="h-4 w-4 mr-2" /> Go-Live senden
                </Button>
                <Button
                  onClick={() => sendNotification("stream_end")}
                  disabled={!connected}
                  size="sm"
                  variant="outline"
                  className="w-full"
                >
                  <XCircle className="h-4 w-4 mr-2" /> Stream-Ende senden
                </Button>
                <Button
                  onClick={() => sendNotification("new_clip")}
                  disabled={!connected}
                  size="sm"
                  variant="outline"
                  className="w-full"
                >
                  <Scissors className="h-4 w-4 mr-2" /> Clip teilen
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );
}
