import { useMemo, useState } from 'react';
import { Loader2, Mic, Play, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useCustomVoices } from '@/hooks/useCustomVoices';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { UniversalVoiceLibraryPicker } from '@/components/voices/UniversalVoiceLibraryPicker';
import type { VoiceMeta } from '@/lib/elevenlabs-voices';
import { cn } from '@/lib/utils';

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
 * Motion Studio voice picker – opens the UniversalVoiceLibraryPicker (search,
 * filters, native-only, previews, infinite scroll). Prop contract unchanged so
 * every existing caller (CharacterEditor, VoiceProfileCard-adapters, ...) keeps
 * working without changes.
 */
export function VoicePicker({ value, onChange, previewText }: VoicePickerProps) {
  const { voices: customVoices } = useCustomVoices();
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [pickedMeta, setPickedMeta] = useState<VoiceMeta | null>(null);
  const [previewing, setPreviewing] = useState(false);

  // Resolve a display label for the currently selected voice.
  const selectedLabel = useMemo(() => {
    if (!value) return null;
    const custom = customVoices.find(
      (v) => v.is_active && v.elevenlabs_voice_id === value,
    );
    if (custom) {
      return {
        name: custom.name,
        sub: `Meine Stimme · ${custom.language.toUpperCase()}`,
        tone: 'emerald' as const,
      };
    }
    if (pickedMeta && pickedMeta.id === value) {
      const lang = String(pickedMeta.language || '').toUpperCase();
      const tone: 'amber' | 'muted' = pickedMeta.tier === 'premium' ? 'amber' : 'muted';
      return {
        name: pickedMeta.name,
        sub: [pickedMeta.gender, lang].filter(Boolean).join(' · '),
        tone,
      };
    }
    return {
      name: 'Stimme aktiv',
      sub: value.slice(0, 10) + '…',
      tone: 'muted' as const,
    };
  }, [value, customVoices, pickedMeta]);

  const handlePickerSelect = (voice: VoiceMeta) => {
    setPickedMeta(voice);
    onChange(voice.id);
  };

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
        {selectedLabel && (
          <Badge
            variant="secondary"
            className={cn(
              'text-[10px]',
              selectedLabel.tone === 'emerald' &&
                'border-emerald-400/40 text-emerald-300 bg-emerald-500/10',
              selectedLabel.tone === 'amber' &&
                'border-amber-400/40 text-amber-300 bg-amber-500/10',
            )}
          >
            {selectedLabel.tone === 'emerald' && <Sparkles className="h-2.5 w-2.5 mr-1" />}
            {selectedLabel.sub}
          </Badge>
        )}
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => setLibraryOpen(true)}
          className="flex-1 justify-start bg-background/60 font-normal"
        >
          <Mic className="h-4 w-4 mr-2 text-muted-foreground" />
          <span className="truncate">
            {selectedLabel ? selectedLabel.name : 'Voice-Bibliothek öffnen…'}
          </span>
        </Button>

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
              onClick={() => {
                onChange(null);
                setPickedMeta(null);
              }}
              title="Voice entfernen"
            >
              <X className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground">
        Diese Stimme wird automatisch für Voiceovers verwendet, wenn dieser Charakter in
        einer Szene auftaucht.
      </p>

      <UniversalVoiceLibraryPicker
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        onSelect={handlePickerSelect}
        language="all"
        currentVoiceId={value ?? undefined}
        title="Stimme für Charakter wählen"
      />
    </div>
  );
}
