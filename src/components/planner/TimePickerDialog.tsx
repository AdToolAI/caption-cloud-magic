import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";

interface TimePickerDialogProps {
  open: boolean;
  date: Date | null;
  content: any;
  onConfirm: (hour: number, minute: number) => void;
  onCancel: () => void;
}

export function TimePickerDialog({
  open,
  date,
  content,
  onConfirm,
  onCancel,
}: TimePickerDialogProps) {
  const [hour, setHour] = useState(10);
  const [minute, setMinute] = useState(0);

  useEffect(() => {
    if (open) {
      // Reset to default time
      setHour(10);
      setMinute(0);
    }
  }, [open]);

  if (!date || !content) return null;

  const minutes = [0, 15, 30, 45];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Posting-Zeit festlegen</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Content Preview */}
          <div className="flex items-start gap-3 p-3 bg-muted rounded-lg">
            {content.thumb_url && (
              <div className="w-16 h-16 rounded overflow-hidden flex-shrink-0">
                <img
                  src={content.thumb_url}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{content.title}</div>
              <div className="text-xs text-muted-foreground truncate mt-1">
                {content.caption?.substring(0, 80)}
                {content.caption?.length > 80 && "..."}
              </div>
            </div>
          </div>

          {/* Date Display */}
          <div>
            <Label className="text-xs text-muted-foreground">Datum</Label>
            <div className="text-lg font-semibold mt-1">
              {date.toLocaleDateString("de-DE", {
                weekday: "long",
                day: "2-digit",
                month: "long",
              })}
            </div>
          </div>

          {/* Hour Slider */}
          <div>
            <Label className="flex justify-between">
              <span>Stunde</span>
              <span className="font-mono text-lg">{hour.toString().padStart(2, "0")}:00</span>
            </Label>
            <Slider
              value={[hour]}
              onValueChange={([val]) => setHour(val)}
              min={6}
              max={22}
              step={1}
              className="mt-3"
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>06:00</span>
              <span>14:00</span>
              <span>22:00</span>
            </div>
          </div>

          {/* Minute Selection */}
          <div>
            <Label>Minute</Label>
            <div className="flex gap-2 mt-2">
              {minutes.map((m) => (
                <Badge
                  key={m}
                  variant={minute === m ? "default" : "outline"}
                  className="cursor-pointer px-4 py-2 text-sm"
                  onClick={() => setMinute(m)}
                >
                  :{m.toString().padStart(2, "0")}
                </Badge>
              ))}
            </div>
          </div>

          {/* Final Time Display */}
          <div className="p-4 bg-primary/5 rounded-lg border-2 border-primary/20">
            <div className="text-xs text-muted-foreground mb-1">Posting-Zeit</div>
            <div className="text-2xl font-bold font-mono">
              {hour.toString().padStart(2, "0")}:{minute.toString().padStart(2, "0")} Uhr
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Abbrechen
          </Button>
          <Button onClick={() => onConfirm(hour, minute)}>
            Planen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
