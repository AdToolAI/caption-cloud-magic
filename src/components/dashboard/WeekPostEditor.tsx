import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PostMediaUploader } from "@/components/calendar/PostMediaUploader";
import { PlatformBadge } from "@/components/ui/PlatformBadge";
import { Loader2, Sparkles, Save, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { createEvent, updateEvent } from "@/data/calendar";
import type { WeekPost } from "./WeekDayCard";

interface WeekPostEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  post: WeekPost | null;
  date: string;
  workspaceId: string;
  onSaved: () => void;
}

export function WeekPostEditor({ open, onOpenChange, post, date, workspaceId, onSaved }: WeekPostEditorProps) {
  const { user } = useAuth();
  const [caption, setCaption] = useState(post?.caption || post?.contentIdea || "");
  const [hashtags, setHashtags] = useState(post?.hashtags?.join(", ") || "");
  const [time, setTime] = useState(post?.suggestedTime || "12:00");
  const [mediaUrl, setMediaUrl] = useState<string | undefined>(post?.mediaUrl);
  const [mediaType, setMediaType] = useState<"image" | "video" | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [optimizing, setOptimizing] = useState(false);

  // Reset form when post changes
  useState(() => {
    if (post) {
      setCaption(post.caption || post.contentIdea || "");
      setHashtags(post.hashtags?.join(", ") || "");
      setTime(post.suggestedTime || "12:00");
      setMediaUrl(post.mediaUrl);
    }
  });

  const handleMediaChange = useCallback((url: string | undefined, type: "image" | "video" | undefined) => {
    setMediaUrl(url);
    setMediaType(type);
  }, []);

  const handleOptimize = async () => {
    if (!caption.trim()) return;
    setOptimizing(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-post-caption", {
        body: {
          description: caption,
          platform: post?.platform || "instagram",
          language: "de",
          tone: "professional",
        },
      });
      if (error) throw error;
      if (data?.caption) {
        setCaption(data.caption);
        if (data.hashtags) {
          setHashtags(Array.isArray(data.hashtags) ? data.hashtags.join(", ") : data.hashtags);
        }
        toast.success("Text optimiert!");
      }
    } catch (err) {
      console.error("Optimize error:", err);
      toast.error("Optimierung fehlgeschlagen");
    } finally {
      setOptimizing(false);
    }
  };

  const handleSave = async () => {
    if (!user || !workspaceId) return;
    setSaving(true);
    try {
      const hashtagArray = hashtags
        .split(",")
        .map((h) => h.trim().replace(/^#/, ""))
        .filter(Boolean);

      const dateStr = date.split("T")[0];
      const datetimeLocalISO = `${dateStr}T${time}:00`;

      const mediaAssets = mediaUrl ? [{ url: mediaUrl, type: mediaType || "image" }] : [];

      if (post?.sourceType === "calendar_event") {
        // Update existing calendar event
        await updateEvent(post.sourceId, {
          caption,
          hashtags: hashtagArray,
          datetimeLocalISO,
          assets_json: mediaAssets,
          status: "scheduled",
        });
        toast.success("Post aktualisiert!");
      } else {
        // Create new calendar event from starter plan suggestion
        await createEvent({
          workspaceId,
          caption,
          channels: [post?.platform || "instagram"],
          datetimeLocalISO,
          hashtags: hashtagArray,
          media: mediaAssets,
        });

        // Mark starter plan as used if applicable
        if (post?.sourceType === "starter_plan" && post?.sourceId) {
          await supabase
            .from("starter_week_plans")
            .update({ status: "scheduled" })
            .eq("id", post.sourceId);
        }
        toast.success("Post erstellt und geplant!");
      }

      onSaved();
      onOpenChange(false);
    } catch (err) {
      console.error("Save error:", err);
      toast.error("Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Post bearbeiten
            {post && <PlatformBadge platform={post.platform} />}
          </DialogTitle>
          <DialogDescription>
            Bearbeite Caption, Hashtags und lade Medien hoch.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Time */}
          <div>
            <Label className="text-xs font-medium">Uhrzeit</Label>
            <div className="flex items-center gap-2 mt-1">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <Input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-32"
              />
            </div>
          </div>

          {/* Caption */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs font-medium">Caption</Label>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-primary"
                onClick={handleOptimize}
                disabled={optimizing || !caption.trim()}
              >
                {optimizing ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3 mr-1" />
                )}
                KI optimieren
              </Button>
            </div>
            <Textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Was möchtest du posten?"
              rows={4}
              className="resize-none"
            />
          </div>

          {/* Hashtags */}
          <div>
            <Label className="text-xs font-medium">Hashtags (kommagetrennt)</Label>
            <Input
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
              placeholder="marketing, socialmedia, tipps"
              className="mt-1"
            />
          </div>

          {/* Media Upload */}
          <div>
            <Label className="text-xs font-medium mb-1 block">Bild / Video</Label>
            <PostMediaUploader
              mediaUrl={mediaUrl}
              mediaType={mediaType}
              onMediaChange={handleMediaChange}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={handleSave} disabled={saving || !caption.trim()}>
            {saving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Speichern & Planen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
