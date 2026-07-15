import { useEffect, useState, useMemo } from 'react';
import { Mic, Play, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useCustomVoices } from '@/hooks/useCustomVoices';
import { supabase } from '@/integrations/supabase/client';
import {
  sortVoicesPremiumFirst,
  type VoiceMeta,
} from '@/lib/elevenlabs-voices';
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
 * Shows the user's cloned voices AND the full premium library so any character
 * can be assigned a voice — cloned voices are listed first, then Premium, then Standard.
 */
export function VoicePicker({ value, onChange, previewText }: VoicePickerProps) {
  const { voices: customVoices } = useCustomVoices();
  const [libraryVoices, setLibraryVoices] = useState<VoiceMeta[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(true);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingLibrary(true);
        const { data, error } = await supabase.functions.invoke('list-voices', {
          body: { language: 'all' },
        });
        if (error) throw error;
        if (cancelled) return;
        setLibraryVoices(sortVoicesPremiumFirst(data?.voices || []));
      } catch (err) {
        console.error('[VoicePicker] list-voices failed:', err);
      } finally {
        if (!cancelled) setLoadingLibrary(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeCustom = useMemo(
    () => customVoices.filter((v) => v.is_active),
    [customVoices]
  );

  const premiumLibrary = useMemo(
    () => libraryVoices.filter((v) => v.tier === 'premium'),
    [libraryVoices]
  );
  const standardLibrary = useMemo(
    () => libraryVoices.filter((v) => v.tier !== 'premium'),
    [libraryVoices]
  );

  const selectedLabel = useMemo(() => {
    if (!value) return null;
    const custom = activeCustom.find((v) => v.elevenlabs_voice_id === value);
    if (custom) return { name: custom.name, tag: 'Meine Stimme', tone: 'emerald' as const };
    const lib = libraryVoices.find((v) => v.id === value);
    if (lib) {
      return {
        name: lib.name,
        tag: lib.tier === 'premium' ? 'Premium' : (lib.language || '').toString().toUpperCase(),
        tone: (lib.tier === 'premium' ? 'amber' : 'muted') as 'amber' | 'muted',
      };
    }
    return null;
  }, [value, activeCustom, libraryVoices]);

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
            className={
              selectedLabel.tone === 'emerald'
                ? 'text-[10px] border-emerald-400/40 text-emerald-300 bg-emerald-500/10'
                : selectedLabel.tone === 'amber'
                  ? 'text-[10px] border-amber-400/40 text-amber-300 bg-amber-500/10'
                  : 'text-[10px]'
            }
          >
            {selectedLabel.tag}
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
          <SelectContent className="max-h-72">
            <SelectItem value="none">— Keine Voice —</SelectItem>

            {activeCustom.length > 0 && (
              <SelectGroup>
                <SelectLabel className="text-emerald-300">Meine Stimmen</SelectLabel>
                {activeCustom.map((voice) => (
                  <SelectItem key={voice.id} value={voice.elevenlabs_voice_id}>
                    {voice.name} · {voice.language}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}

            {premiumLibrary.length > 0 && (
              <SelectGroup>
                <SelectLabel className="text-amber-300">Premium</SelectLabel>
                {premiumLibrary.map((voice) => (
                  <SelectItem key={voice.id} value={voice.id}>
                    {voice.name}
                    {voice.gender ? ` · ${voice.gender}` : ''} · {String(voice.language).toUpperCase()}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}

            {standardLibrary.length > 0 && (
              <SelectGroup>
                <SelectLabel>Standard</SelectLabel>
                {standardLibrary.map((voice) => (
                  <SelectItem key={voice.id} value={voice.id}>
                    {voice.name} · {String(voice.language).toUpperCase()}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}

            {loadingLibrary && activeCustom.length === 0 && (
              <SelectItem value="loading" disabled>
                Stimmen werden geladen…
              </SelectItem>
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
