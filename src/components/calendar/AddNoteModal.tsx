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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { format } from "date-fns";

interface AddNoteModalProps {
  open: boolean;
  onClose: () => void;
  onSave: () => void;
  selectedDate: Date | null;
}

export function AddNoteModal({ open, onClose, onSave, selectedDate }: AddNoteModalProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [noteText, setNoteText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setNoteText("");
    }
  }, [open]);

  const handleSave = async () => {
    if (!noteText.trim()) {
      toast.error("Note text is required");
      return;
    }

    if (!selectedDate) {
      toast.error("Please select a date");
      return;
    }

    setSaving(true);

    const { error } = await supabase.from("calendar_notes").insert([
      {
        user_id: user?.id,
        note_text: noteText,
        date: format(selectedDate, "yyyy-MM-dd"),
      },
    ]);

    setSaving(false);

    if (error) {
      toast.error("Failed to save note");
      console.error(error);
    } else {
      toast.success("Note created");
      setNoteText("");
      onSave();
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("calendar_add_note")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Date</Label>
            <div className="text-sm text-muted-foreground">
              {selectedDate ? format(selectedDate, "PPP") : "No date selected"}
            </div>
          </div>

          <div>
            <Label>{t("calendar_note_text")}</Label>
            <Textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={4}
              maxLength={300}
              placeholder="e.g., Shoot video for Monday post"
            />
            <div className="text-xs text-muted-foreground text-right mt-1">
              {noteText.length}/300
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <Button onClick={onClose} variant="outline" disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
