import { useState } from 'react';
import { Mic, Play, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useCustomVoices } from '@/hooks/useCustomVoices';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface VoicePickerProps {
  /** ElevenLabs voice id (or null to clear). */
  value: string | null;
  onChange: (voiceId: string | null) => void;
  /** Optional preview text for test-synthesis. */
  previewText?: string;
}

const PREVIEW_TEXT_FALLBACK =
  'Hello, this is a quick test of how this voice sounds in your motion studio project.';

/**
 * Voice picker for the Motion Studio Library.
 * Shows the user's custom-cloned voices and lets them play a 1-sentence preview
 * before assigning a voice to a character.
 */
export function VoicePicker({ value, onChange, previewText }: VoicePickerProps) {
  const { voices } = useCustomVoices();
  const [previewing, setPreviewing] = useState(false);
  const activeVoices = voices.filter((v) => v.is_active);

  const selected = voices.find((v) => v.elevenlabs_voice_id === value);

  const handlePreview = async () => {
    if (!value) {
      toast.error('Bitte zuerst eine Voice auswählen');
      return;
    }
    setPreviewing(true);
    try {
      const { data, error } = await supabase.functions.invoke('preview-voice', {
        body: {
          text: previewText?.trim() || PREVIEW_TEXT_FALLBACK,
          voiceId: value,
        },
      });
      if (error) throw error;
      // Edge function returns base64 audio
      const audioB64 = data?.audioBase64 || data?.audio || data?.audioContent;
      if (!audioB64) throw new Error('Keine Audio-Daten erhalten');
      const audio = new Audio(`data:audio/mpeg;base64,${audioB64}`);
      await audio.play();
    } catch (err) {
      console.error('[VoicePicker] preview failed:', err);
      toast.error('Voice-Preview fehlgeschlagen');
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs flex items-center gap-1.5">
          <Mic className="h-3 w-3" />
          Voice (optional)
        </Label>
        {selected && (
          <Badge variant="secondary" className="text-[10px]">
            {selected.language}
          </Badge>
        )}
      </div>

      <div className="flex gap-2">
        <Select
          value={value ?? 'none'}
          onValueChange={(v) => onChange(v === 'none' ? null : v)}
        >
          <SelectTrigger className="bg-background/60 flex-1">
            <SelectValue placeholder="Keine Voice zugewiesen" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">— Keine Voice —</SelectItem>
            {activeVoices.length === 0 ? (
              <SelectItem value="empty" disabled>
                Noch keine aktiven Custom Voices
              </SelectItem>
            ) : (
              activeVoices.map((voice) => (
                <SelectItem key={voice.id} value={voice.elevenlabs_voice_id}>
                  {voice.name} · {voice.language}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>

        {value && (
          <>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handlePreview}
              disabled={previewing}
              title="Voice testen"
            >
              {previewing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onChange(null)}
              title="Voice entfernen"
            >
              <X className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground">
        Diese Stimme wird automatisch für Voiceovers verwendet, wenn dieser Charakter in einer
        Szene auftaucht.
      </p>
    </div>
  );
}
