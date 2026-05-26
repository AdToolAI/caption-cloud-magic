import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Sparkles, Loader2, Wand2, Rocket, Save, ChevronDown, Clock, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { InstagramPostPreview } from "@/components/post-generator/InstagramPostPreview";
import { FacebookPostPreview } from "@/components/post-generator/FacebookPostPreview";
import { LinkedInPostPreview } from "@/components/post-generator/LinkedInPostPreview";
import { XPostPreview } from "@/components/post-generator/XPostPreview";
import { TikTokPostPreview } from "@/components/post-generator/TikTokPostPreview";

interface PostComposerPanelProps {
  event: any;
  onUpdate: (field: string, value: any) => void | Promise<void>;
  onPatch: (patch: Record<string, any>) => void | Promise<void>;
}

const PLATFORMS = [
  { id: "instagram", name: "Instagram", icon: "📷", limit: 2200, color: "#ec4899", rgb: "236,72,153" },
  { id: "facebook",  name: "Facebook",  icon: "👍", limit: 63206, color: "#1877f2", rgb: "24,119,242" },
  { id: "linkedin",  name: "LinkedIn",  icon: "💼", limit: 3000,  color: "#22d3ee", rgb: "34,211,238" },
  { id: "tiktok",    name: "TikTok",    icon: "🎵", limit: 2200,  color: "#22d3ee", rgb: "34,211,238" },
  { id: "youtube",   name: "YouTube",   icon: "▶️", limit: 5000,  color: "#ef4444", rgb: "239,68,68" },
  { id: "x",         name: "X",         icon: "𝕏",  limit: 280,   color: "#cbd5e1", rgb: "203,213,225" },
];

// Edle Glas-Karten-Sektion mit Gold-Akzent-Kante
function Section({
  title,
  icon,
  children,
  accent = "default",
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  accent?: "default" | "primary" | "indigo";
}) {
  const accentBar =
    accent === "primary"
      ? "bg-gradient-to-b from-[hsl(var(--primary))]/80 via-[hsl(var(--primary))]/30 to-transparent"
      : accent === "indigo"
      ? "bg-gradient-to-b from-indigo-400/80 via-indigo-400/30 to-transparent"
      : "bg-gradient-to-b from-white/30 via-white/10 to-transparent";
  return (
    <section
      className="relative rounded-xl border border-white/[0.06] bg-[#0b0f1a]/70 backdrop-blur-md p-4"
      style={{ boxShadow: "0 1px 0 0 rgba(255,255,255,0.03) inset" }}
    >
      <span className={cn("absolute left-0 top-3 bottom-3 w-[1.5px] rounded-r-full", accentBar)} />
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h3 className="text-[10px] uppercase tracking-[0.18em] font-semibold text-[hsl(var(--primary))]/80">
          {title}
        </h3>
      </div>
      {children}
    </section>
  );
}

const TONALITIES = [
  { id: "professional", label: "Professionell" },
  { id: "casual",       label: "Casual" },
  { id: "bold",         label: "Bold & Hook-driven" },
  { id: "storytelling", label: "Storytelling" },
];

