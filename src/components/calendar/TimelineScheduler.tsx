import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { Clock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface TimelineSlot {
  time_start: string;
  time_end: string;
  score: number;
  reason: string;
  is_blocked: boolean;
  estimated_reach_boost: number;
}

interface TimelineDay {
  date: string;
  day_name: string;
  day_of_week: number;
  slots: TimelineSlot[];
}

interface TimelineSchedulerProps {
  workspaceId: string;
  brandKitId?: string;
  eventId: string;
  defaultPlatform?: string;
  onScheduled?: () => void;
  onClose: () => void;
}

const platformColors: Record<string, string> = {
  youtube: "bg-red-500/20 border-red-500 hover:bg-red-500/30",
  instagram: "bg-purple-500/20 border-purple-500 hover:bg-purple-500/30",
  tiktok: "bg-pink-500/20 border-pink-500 hover:bg-pink-500/30",
  linkedin: "bg-blue-500/20 border-blue-500 hover:bg-blue-500/30",
  facebook: "bg-blue-600/20 border-blue-600 hover:bg-blue-600/30",
  twitter: "bg-sky-500/20 border-sky-500 hover:bg-sky-500/30",
};

export function TimelineScheduler({
  workspaceId,
  brandKitId,
  eventId,
  defaultPlatform = "youtube",
  onScheduled,
  onClose
}: TimelineSchedulerProps) {
  const [platform, setPlatform] = useState(defaultPlatform);
  const [weeks, setWeeks] = useState<"1" | "2">("2");
  const [timeline, setTimeline] = useState<TimelineDay[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<{ date: string; slot: TimelineSlot } | null>(null);
  const [scheduling, setScheduling] = useState(false);

  useEffect(() => {
    loadEventAndTimeline();
  }, [eventId, weeks, workspaceId, brandKitId]);

  const loadEventAndTimeline = async () => {
    setLoading(true);
    try {
      // 1. Event-Daten laden
      const { data: event, error: eventError } = await supabase
        .from('calendar_events')
        .select('id, title, channels')
        .eq('id', eventId)
        .single();
      
      if (eventError) {
        console.error('[Timeline] Event error:', eventError);
        throw new Error('Event nicht gefunden');
      }

      // 2. Platform aus Event extrahieren
      const eventPlatform = event?.channels?.[0] || 'youtube';
      setPlatform(eventPlatform);
      
      console.log('[Timeline] Loading for event:', event.title, 'Platform:', eventPlatform);

      // 3. Timeline laden
      const startDate = new Date().toISOString().split('T')[0];
      
      const { data, error } = await supabase.functions.invoke('calendar-timeline-slots', {
        body: {
          workspace_id: workspaceId,
          brand_kit_id: brandKitId,
          platform: eventPlatform,
          start_date: startDate,
          weeks: parseInt(weeks)
        }
      });

      if (error) {
        console.error('[Timeline] API error:', error);
        throw error;
      }

      console.log('[Timeline] Loaded timeline with', data?.timeline?.length, 'days');
      setTimeline(data.timeline || []);
      
      if (!data.timeline || data.timeline.length === 0) {
        toast.info('Keine optimalen Zeiten gefunden. Versuche eine andere Plattform.');
      }
    } catch (error: any) {
      console.error('[Timeline] Error loading timeline:', error);
      toast.error(error.message || 'Fehler beim Laden der Timeline');
    } finally {
      setLoading(false);
    }
  };

  const handleSlotSelect = (date: string, slot: TimelineSlot) => {
    if (slot.is_blocked) {
      toast.error('Dieser Zeitslot ist blockiert');
      return;
    }
    setSelectedSlot({ date, slot });
  };

  const confirmSchedule = async () => {
    if (!selectedSlot) return;

    setScheduling(true);
    try {
      const scheduledTime = `${selectedSlot.date}T${selectedSlot.slot.time_start}:00+00:00`;

      const { error } = await supabase
        .from('calendar_events')
        .update({
          start_at: scheduledTime,
          status: 'scheduled'
        })
        .eq('id', eventId);

      if (error) throw error;

      const dayName = timeline.find(d => d.date === selectedSlot.date)?.day_name;
      toast.success(`Event geplant für ${dayName}, ${selectedSlot.date} um ${selectedSlot.slot.time_start} Uhr`);
      
      onScheduled?.();
      onClose();
    } catch (error) {
      console.error('Error scheduling:', error);
      toast.error('Fehler beim Planen des Events');
    } finally {
      setScheduling(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 140) return "ring-2 ring-green-500 bg-green-500/10";
    if (score >= 120) return "ring-2 ring-blue-500 bg-blue-500/10";
    if (score >= 100) return "ring-2 ring-yellow-500 bg-yellow-500/10";
    return "ring-1 ring-border";
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <Select value={platform} onValueChange={setPlatform}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Plattform wählen" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="youtube">YouTube</SelectItem>
            <SelectItem value="instagram">Instagram</SelectItem>
            <SelectItem value="tiktok">TikTok</SelectItem>
            <SelectItem value="linkedin">LinkedIn</SelectItem>
            <SelectItem value="facebook">Facebook</SelectItem>
            <SelectItem value="twitter">Twitter</SelectItem>
          </SelectContent>
        </Select>

        <ToggleGroup type="single" value={weeks} onValueChange={(v) => v && setWeeks(v as "1" | "2")}>
          <ToggleGroupItem value="1">1 Woche</ToggleGroupItem>
          <ToggleGroupItem value="2">2 Wochen</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Selected Slot Preview */}
      {selectedSlot && (
        <div className="p-4 border rounded-lg bg-primary/5 space-y-2">
          <p className="font-semibold text-sm">Ausgewählter Zeitslot:</p>
          <p className="text-sm">
            {timeline.find(d => d.date === selectedSlot.date)?.day_name}, {selectedSlot.date} um {selectedSlot.slot.time_start} Uhr
          </p>
          <p className="text-xs text-muted-foreground">{selectedSlot.slot.reason}</p>
          <div className="flex gap-2">
            <Button onClick={confirmSchedule} disabled={scheduling} size="sm">
              {scheduling ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Jetzt planen
            </Button>
            <Button onClick={() => setSelectedSlot(null)} variant="outline" size="sm">
              Abbrechen
            </Button>
          </div>
        </div>
      )}

      {/* Timeline */}
      {loading ? (
        <div className="flex items-center justify-center h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <ScrollArea className="h-[500px] border rounded-lg p-4">
          <div className="space-y-3">
            {timeline.map((day) => (
              <div key={day.date} className="grid grid-cols-[140px_1fr] gap-4 pb-3 border-b last:border-0">
                {/* Day Label */}
                <div className="space-y-1">
                  <p className="font-semibold text-sm">{day.day_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(day.date).toLocaleDateString('de-DE', { 
                      day: '2-digit', 
                      month: 'short' 
                    })}
                  </p>
                </div>

                {/* Time Slots */}
                <div className="flex gap-2 flex-wrap items-start">
                  {day.slots.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Keine optimalen Zeiten</p>
                  ) : (
                    day.slots.map((slot, idx) => (
                      <TooltipProvider key={idx}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={slot.is_blocked}
                              className={cn(
                                "h-auto px-3 py-2 transition-all",
                                platformColors[platform],
                                getScoreColor(slot.score),
                                selectedSlot?.date === day.date && 
                                selectedSlot?.slot.time_start === slot.time_start &&
                                "ring-2 ring-primary scale-105",
                                slot.is_blocked && "opacity-40 cursor-not-allowed"
                              )}
                              onClick={() => handleSlotSelect(day.date, slot)}
                            >
                              <Clock className="w-3 h-3 mr-1.5" />
                              <span className="text-xs font-medium">{slot.time_start}</span>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[280px]">
                            <div className="space-y-1.5">
                              <p className="font-semibold text-sm">
                                {slot.time_start} - {slot.time_end}
                              </p>
                              <p className="text-xs leading-relaxed">{slot.reason}</p>
                              {!slot.is_blocked && (
                                <p className="text-xs text-green-600 font-medium">
                                  Geschätzte Reichweitensteigerung: +{slot.estimated_reach_boost}%
                                </p>
                              )}
                              <p className="text-xs text-muted-foreground">
                                Score: {slot.score}%
                              </p>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
