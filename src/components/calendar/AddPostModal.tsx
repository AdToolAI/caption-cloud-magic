import { useState, useEffect } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
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
import { CalendarIcon, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface AddPostModalProps {
  open: boolean;
  onClose: () => void;
  onSave: () => void;
  editingPost?: any;
  prefillCaption?: string;
}

const platforms = ["Instagram", "TikTok", "LinkedIn", "Facebook", "X"];
const statuses = ["draft", "scheduled", "posted"];

export function AddPostModal({ open, onClose, onSave, editingPost, prefillCaption }: AddPostModalProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
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
    } else if (prefillCaption) {
      setCaption(prefillCaption);
    }
  }, [editingPost, prefillCaption, open]);

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
      toast.error("Caption is required");
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
      toast.error("Failed to save post");
      console.error(error);
    } else {
      toast.success(editingPost ? "Post updated" : "Post created");
      resetForm();
      onSave();
      onClose();
    }
  };

  const handleDelete = async () => {
    if (!editingPost) return;

    const { error } = await supabase.from("posts").delete().eq("id", editingPost.id);

    if (error) {
      toast.error("Failed to delete post");
      console.error(error);
    } else {
      toast.success("Post deleted");
      onSave();
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editingPost ? "Edit Post" : t("calendar_add_post")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>{t("calendar_platform")}</Label>
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
            <Label>{t("calendar_caption")}</Label>
            <Textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={6}
              placeholder="Write your caption here..."
            />
          </div>

          <div>
            <Label>{t("calendar_status")}</Label>
            <Select value={status} onValueChange={(val: any) => setStatus(val)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statuses.map(s => (
                  <SelectItem key={s} value={s}>
                    {t(`calendar_${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{t("calendar_schedule_date")}</Label>
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
                    {scheduledDate ? format(scheduledDate, "PPP") : "Pick a date"}
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
              <Label>Time</Label>
              <Input
                type="time"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label>{t("calendar_tags")}</Label>
            <Input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="#marketing, #socialmedia"
            />
          </div>

          <div className="flex gap-2 justify-between">
            <div>
              {editingPost && (
                <Button onClick={handleDelete} variant="destructive" size="sm">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button onClick={onClose} variant="outline" disabled={saving}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