export function PostComposerPanel({ event, onUpdate, onPatch }: PostComposerPanelProps) {
  const [brief, setBrief] = useState(event?.brief ?? "");
  const [caption, setCaption] = useState(event?.caption ?? "");
  const [hashtags, setHashtags] = useState<string[]>(event?.hashtags ?? []);
  const [channels, setChannels] = useState<string[]>(event?.channels ?? ["instagram"]);
  const [startAt, setStartAt] = useState<string>(
    event?.start_at ? new Date(event.start_at).toISOString().slice(0, 16) : ""
  );
  const [autoPublish, setAutoPublish] = useState(event?.status === "scheduled");
  const [tonality, setTonality] = useState("professional");
  const [briefOpen, setBriefOpen] = useState(!event?.caption);

  const [generating, setGenerating] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const [generatedResult, setGeneratedResult] = useState<any>(null);
  const [selectedHook, setSelectedHook] = useState<string | null>(null);
  const [previewPlatform, setPreviewPlatform] = useState<string>(channels[0] ?? "instagram");

  useEffect(() => {
    setBrief(event?.brief ?? "");
    setCaption(event?.caption ?? "");
    setHashtags(event?.hashtags ?? []);
    setChannels(event?.channels ?? ["instagram"]);
    setStartAt(event?.start_at ? new Date(event.start_at).toISOString().slice(0, 16) : "");
    setAutoPublish(event?.status === "scheduled");
    setPreviewPlatform((event?.channels?.[0] ?? "instagram"));
  }, [event?.id]);

  const mediaUrl = event?.assets_json?.[0]?.url || event?.assets_json?.[0] || "";
  const mediaType: "image" | "video" =
    event?.assets_json?.[0]?.type === "video" ||
    (typeof mediaUrl === "string" && /\.(mp4|webm|mov)$/i.test(mediaUrl))
      ? "video"
      : "image";

  const callGenerator = async (overrides: Record<string, any> = {}) => {
    if (!brief?.trim()) {
      toast.error("Bitte zuerst ein Briefing eingeben");
      return null;
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      toast.error("Nicht eingeloggt");
      return null;
    }
    const { data, error } = await supabase.functions.invoke("generate-post-v2", {
      body: {
        workspaceId: event.workspace_id,
        brief,
        mediaUrl: mediaUrl || null,
        mediaType,
        platforms: channels.length ? channels : ["instagram"],
        languages: ["de"],
        stylePreset: tonality === "professional" ? "clean" : tonality,
        options: {},
        ...overrides,
      },
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (error) {
      toast.error("Generierung fehlgeschlagen: " + error.message);
      return null;
    }
    return data?.result ?? null;
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const result = await callGenerator();
      if (!result) return;
      setGeneratedResult(result);
      const firstHook = result?.hooks?.A || result?.hooks?.[0] || "";
      const baseCaption = result?.caption || "";
      const tags: string[] = result?.hashtags?.reach || result?.hashtags || [];
      setSelectedHook(firstHook);
      const combined = firstHook ? `${firstHook}\n\n${baseCaption}` : baseCaption;
      setCaption(combined);
      if (tags.length) setHashtags(tags);
      await onPatch({ caption: combined, hashtags: tags });
      toast.success("Post generiert ✨");
    } finally {
      setGenerating(false);
    }
  };

  const handleRewrite = async () => {
    setRewriting(true);
    try {
      const result = await callGenerator({ rewriteCurrent: caption, tone: tonality });
      if (!result) return;
      const baseCaption = result?.caption || caption;
      const newHook = result?.hooks?.A || selectedHook || "";
      const combined = newHook ? `${newHook}\n\n${baseCaption}` : baseCaption;
      setCaption(combined);
      await onPatch({ caption: combined });
      toast.success("Caption umgeschrieben 🪄");
    } finally {
      setRewriting(false);
    }
  };

  const pickHook = (hook: string) => {
    setSelectedHook(hook);
    const body = caption.replace(/^.*?\n\n/, "");
    const combined = `${hook}\n\n${body}`;
    setCaption(combined);
    onPatch({ caption: combined });
  };

  const toggleHashtag = (tag: string) => {
    const t = tag.startsWith("#") ? tag : `#${tag}`;
    const next = hashtags.includes(t) ? hashtags.filter((x) => x !== t) : [...hashtags, t];
    setHashtags(next);
    onPatch({ hashtags: next });
  };

  const toggleChannel = (id: string) => {
    const next = channels.includes(id)
      ? channels.length === 1 ? channels : channels.filter((c) => c !== id)
      : [...channels, id];
    setChannels(next);
    if (!next.includes(previewPlatform)) setPreviewPlatform(next[0]);
    onPatch({ channels: next });
  };

  const saveSchedule = (val: string) => {
    setStartAt(val);
    if (val) onPatch({ start_at: new Date(val).toISOString() });
  };

  const handleReadyToPublish = async () => {
    if (!caption.trim()) {
      toast.error("Caption fehlt");
      return;
    }
    if (channels.length === 0) {
      toast.error("Mindestens eine Plattform auswählen");
      return;
    }
    if (!startAt) {
      toast.error("Bitte Zeitpunkt setzen");
      return;
    }
    const ts = new Date(startAt).getTime();
    if (ts < Date.now()) {
      toast.error("Zeitpunkt liegt in der Vergangenheit");
      return;
    }
    await onPatch({
      caption,
      hashtags,
      channels,
      brief,
      start_at: new Date(startAt).toISOString(),
      status: "scheduled",
    });
    const mins = Math.round((ts - Date.now()) / 60000);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    toast.success(
      `🚀 Eingeplant — wird in ${h > 0 ? `${h}h ` : ""}${m}min automatisch veröffentlicht`,
    );
    setAutoPublish(true);
  };

  const handleSaveDraft = async () => {
    await onPatch({ caption, hashtags, channels, brief, ...(startAt ? { start_at: new Date(startAt).toISOString() } : {}) });
    toast.success("Entwurf gespeichert");
  };

  const hooks: Record<string, string> = useMemo(() => {
    const h = generatedResult?.hooks;
    if (!h) return {};
    if (Array.isArray(h)) return Object.fromEntries(h.map((v: string, i: number) => [String.fromCharCode(65 + i), v]));
    return h;
  }, [generatedResult]);

  const hashtagGroups: Record<string, string[]> = useMemo(() => {
    const tags = generatedResult?.hashtags;
    if (!tags) return {};
    if (Array.isArray(tags)) return { reach: tags };
    return tags;
  }, [generatedResult]);

  const currentLimit = PLATFORMS.find((p) => p.id === previewPlatform)?.limit ?? 2200;
  const overLimit = caption.length > currentLimit;

  const renderPreview = () => {
    const props = {
      mediaUrl: mediaUrl || "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=600",
      mediaType,
      caption,
      hook: selectedHook ?? undefined,
      hashtags,
    };
    switch (previewPlatform) {
      case "facebook": return <FacebookPostPreview {...props} />;
      case "linkedin": return <LinkedInPostPreview {...props} />;
      case "tiktok":   return <TikTokPostPreview {...props} />;
      case "x":        return <XPostPreview {...props} />;
      default:         return <InstagramPostPreview {...props} />;
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 mt-4">
      {/* LEFT — Composer */}
      <div className="space-y-5">
        {/* Briefing collapsible */}
        <Collapsible open={briefOpen} onOpenChange={setBriefOpen}>
          <CollapsibleTrigger asChild>
            <button className="flex items-center justify-between w-full text-left text-sm font-semibold text-foreground/80 hover:text-primary transition">
              <span className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-primary" /> Briefing
              </span>
              <ChevronDown className={cn("h-4 w-4 transition", briefOpen && "rotate-180")} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <Textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              onBlur={() => onUpdate("brief", brief)}
              rows={3}
              placeholder="Was soll der Post aussagen?"
              className="bg-card/40 border-white/10"
            />
          </CollapsibleContent>
        </Collapsible>

        {/* Action bar */}
        <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl border border-primary/20 bg-gradient-to-r from-primary/5 via-purple-500/5 to-primary/5 backdrop-blur-md shadow-[0_0_20px_-8px_hsla(43,90%,68%,0.4)]">
          <Button
            onClick={handleGenerate}
            disabled={generating || !brief?.trim()}
            size="sm"
            className="bg-gradient-to-r from-primary to-amber-500 text-black font-semibold hover:opacity-90"
          >
            {generating ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
            Generieren
          </Button>
          <select
            value={tonality}
            onChange={(e) => setTonality(e.target.value)}
            className="text-xs h-8 rounded-md bg-card/60 border border-white/10 px-2"
          >
            {TONALITIES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <Button
            onClick={handleRewrite}
            disabled={rewriting || !caption}
            size="sm"
            variant="outline"
            className="border-purple-500/40 hover:bg-purple-500/10"
          >
            {rewriting ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5 mr-1.5" />}
            Umschreiben
          </Button>
        </div>

        {/* Hooks */}
        {Object.keys(hooks).length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Hook auswählen</Label>
            <div className="grid gap-2">
              {Object.entries(hooks).map(([key, value]) => (
                <button
                  key={key}
                  onClick={() => pickHook(value)}
                  className={cn(
                    "text-left p-3 rounded-lg border text-sm transition-all",
                    selectedHook === value
                      ? "border-primary bg-primary/10 shadow-[0_0_15px_-4px_hsla(43,90%,68%,0.5)]"
                      : "border-white/10 bg-card/40 hover:border-primary/40"
                  )}
                >
                  <span className="text-[10px] font-bold text-primary mr-2">{key}</span>
                  {value}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Caption */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Caption</Label>
            <span className={cn("text-[10px] tabular-nums", overLimit ? "text-destructive" : "text-muted-foreground")}>
              {caption.length} / {currentLimit}
            </span>
          </div>
          <Textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            onBlur={() => onUpdate("caption", caption)}
            rows={7}
            className="bg-card/40 border-white/10 font-mono text-sm"
            placeholder="Schreibe oder generiere die Caption…"
          />
          {overLimit && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Überschreitet {PLATFORMS.find(p=>p.id===previewPlatform)?.name}-Limit
            </p>
          )}
        </div>

        {/* Hashtag groups */}
        {Object.keys(hashtagGroups).length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Hashtag-Gruppen</Label>
            <Tabs defaultValue={Object.keys(hashtagGroups)[0]}>
              <TabsList className="bg-card/40">
                {Object.keys(hashtagGroups).map((g) => (
                  <TabsTrigger key={g} value={g} className="text-xs capitalize">{g}</TabsTrigger>
                ))}
              </TabsList>
              {Object.entries(hashtagGroups).map(([g, tags]) => (
                <TabsContent key={g} value={g} className="flex flex-wrap gap-1.5 mt-2">
                  {(tags as string[]).map((t) => {
                    const tag = t.startsWith("#") ? t : `#${t}`;
                    const active = hashtags.includes(tag);
                    return (
                      <button
                        key={tag}
                        onClick={() => toggleHashtag(tag)}
                        className={cn(
                          "text-xs px-2 py-1 rounded-md border transition",
                          active
                            ? "bg-primary/15 border-primary/50 text-primary"
                            : "bg-card/40 border-white/10 hover:border-primary/30"
                        )}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </TabsContent>
              ))}
            </Tabs>
          </div>
        )}

        {/* Active hashtags */}
        {hashtags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {hashtags.map((t, i) => (
              <Badge key={i} variant="secondary" className="text-[10px]">{t}</Badge>
            ))}
          </div>
        )}

        {/* Channels */}
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Plattformen</Label>
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map((p) => {
              const active = channels.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggleChannel(p.id)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border",
                    active
                      ? "text-white border-transparent"
                      : "bg-card/40 text-muted-foreground border-white/10 hover:border-primary/30"
                  )}
                  style={active ? {
                    background: `linear-gradient(120deg, rgba(${p.glow},0.9), rgba(${p.glow},0.6))`,
                    boxShadow: `0 0 14px rgba(${p.glow},0.45)`,
                  } : undefined}
                >
                  {p.icon} {p.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Schedule */}
        <div className="space-y-2 p-4 rounded-xl border border-indigo-400/30 bg-indigo-500/5">
          <Label className="text-xs uppercase tracking-wider text-indigo-300 flex items-center gap-1.5">
            <Clock className="h-3 w-3" /> Auto-Publish Zeitpunkt
          </Label>
          <Input
            type="datetime-local"
            value={startAt}
            onChange={(e) => saveSchedule(e.target.value)}
            className="bg-card/40 border-white/10 max-w-xs"
          />
          <div className="flex items-center gap-2 pt-1">
            <Switch checked={autoPublish} onCheckedChange={setAutoPublish} />
            <span className="text-xs text-muted-foreground">
              Automatisch veröffentlichen wenn Status = <span className="text-indigo-300 font-semibold">scheduled</span>
            </span>
          </div>
        </div>

        {/* Footer CTA */}
        <div className="flex flex-wrap gap-2 pt-2 sticky bottom-0 bg-background/80 backdrop-blur-md py-3 -mx-1 px-1 border-t border-white/5">
          <Button onClick={handleSaveDraft} variant="outline" size="sm">
            <Save className="h-3.5 w-3.5 mr-1.5" /> Entwurf speichern
          </Button>
          <motion.div whileHover={{ scale: 1.02 }}>
            <Button
              onClick={handleReadyToPublish}
              size="sm"
              className="bg-gradient-to-r from-emerald-500 via-primary to-amber-500 text-black font-bold shadow-[0_0_20px_-4px_hsla(43,90%,68%,0.6)]"
            >
              <Rocket className="h-3.5 w-3.5 mr-1.5" /> Bereit zum Auto-Publish
            </Button>
          </motion.div>
        </div>
      </div>

      {/* RIGHT — Live preview */}
      <div className="space-y-3">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Live-Vorschau</Label>
        <div className="flex flex-wrap gap-1">
          {channels.map((c) => {
            const p = PLATFORMS.find((x) => x.id === c);
            if (!p) return null;
            const active = previewPlatform === c;
            return (
              <button
                key={c}
                onClick={() => setPreviewPlatform(c)}
                className={cn(
                  "text-[10px] px-2 py-1 rounded-md border transition",
                  active ? "text-white border-transparent" : "bg-card/40 border-white/10 text-muted-foreground"
                )}
                style={active ? {
                  background: `linear-gradient(120deg, rgba(${p.glow},0.9), rgba(${p.glow},0.5))`,
                  boxShadow: `0 0 10px rgba(${p.glow},0.4)`,
                } : undefined}
              >
                {p.icon} {p.name}
              </button>
            );
          })}
        </div>
        <div className="rounded-xl overflow-hidden border border-white/10 bg-card/30 backdrop-blur-md">
          {renderPreview()}
        </div>
      </div>
    </div>
  );
}
