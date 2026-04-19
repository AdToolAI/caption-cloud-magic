import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarPlus, Trash2, Lightbulb, Clock } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import type { StrategyPost } from "@/hooks/useStrategyMode";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  post: StrategyPost | null;
  onDismiss: (id: string) => void;
  onAddToCalendar: (post: StrategyPost) => void;
}

export function StrategyPostDialog({ open, onOpenChange, post, onDismiss, onAddToCalendar }: Props) {
  if (!post) return null;

  const dateLabel = format(new Date(post.scheduled_at), "EEEE, d. MMM 'um' HH:mm", { locale: de });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-warning" />
            {post.content_idea}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5" /> {dateLabel}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="capitalize">{post.platform}</Badge>
            {post.status === "rescheduled" && <Badge variant="secondary">Neu geplant</Badge>}
          </div>

          {post.caption_draft && (
            <div className="p-3 rounded-lg bg-muted/50 border border-border/40 text-sm whitespace-pre-wrap">
              {post.caption_draft}
            </div>
          )}

          {post.hashtags && post.hashtags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {post.hashtags.slice(0, 10).map((h, i) => (
                <span key={i} className="text-xs text-primary">#{h.replace(/^#/, "")}</span>
              ))}
            </div>
          )}

          {post.reasoning && (
            <div className="p-2 rounded-md bg-primary/5 border border-primary/20">
              <p className="text-xs text-muted-foreground italic">💡 {post.reasoning}</p>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { onDismiss(post.id); onOpenChange(false); }}
          >
            <Trash2 className="h-4 w-4 mr-1" /> Verwerfen
          </Button>
          <Button
            size="sm"
            onClick={() => { onAddToCalendar(post); onOpenChange(false); }}
          >
            <CalendarPlus className="h-4 w-4 mr-1" /> In Kalender übernehmen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
