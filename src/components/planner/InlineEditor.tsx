import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Check, X } from "lucide-react";
import { blockSchemaPartial, BlockFormData } from "@/lib/plannerValidation";
import { format } from "date-fns";

interface InlineEditorProps {
  block: any;
  onSave: (data: Partial<BlockFormData>) => void;
  onCancel: () => void;
}

export function InlineEditor({ block, onSave, onCancel }: InlineEditorProps) {
  const [title, setTitle] = useState(block.title_override || block.content_items?.title || "");
  const [startTime, setStartTime] = useState(
    format(new Date(block.start_at), "HH:mm")
  );
  const [platform, setPlatform] = useState(block.platform || "Instagram");
  const [duration, setDuration] = useState(
    Math.round((new Date(block.end_at).getTime() - new Date(block.start_at).getTime()) / 1000)
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
    titleRef.current?.select();
  }, []);

  const handleSave = () => {
    try {
      const [hours, minutes] = startTime.split(":").map(Number);
      const startDate = new Date(block.start_at);
      startDate.setHours(hours, minutes, 0, 0);
      const endDate = new Date(startDate.getTime() + duration * 1000);

      const data = {
        title,
        start_at: startDate.toISOString(),
        end_at: endDate.toISOString(),
        platform,
        duration_sec: duration,
      };

      // Validate
      const partial = blockSchemaPartial.safeParse(data);
      if (!partial.success) {
        const fieldErrors: Record<string, string> = {};
        partial.error.errors.forEach((err) => {
          if (err.path[0]) {
            fieldErrors[err.path[0] as string] = err.message;
          }
        });
        setErrors(fieldErrors);
        return;
      }

      onSave(data);
    } catch (error) {
      console.error("Inline editor save error:", error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  const platforms = ["Instagram", "TikTok", "LinkedIn", "Facebook", "X", "YouTube"];

  return (
    <div
      className="absolute inset-0 bg-background border-2 border-primary rounded-md p-3 shadow-lg z-50 space-y-3"
      onKeyDown={handleKeyDown}
    >
      {/* Title */}
      <div>
        <Label className="text-xs">Titel</Label>
        <Input
          ref={titleRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
          className="h-8 text-sm"
          placeholder="Post-Titel..."
        />
        {errors.title && <p className="text-xs text-destructive mt-1">{errors.title}</p>}
        <p className="text-xs text-muted-foreground mt-1">{title.length}/80</p>
      </div>

      {/* Time & Duration */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Zeit</Label>
          <Input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs">Dauer (s)</Label>
          <Input
            type="number"
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            min={5}
            max={900}
            className="h-8 text-sm"
          />
        </div>
      </div>

      {/* Platforms */}
      <div>
        <Label className="text-xs">Plattform</Label>
        <div className="flex flex-wrap gap-1 mt-1">
          {platforms.map((p) => (
            <Badge
              key={p}
              variant={platform === p ? "default" : "outline"}
              className="cursor-pointer text-xs"
              onClick={() => setPlatform(p)}
            >
              {p}
            </Badge>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2 border-t">
        <Button size="sm" onClick={handleSave} className="flex-1 h-8">
          <Check className="h-3 w-3 mr-1" />
          Speichern
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} className="h-8">
          <X className="h-3 w-3 mr-1" />
          Abbrechen
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        <kbd className="px-1 py-0.5 bg-muted rounded text-xs">Enter</kbd> Speichern ·{" "}
        <kbd className="px-1 py-0.5 bg-muted rounded text-xs">Esc</kbd> Abbrechen
      </p>
    </div>
  );
}