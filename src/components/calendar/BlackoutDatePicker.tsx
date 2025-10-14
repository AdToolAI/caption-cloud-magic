import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Ban } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

interface BlackoutDatePickerProps {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  brandKitId?: string;
  clientId?: string;
  onSaved?: () => void;
}

export function BlackoutDatePicker({
  open,
  onClose,
  workspaceId,
  brandKitId,
  clientId,
  onSaved
}: BlackoutDatePickerProps) {
  const { t } = useTranslation();
  const [date, setDate] = useState<Date>();
  const [allDay, setAllDay] = useState(true);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [reason, setReason] = useState("holiday");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!date) {
      toast.error("Please select a date");
      return;
    }

    if (!note.trim()) {
      toast.error("Please add a note");
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase
        .from("calendar_blackout_dates")
        .insert({
          workspace_id: workspaceId,
          brand_kit_id: brandKitId,
          client_id: clientId,
          date: date.toISOString().split('T')[0],
          all_day: allDay,
          start_time: allDay ? null : startTime,
          end_time: allDay ? null : endTime,
          reason,
          note
        });

      if (error) throw error;

      toast.success("Blackout date added");
      onSaved?.();
      handleClose();
    } catch (error: any) {
      console.error("Failed to create blackout date:", error);
      toast.error(error.message || "Failed to create blackout date");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setDate(undefined);
    setAllDay(true);
    setStartTime("09:00");
    setEndTime("17:00");
    setReason("holiday");
    setNote("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban className="w-5 h-5" />
            Add Blackout Date
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Select Date</Label>
            <Calendar
              mode="single"
              selected={date}
              onSelect={setDate}
              className="rounded-md border"
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="all-day">All Day</Label>
            <Switch
              id="all-day"
              checked={allDay}
              onCheckedChange={setAllDay}
            />
          </div>

          {!allDay && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start-time">Start Time</Label>
                <Input
                  id="start-time"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end-time">End Time</Label>
                <Input
                  id="end-time"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="reason">Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger id="reason">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="holiday">Holiday</SelectItem>
                <SelectItem value="maintenance">Maintenance</SelectItem>
                <SelectItem value="event">Event</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="note">Note *</Label>
            <Textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why is this date blocked? (e.g., Christmas Day, System Maintenance)"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? "Saving..." : "Add Blackout Date"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
