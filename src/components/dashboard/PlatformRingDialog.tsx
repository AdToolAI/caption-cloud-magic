import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { PostMediaUploader } from "@/components/calendar/PostMediaUploader";
import { PostPreviewMockup } from "./PostPreviewMockup";
import { StrategyContextPanel } from "./StrategyContextPanel";
import { useStrategyMode, type StrategyPost } from "@/hooks/useStrategyMode";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Instagram, Music, Linkedin, Facebook, Twitter, Youtube, Trash2, Save, CalendarPlus, Sparkles, Clock, Wand2, Eye, Compass, Calendar as CalendarIcon, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { evaluateSlot } from "@/lib/slotScoring";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  post: StrategyPost | null;
}

const platformMeta: Record<string, { icon: typeof Instagram; label: string; color: string }> = {
  instagram: { icon: Instagram, label: "Instagram", color: "text-purple-500" },
  facebook: { icon: Facebook, label: "Facebook", color: "text-blue-500" },
  linkedin: { icon: Linkedin, label: "LinkedIn", color: "text-green-500" },
  youtube: { icon: Youtube, label: "YouTube", color: "text-red-500" },
  x: { icon: Twitter, label: "X", color: "text-violet-700" },
  twitter: { icon: Twitter, label: "X", color: "text-violet-700" },
  tiktok: { icon: Music, label: "TikTok", color: "text-foreground" },
};

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  pending: { label: "Geplant", cls: "border-border" },
  rescheduled: { label: "Neu geplant", cls: "border-primary/40 text-primary" },
  completed: { label: "Veröffentlicht", cls: "border-success/40 text-success" },
  missed: { label: "Verpasst", cls: "border-destructive/40 text-destructive" },
  dismissed: { label: "Verworfen", cls: "border-muted-foreground/30 text-muted-foreground" },
};

