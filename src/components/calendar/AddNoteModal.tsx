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
      toast.error(t("calendar.addNote.noteRequired"));
      return;
    }

    if (!selectedDate) {
      toast.error(t("calendar.addNote.dateRequired"));
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
      toast.error(t("calendar.addNote.saveFailed"));
      console.error(error);
    } else {
      toast.success(t("calendar.addNote.noteCreated"));
      setNoteText("");
      onSave();
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("calendar.addNote.title")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>{t("calendar.addNote.date")}</Label>
            <div className="text-sm text-muted-foreground">
              {selectedDate ? format(selectedDate, "PPP") : t("calendar.addNote.noDateSelected")}
            </div>
          </div>

          <div>
            <Label>{t("calendar.addNote.noteText")}</Label>
            <Textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={4}
              maxLength={300}
              placeholder={t("calendar.addNote.notePlaceholder")}
            />
            <div className="text-xs text-muted-foreground text-right mt-1">
              {noteText.length}/300
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <Button onClick={onClose} variant="outline" disabled={saving}>
              {t("calendar.addNote.cancel")}
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? t("calendar.addNote.saving") : t("calendar.addNote.save")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
