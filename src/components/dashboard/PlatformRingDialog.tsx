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
import { useStrategyMode, type StrategyPost } from "@/hooks/useStrategyMode";
import { Instagram, Music, Linkedin, Facebook, Twitter, Youtube, Trash2, Save, CalendarPlus, Sparkles, Clock, Wand2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

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
  const { dismiss, reschedule, update, submitToCalendar, isUpdating, isSubmittingToCalendar } = useStrategyMode();

  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [mediaUrl, setMediaUrl] = useState<string | undefined>();
  const [mediaType, setMediaType] = useState<"image" | "video" | undefined>();
  const [autoPublish, setAutoPublish] = useState(true);

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

  const buildScheduledIso = () => {
    const iso = new Date(`${scheduledDate}T${scheduledTime}:00`);
    return iso.toISOString();
  };

  const handleSave = () => {
    const newIso = buildScheduledIso();
    const tags = hashtags.split(/[\s,]+/).map((h) => h.replace(/^#/, "")).filter(Boolean);
    update({
      id: post.id,
      patch: {
        caption_draft: caption,
        hashtags: tags,
        scheduled_at: newIso,
        media_urls: mediaUrl ? [mediaUrl] : [],
        auto_publish: autoPublish,
      },
    });
  };

  const handleSubmitToCalendar = () => {
    const newIso = buildScheduledIso();
    const tags = hashtags.split(/[\s,]+/).map((h) => h.replace(/^#/, "")).filter(Boolean);
    submitToCalendar({
      post,
      overrides: {
        caption_draft: caption,
        hashtags: tags,
        scheduled_at: newIso,
        media_urls: mediaUrl ? [mediaUrl] : [],
        auto_publish: autoPublish,
      },
    });
    onOpenChange(false);
  };

  const handleAIGenerate = () => {
    toast.info("KI-Caption wird in Kürze ergänzt – nutze vorerst den AI Post Generator.");
    navigate("/ai-post-generator", { state: { prefill: { topic: post.content_idea, platform: post.platform } } });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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

        <Tabs defaultValue="content" className="w-full">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="content">Inhalt</TabsTrigger>
            <TabsTrigger value="media">Medien</TabsTrigger>
            <TabsTrigger value="schedule">Zeitplan</TabsTrigger>
          </TabsList>

          {/* Content tab */}
          <TabsContent value="content" className="space-y-3 mt-3">
            <div>
              <Label className="text-xs">Idee</Label>
              <p className="text-sm mt-1 p-2 rounded-md bg-muted/40 border border-border/40">
                {post.content_idea}
              </p>
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
                rows={6}
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
            {post.reasoning && (
              <div className="p-2 rounded-md bg-primary/5 border border-primary/20">
                <p className="text-xs text-muted-foreground italic">💡 {post.reasoning}</p>
              </div>
            )}
          </TabsContent>

          {/* Media tab */}
          <TabsContent value="media" className="space-y-3 mt-3">
            <PostMediaUploader
              mediaUrl={mediaUrl}
              mediaType={mediaType}
              onMediaChange={(url, type) => {
                setMediaUrl(url);
                setMediaType(type);
              }}
            />
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => navigate("/picture-studio")}>
                <Sparkles className="h-3.5 w-3.5 mr-1" /> Bild mit KI generieren
              </Button>
              <Button variant="outline" size="sm" className="flex-1" onClick={() => navigate("/ai-video-studio")}>
                <Sparkles className="h-3.5 w-3.5 mr-1" /> Video mit KI generieren
              </Button>
            </div>
          </TabsContent>

          {/* Schedule tab */}
          <TabsContent value="schedule" className="space-y-3 mt-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="date" className="text-xs">Datum</Label>
                <Input
                  id="date"
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="time" className="text-xs">Uhrzeit</Label>
                <Input
                  id="time"
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                />
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
