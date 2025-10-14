import { useState, useEffect } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { useEventEmitter } from "@/hooks/useEventEmitter";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Trash2, Sparkles } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface AddPostModalProps {
  open: boolean;
  onClose: () => void;
  onSave: () => void;
  editingPost?: any;
  prefillCaption?: string;
  prefillPlatform?: string;
  prefillDate?: Date;
  prefillTime?: string;
  suggestedTime?: string;
}

const platforms = ["Instagram", "TikTok", "LinkedIn", "Facebook", "X"];
const statuses = ["draft", "scheduled", "posted"];

const PLATFORM_LIMITS = {
  Instagram: 2200,
  TikTok: 2200,
  LinkedIn: 3000,
  Facebook: 63206,
  X: 280,
};

export function AddPostModal({ 
  open, 
  onClose, 
  onSave, 
  editingPost, 
  prefillCaption,
  prefillPlatform,
  prefillDate,
  prefillTime,
  suggestedTime,
}: AddPostModalProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { emit } = useEventEmitter();
  const [platform, setPlatform] = useState("Instagram");
  const [caption, setCaption] = useState("");
  const [status, setStatus] = useState<"draft" | "scheduled" | "posted">("draft");
  const [scheduledDate, setScheduledDate] = useState<Date | undefined>(new Date());
  const [scheduledTime, setScheduledTime] = useState("12:00");
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editingPost) {
      setPlatform(editingPost.platform);
      setCaption(editingPost.caption || "");
      setStatus(editingPost.status);
      if (editingPost.scheduled_at) {
        const date = new Date(editingPost.scheduled_at);
        setScheduledDate(date);
        setScheduledTime(format(date, "HH:mm"));
      }
      setTags(editingPost.tags?.join(", ") || "");
    } else {
      // Prefill from props
      if (prefillCaption) setCaption(prefillCaption);
      if (prefillPlatform) setPlatform(prefillPlatform);
      if (prefillDate) setScheduledDate(prefillDate);
      if (prefillTime) setScheduledTime(prefillTime);
      else if (suggestedTime) setScheduledTime(suggestedTime);
    }
  }, [editingPost, prefillCaption, prefillPlatform, prefillDate, prefillTime, suggestedTime, open]);

  const resetForm = () => {
    setPlatform("Instagram");
    setCaption("");
    setStatus("draft");
    setScheduledDate(new Date());
    setScheduledTime("12:00");
    setTags("");
  };

  const handleSave = async () => {
    if (!caption.trim()) {
      toast.error(t("calendar.addPost.captionRequired"));
      return;
    }

    // Validate caption length for platform
    const limit = PLATFORM_LIMITS[platform as keyof typeof PLATFORM_LIMITS];
    if (caption.length > limit) {
      toast.error(t("calendar.addPost.captionTooLong", { limit, platform }));
      return;
    }

    setSaving(true);

    const scheduledDateTime = scheduledDate
      ? new Date(format(scheduledDate, "yyyy-MM-dd") + "T" + scheduledTime)
      : null;

    const postData = {
      user_id: user?.id,
      platform,
      caption,
      status,
      scheduled_at: scheduledDateTime?.toISOString(),
      tags: tags ? tags.split(",").map(t => t.trim()) : [],
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };

    const { error } = editingPost
      ? await supabase.from("posts").update(postData).eq("id", editingPost.id)
      : await supabase.from("posts").insert([postData]);

    setSaving(false);

    if (error) {
      toast.error(t("calendar.addPost.saveFailed"));
      console.error(error);
    } else {
      // Emit event for scheduled posts
      if (status === 'scheduled' && scheduledDateTime) {
        await emit({
          event_type: 'calendar.post.scheduled',
          source: 'calendar_modal',
          payload: {
            platform,
            scheduled_at: scheduledDateTime.toISOString(),
            from_generator: !!prefillCaption,
          },
        }, { silent: true });
      }
      
      toast.success(editingPost ? t("calendar.addPost.postUpdated") : t("calendar.addPost.postCreated"));
      resetForm();
      onSave();
      onClose();
    }
  };

  const handleDelete = async () => {
    if (!editingPost) return;

    const { error } = await supabase.from("posts").delete().eq("id", editingPost.id);

    if (error) {
      toast.error(t("calendar.addPost.deleteFailed"));
      console.error(error);
    } else {
      toast.success(t("calendar.addPost.postDeleted"));
      onSave();
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editingPost ? t("calendar.addPost.editPost") : t("calendar.addPost.title")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>{t("calendar.addPost.platform")}</Label>
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {platforms.map(p => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <Label>{t("calendar.addPost.caption")}</Label>
              <span className={`text-xs ${
                caption.length > PLATFORM_LIMITS[platform as keyof typeof PLATFORM_LIMITS] 
                  ? 'text-destructive font-semibold' 
                  : 'text-muted-foreground'
              }`}>
                {caption.length} / {PLATFORM_LIMITS[platform as keyof typeof PLATFORM_LIMITS]}
              </span>
            </div>
            <Textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={6}
              placeholder={t("calendar.addPost.captionPlaceholder")}
              className={caption.length > PLATFORM_LIMITS[platform as keyof typeof PLATFORM_LIMITS] ? 'border-destructive' : ''}
            />
          </div>

          <div>
            <Label>{t("calendar.addPost.status")}</Label>
            <Select value={status} onValueChange={(val: any) => setStatus(val)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statuses.map(s => (
                  <SelectItem key={s} value={s}>
                    {t(`calendar.addPost.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{t("calendar.addPost.scheduleDate")}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !scheduledDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {scheduledDate ? format(scheduledDate, "PPP") : t("calendar.addPost.pickDate")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={scheduledDate}
                    onSelect={setScheduledDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <Label>{t("calendar.addPost.time")}</Label>
              <Input
                type="time"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
              />
              {suggestedTime && (
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />
                  {t("calendar.addPost.suggestedTime")} {platform}
                </p>
              )}
            </div>
          </div>

          <div>
            <Label>{t("calendar.addPost.tags")}</Label>
            <Input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder={t("calendar.addPost.tagsPlaceholder")}
            />
          </div>

          <div className="flex gap-2 justify-between">
            <div>
              {editingPost && (
                <Button onClick={handleDelete} variant="destructive" size="sm">
                  <Trash2 className="w-4 h-4 mr-2" />
                  {t("calendar.addPost.delete")}
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button onClick={onClose} variant="outline" disabled={saving}>
                {t("calendar.addPost.cancel")}
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? t("calendar.addPost.saving") : t("calendar.addPost.save")}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
