import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Sparkles, Clock, Calendar, TrendingUp } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

interface AutoScheduleDialogProps {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  brandKitId?: string;
  eventIds: string[];
  onScheduled?: () => void;
}

interface Suggestion {
  event_id: string;
  suggested_time: string;
  score: number;
  reason_key: string;
}

export function AutoScheduleDialog({
  open,
  onClose,
  workspaceId,
  brandKitId,
  eventIds,
  onScheduled
}: AutoScheduleDialogProps) {
  const { t } = useTranslation();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);

  const handleGenerate = async () => {
    if (eventIds.length === 0) {
      toast.error("No events selected");
      return;
    }

    setLoading(true);

    try {
      // Fetch events to schedule
      const { data: events, error: eventsError } = await supabase
        .from("calendar_events")
        .select("id, title, channels, brand_kit_id")
        .in("id", eventIds);

      if (eventsError) throw eventsError;

      // Call auto-schedule edge function
      const { data, error } = await supabase.functions.invoke("calendar-autoschedule", {
        body: {
          workspace_id: workspaceId,
          brand_kit_id: brandKitId,
          events: events?.map(e => ({
            event_id: e.id,
            channels: e.channels,
            brand_kit_id: e.brand_kit_id
          }))
        }
      });

      if (error) throw error;

      setSuggestions(data.suggestions || []);
      toast.success(t("calendar.api.success.SCHEDULE_APPLIED"));
    } catch (error: any) {
      console.error("Failed to generate schedule:", error);
      const errorCode = error.code || "INTERNAL_ERROR";
      toast.error(t(`calendar.api.errors.${errorCode}`));
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    setApplying(true);

    try {
      // Update all events with suggested times
      const updates = suggestions.map(suggestion => 
        supabase
          .from("calendar_events")
          .update({ 
            start_at: suggestion.suggested_time,
            status: "scheduled"
          })
          .eq("id", suggestion.event_id)
      );

      await Promise.all(updates);

      toast.success(t("calendar.api.success.SCHEDULE_APPLIED"));
      onScheduled?.();
      onClose();
    } catch (error: any) {
      console.error("Failed to apply schedule:", error);
      const errorCode = error.code || "INTERNAL_ERROR";
      toast.error(t(`calendar.api.errors.${errorCode}`));
    } finally {
      setApplying(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    return "text-orange-600";
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            AI Auto-Schedule
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            AI will analyze the best posting times based on your audience engagement,
            avoiding conflicts and blackout dates.
          </p>

          {suggestions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <Sparkles className="w-12 h-12 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {eventIds.length} event(s) selected
              </p>
              <Button onClick={handleGenerate} disabled={loading}>
                {loading ? "Generating..." : "Generate Schedule"}
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {suggestions.length} suggestions generated
                </span>
                <Button size="sm" variant="outline" onClick={handleGenerate} disabled={loading}>
                  Regenerate
                </Button>
              </div>

              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-3">
                  {suggestions.map((suggestion, index) => (
                    <div
                      key={index}
                      className="border rounded-lg p-4 space-y-2 hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-medium text-sm">
                            Event #{index + 1}
                          </p>
                          <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                            <Calendar className="w-4 h-4" />
                            <span>
                              {new Date(suggestion.suggested_time).toLocaleString()}
                            </span>
                          </div>
                        </div>
                        <Badge 
                          variant="outline" 
                          className={getScoreColor(suggestion.score)}
                        >
                          <TrendingUp className="w-3 h-3 mr-1" />
                          {suggestion.score}%
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        <Clock className="w-3 h-3 inline mr-1" />
                        {t(`calendar.api.timeQuality.${(suggestion as any).reason_key || 'GOOD_TIME'}`)}
                      </p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          {suggestions.length > 0 && (
            <Button onClick={handleApply} disabled={applying}>
              {applying ? "Applying..." : "Apply Schedule"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
