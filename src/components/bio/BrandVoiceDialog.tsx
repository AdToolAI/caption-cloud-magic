import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/hooks/useTranslation";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface BrandVoiceDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: () => void;
  currentTone: string;
  currentKeywords: string;
}

export function BrandVoiceDialog({ 
  open, 
  onClose, 
  onSave, 
  currentTone, 
  currentKeywords 
}: BrandVoiceDialogProps) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [tone, setTone] = useState(currentTone);
  const [keywords, setKeywords] = useState(currentKeywords);
  const [tagline, setTagline] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTone(currentTone);
      setKeywords(currentKeywords);
      fetchBrandVoice();
    }
  }, [open, currentTone, currentKeywords]);

  const fetchBrandVoice = async () => {
    const { data } = await supabase
      .from("brand_voice")
      .select("*")
      .eq("user_id", user?.id)
      .single();
    
    if (data) {
      setTone(data.tone);
      setKeywords(data.keywords || "");
      setTagline(data.tagline || "");
    }
  };

  const handleSave = async () => {
    setSaving(true);

    try {
      // Check if brand voice exists
      const { data: existing } = await supabase
        .from("brand_voice")
        .select("id")
        .eq("user_id", user?.id)
        .single();

      const voiceData = {
        user_id: user?.id,
        tone,
        keywords: keywords.trim() || null,
        tagline: tagline.trim() || null,
      };

      if (existing) {
        const { error } = await supabase
          .from("brand_voice")
          .update(voiceData)
          .eq("user_id", user?.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("brand_voice")
          .insert([voiceData]);

        if (error) throw error;
      }

      toast.success("Brand voice saved!");
      onSave();
      onClose();
    } catch (error) {
      console.error("Error saving brand voice:", error);
      toast.error("Failed to save brand voice");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("bio_save_brand_voice")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>{t("bio_input_tone")}</Label>
            <Select value={tone} onValueChange={setTone}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="friendly">{t("bio_tone_friendly")}</SelectItem>
                <SelectItem value="professional">{t("bio_tone_professional")}</SelectItem>
                <SelectItem value="bold">{t("bio_tone_bold")}</SelectItem>
                <SelectItem value="humorous">{t("bio_tone_humorous")}</SelectItem>
                <SelectItem value="inspirational">{t("bio_tone_inspirational")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>{t("bio_input_keywords")}</Label>
            <Textarea
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="e.g., innovation, growth, AI"
              rows={2}
            />
          </div>

          <div>
            <Label>Tagline</Label>
            <Input
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="e.g., Building the future of AI"
            />
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
