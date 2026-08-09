import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Trash2, CalendarClock, Send } from "lucide-react";
import { useState } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import type { StrategyPost } from "@/hooks/useStrategyMode";
import { tx } from "@/lib/i18nText";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  post: StrategyPost | null;
  onDismiss: (id: string) => void;
  onReschedule: (args: { id: string; newAt: string }) => void;
  onPostNow: (post: StrategyPost) => void;
}

export function MissedPostDialog({ open, onOpenChange, post, onDismiss, onReschedule, onPostNow }: Props) {
  const [newDateTime, setNewDateTime] = useState("");

  if (!post) return null;

  const originalDate = format(new Date(post.scheduled_at), "EEEE, d. MMM yyyy 'um' HH:mm", { locale: de });

  const handleReschedule = () => {
    if (!newDateTime) return;
    onReschedule({ id: post.id, newAt: new Date(newDateTime).toISOString() });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            {tx({ de: "Verpasster Post", en: "Missed post", es: "Publicación perdida" })}
          </DialogTitle>
          <DialogDescription>
            {tx({ de: `Geplant für ${originalDate}`, en: `Scheduled for ${originalDate}`, es: `Programado para ${originalDate}` })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="capitalize">{post.platform}</Badge>
            <span className="text-sm font-medium">{post.content_idea}</span>
          </div>

          {post.caption_draft && (
            <div className="p-3 rounded-lg bg-muted/50 border border-border/40 text-sm">
              {post.caption_draft}
            </div>
          )}

          {post.reasoning && (
            <p className="text-xs text-muted-foreground italic">💡 {post.reasoning}</p>
          )}

          <div className="space-y-2 pt-2">
            <label className="text-xs font-medium text-muted-foreground">{tx({ de: "Neu planen für:", en: "Reschedule for:", es: "Reprogramar para:" })}</label>
            <Input
              type="datetime-local"
              value={newDateTime}
              onChange={(e) => setNewDateTime(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { onDismiss(post.id); onOpenChange(false); }}
          >
            <Trash2 className="h-4 w-4 mr-1" /> {tx({ de: "Verwerfen", en: "Discard", es: "Descartar" })}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleReschedule}
            disabled={!newDateTime}
          >
            <CalendarClock className="h-4 w-4 mr-1" /> {tx({ de: "Neu planen", en: "Reschedule", es: "Reprogramar" })}
          </Button>
          <Button
            size="sm"
            onClick={() => { onPostNow(post); onOpenChange(false); }}
          >
            <Send className="h-4 w-4 mr-1" /> {tx({ de: "Jetzt posten", en: "Post now", es: "Publicar ahora" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