export function PlatformRingDialog({ open, onOpenChange, post }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    dismiss,
    update,
    submitToCalendar,
    isUpdating,
    isSubmittingToCalendar,
    posts: weekPosts,
    visibleWeekStart,
    experienceLevel,
  } = useStrategyMode();

  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [mediaUrl, setMediaUrl] = useState<string | undefined>();
  const [mediaType, setMediaType] = useState<"image" | "video" | undefined>();
  const [autoPublish, setAutoPublish] = useState(true);

  // Lightweight engagement context for Strategie-Tab
  const insightsQuery = useQuery({
    queryKey: ["strategy-insights", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const since = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString();
      const [{ data: metrics }, publishedRes] = await Promise.all([
        supabase.from("post_metrics").select("engagement_rate").eq("user_id", user.id).gte("posted_at", since),
        supabase.from("calendar_events").select("id", { count: "exact", head: true }).eq("created_by", user.id).eq("status", "published").gte("published_at", since),
      ]);
      const er = (metrics || []).map((m: any) => m.engagement_rate || 0).filter((v: number) => v > 0);
      const avgEr = er.length > 0 ? er.reduce((a, b) => a + b, 0) / er.length : 0;
      return { avgEr, postsPublished: publishedRes.count ?? 0 };
    },
    enabled: !!user && open,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (!post) return;
    setCaption(post.caption_draft || "");
    setHashtags((post.hashtags || []).join(" "));
    const d = new Date(post.scheduled_at);
    setScheduledDate(format(d, "yyyy-MM-dd"));
    setScheduledTime(format(d, "HH:mm"));
    const firstMedia = (post as any).media_urls?.[0];
    setMediaUrl(firstMedia);
    setMediaType(firstMedia?.match(/\.(mp4|mov|webm)/i) ? "video" : firstMedia ? "image" : undefined);
    setAutoPublish((post as any).auto_publish ?? true);
  }, [post]);

  if (!post) return null;

  const meta = platformMeta[post.platform.toLowerCase()] || platformMeta.instagram;
  const Icon = meta.icon;
  const status = STATUS_LABEL[post.status] || STATUS_LABEL.pending;
  const dateLabel = format(new Date(post.scheduled_at), "EEEE, d. MMM 'um' HH:mm");

  const tagsArr = hashtags.split(/[\s,]+/).map((h) => h.replace(/^#/, "")).filter(Boolean);

  const buildScheduledIso = () => new Date(`${scheduledDate}T${scheduledTime}:00`).toISOString();

  const handleSave = () => {
    update({
      id: post.id,
      patch: {
        caption_draft: caption,
        hashtags: tagsArr,
        scheduled_at: buildScheduledIso(),
        media_urls: mediaUrl ? [mediaUrl] : [],
        auto_publish: autoPublish,
      },
    });
  };

  const handleSubmitToCalendar = () => {
    submitToCalendar({
      post,
      overrides: {
        caption_draft: caption,
        hashtags: tagsArr,
        scheduled_at: buildScheduledIso(),
        media_urls: mediaUrl ? [mediaUrl] : [],
        auto_publish: autoPublish,
      },
    });
    onOpenChange(false);
  };

  const handleAIGenerate = () => {
    toast.info("Öffne KI Post Generator…");
    navigate("/ai-post-generator", { state: { prefill: { topic: post.content_idea, platform: post.platform } } });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className={cn("inline-flex h-9 w-9 items-center justify-center rounded-full bg-muted", meta.color)}>
              <Icon className="h-5 w-5" />
            </span>
            <span>{meta.label}</span>
            <Badge variant="outline" className={cn("ml-2 text-[10px]", status.cls)}>
              {status.label}
            </Badge>
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5" /> {dateLabel}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="preview" className="w-full">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="preview" className="gap-1.5">
              <Eye className="h-3.5 w-3.5" /> Vorschau
            </TabsTrigger>
            <TabsTrigger value="strategy" className="gap-1.5">
              <Compass className="h-3.5 w-3.5" /> Strategie
            </TabsTrigger>
            <TabsTrigger value="schedule" className="gap-1.5">
              <CalendarIcon className="h-3.5 w-3.5" /> Zeitplan
            </TabsTrigger>
          </TabsList>

          {/* Vorschau-Tab — fertiges Post-Mockup mit Editor */}
          <TabsContent value="preview" className="mt-3 space-y-4">
            <PostPreviewMockup
              platform={post.platform}
              caption={caption}
              hashtags={tagsArr}
              mediaUrl={mediaUrl}
              mediaType={mediaType}
            />

            <div className="space-y-3 pt-2 border-t border-border/40">
              <div>
                <Label className="text-xs mb-1.5 block">Medien (Bild oder Video)</Label>
                <PostMediaUploader
                  mediaUrl={mediaUrl}
                  mediaType={mediaType}
                  onMediaChange={(url, type) => {
                    setMediaUrl(url);
                    setMediaType(type);
                  }}
                />
                <div className="flex gap-2 mt-2">
                  <Button variant="outline" size="sm" className="flex-1 text-[11px] h-8" onClick={() => navigate("/picture-studio")}>
                    <Sparkles className="h-3 w-3 mr-1" /> Bild mit KI
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1 text-[11px] h-8" onClick={() => navigate("/ai-video-studio")}>
                    <Sparkles className="h-3 w-3 mr-1" /> Video mit KI
                  </Button>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label htmlFor="caption" className="text-xs">Caption</Label>
                  <Button variant="ghost" size="sm" className="h-6 text-[11px]" onClick={handleAIGenerate}>
                    <Wand2 className="h-3 w-3 mr-1" /> Mit KI verbessern
                  </Button>
                </div>
                <Textarea
                  id="caption"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  rows={5}
                  placeholder="Schreibe deinen Post …"
                  className="resize-none"
                />
              </div>

              <div>
                <Label htmlFor="hashtags" className="text-xs">Hashtags</Label>
                <Input
                  id="hashtags"
                  value={hashtags}
                  onChange={(e) => setHashtags(e.target.value)}
                  placeholder="#brand #content #ki"
                />
              </div>
            </div>
          </TabsContent>

          {/* Strategie-Tab — Position, Idee, Tipps, Insights */}
          <TabsContent value="strategy" className="mt-3">
            <StrategyContextPanel
              post={post}
              weekPosts={weekPosts}
              experienceLevel={experienceLevel}
              avgEngagementRate={insightsQuery.data?.avgEr}
              postsPublished={insightsQuery.data?.postsPublished}
              weekStart={visibleWeekStart}
            />
          </TabsContent>

          {/* Zeitplan-Tab */}
          <TabsContent value="schedule" className="space-y-3 mt-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="date" className="text-xs">Datum</Label>
                <Input id="date" type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="time" className="text-xs">Uhrzeit</Label>
                <Input id="time" type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} />
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-md border border-border/50 bg-card/40">
              <div>
                <div className="text-sm font-medium">Automatisch posten</div>
                <div className="text-[11px] text-muted-foreground">
                  Wird zur geplanten Zeit automatisch auf {meta.label} veröffentlicht.
                </div>
              </div>
              <Switch checked={autoPublish} onCheckedChange={setAutoPublish} />
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { dismiss(post.id); onOpenChange(false); }}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-1" /> Verwerfen
          </Button>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={handleSave} disabled={isUpdating}>
            <Save className="h-4 w-4 mr-1" /> Speichern
          </Button>
          <Button size="sm" onClick={handleSubmitToCalendar} disabled={isSubmittingToCalendar}>
            <CalendarPlus className="h-4 w-4 mr-1" />
            {autoPublish ? "Speichern & Auto-Publish" : "In Kalender übernehmen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
