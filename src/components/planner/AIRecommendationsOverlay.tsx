import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { format } from "date-fns";

interface AISlot {
  start: string;
  end: string;
  score: number;
  reason: string;
  blocked: boolean;
}

interface AIDay {
  date: string;
  name: string;
  slots: AISlot[];
}

interface AIRecommendationsOverlayProps {
  workspaceId: string;
  brandKitId: string | null;
  platform: string;
  startDate: string;
  weeks: number;
  visible: boolean;
  onToggle: () => void;
  onApplySlots: (timeline: AIDay[]) => void;
}

export function AIRecommendationsOverlay({
  workspaceId,
  brandKitId,
  platform,
  startDate,
  weeks,
  visible,
  onToggle,
  onApplySlots,
}: AIRecommendationsOverlayProps) {
  const [timeline, setTimeline] = useState<AIDay[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible && timeline.length === 0) {
      loadRecommendations();
    }
  }, [visible, platform, startDate, weeks]);

  const loadRecommendations = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("calendar-timeline-slots", {
        body: {
          workspace_id: workspaceId,
          brand_kit_id: brandKitId,
          platform,
          start_date: startDate,
          weeks,
        },
      });

      if (error) throw error;

      if (data?.timeline) {
        setTimeline(data.timeline);
      }
    } catch (error: any) {
      console.error("Error loading AI recommendations:", error);
      toast.error("Fehler beim Laden der AI-Empfehlungen");
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    const freeSlots = timeline
      .flatMap((day) =>
        day.slots.filter((slot) => !slot.blocked && slot.score >= 60)
      );

    if (freeSlots.length === 0) {
      toast.info("Keine freien AI-Slots verfügbar");
      return;
    }

    onApplySlots(timeline);
    toast.success(`${freeSlots.length} AI-Empfehlungen angewendet`);
  };

  if (!visible) {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={onToggle}
        className="fixed bottom-4 right-4 z-30 gap-2 shadow-lg"
      >
        <Sparkles className="h-4 w-4" />
        AI-Empfehlungen
      </Button>
    );
  }

  return (
    <>
      {/* Overlay Bands */}
      <div className="pointer-events-none absolute inset-0 z-10">
        {timeline.map((day) => {
          const dayDate = new Date(day.date);
          
          return day.slots
            .filter((slot) => !slot.blocked && slot.score >= 60)
            .map((slot, idx) => {
              const slotStart = new Date(slot.start);
              const slotEnd = new Date(slot.end);
              
              const top = getTimePosition(slotStart);
              const height = getTimeDuration(slotStart, slotEnd);
              const left = getDayPosition(dayDate, new Date(startDate), weeks);
              
              return (
                <TooltipProvider key={`${day.date}-${idx}`}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className="absolute pointer-events-auto bg-green-500/20 border-2 border-green-500 border-dashed rounded-md hover:bg-green-500/30 transition-colors"
                        style={{
                          top: `${top}rem`,
                          height: `${height}rem`,
                          left: `${left}%`,
                          width: `${100 / (weeks * 7)}%`,
                        }}
                      />
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="text-xs">
                        <div className="font-semibold">Optimale Zeit für {platform}</div>
                        <div className="text-muted-foreground">
                          {format(slotStart, "HH:mm")} - {format(slotEnd, "HH:mm")}
                        </div>
                        <div className="mt-1">Score: {slot.score}/100</div>
                        <div className="text-muted-foreground">{slot.reason}</div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            });
        })}
      </div>

      {/* Control Panel */}
      <div className="fixed bottom-4 right-4 z-30 bg-background border rounded-lg shadow-lg p-4 w-80">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-green-500" />
            <span className="font-semibold">AI-Empfehlungen</span>
          </div>
          <Button size="sm" variant="ghost" onClick={onToggle}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="text-sm text-muted-foreground mb-3">
              {timeline.flatMap((d) => d.slots.filter((s) => !s.blocked && s.score >= 60)).length}{" "}
              optimale Zeitslots für <Badge variant="secondary" className="ml-1">{platform}</Badge>
            </div>

            <Button onClick={handleApply} className="w-full gap-2">
              <Sparkles className="h-4 w-4" />
              Slots übernehmen
            </Button>

            <p className="text-xs text-muted-foreground mt-2">
              Grüne Bänder zeigen die besten Posting-Zeiten. Drag & Drop Posts dorthin für optimale Reichweite.
            </p>
          </>
        )}
      </div>
    </>
  );
}

// Helper functions
function getTimePosition(date: Date): number {
  const hours = date.getHours() - 8;
  const minutes = date.getMinutes();
  return hours * 2 + minutes / 30 + 3;
}

function getTimeDuration(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  return ms / 1000 / 60 / 30;
}

function getDayPosition(date: Date, startDate: Date, weeks: number): number {
  const daysDiff = Math.floor((date.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  return (daysDiff / (weeks * 7)) * 100;
}