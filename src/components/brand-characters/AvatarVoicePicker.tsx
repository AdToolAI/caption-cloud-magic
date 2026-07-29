import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mic, Sparkles, X } from 'lucide-react';
import { useCustomVoices } from '@/hooks/useCustomVoices';
import { useTranslation } from '@/hooks/useTranslation';
import { UniversalVoiceLibraryPicker } from '@/components/voices/UniversalVoiceLibraryPicker';
import { VoicePreviewButton } from '@/components/voices/VoicePreviewButton';
import { toPickerLanguage, voiceLanguageLabel } from '@/lib/voice-languages';
import type { VoiceMeta } from '@/lib/elevenlabs-voices';

export interface AvatarVoiceSelection {
  voiceId: string;
  provider: 'elevenlabs' | 'custom';
  name: string;
  language: string;
}

interface AvatarVoicePickerProps {
  value: string | null;
  provider: 'elevenlabs' | 'custom' | null;
  /** Persisted language of the assigned voice — pre-filters the library. */
  language?: string | null;
  onChange: (v: AvatarVoiceSelection | null) => void;
  disabled?: boolean;
}

export const AvatarVoicePicker = ({
  value,
  language,
  onChange,
  disabled,
}: AvatarVoicePickerProps) => {
  const { voices: customVoices } = useCustomVoices();
  const { language: uiLang } = useTranslation();
  const [open, setOpen] = useState(false);
  const [pickedMeta, setPickedMeta] = useState<VoiceMeta | null>(null);

  const targetLanguage = toPickerLanguage(language) !== 'all'
    ? toPickerLanguage(language)
    : toPickerLanguage(uiLang);

  const customList = useMemo(
    () => (customVoices ?? []).filter((v) => v?.elevenlabs_voice_id && v?.is_active !== false),
    [customVoices],
  );

  const selected = useMemo(() => {
    if (!value) return null;
    const custom = customList.find((v) => v.elevenlabs_voice_id === value);
    if (custom) {
      return { name: custom.name || 'Custom voice', sub: 'Meine Stimme', cloned: true };
    }
    if (pickedMeta && pickedMeta.id === value) {
      return {
        name: pickedMeta.name,
        sub: [pickedMeta.gender, voiceLanguageLabel(targetLanguage)].filter(Boolean).join(' · '),
        cloned: false,
      };
    }
    return { name: 'Stimme aktiv', sub: voiceLanguageLabel(targetLanguage), cloned: false };
  }, [value, customList, pickedMeta, targetLanguage]);

  const handleSelect = (voice: VoiceMeta, lang: string) => {
    setPickedMeta(voice);
    const isCustom = customList.some((v) => v.elevenlabs_voice_id === voice.id);
    onChange({
      voiceId: voice.id,
      provider: isCustom ? 'custom' : 'elevenlabs',
      name: voice.name,
      language: lang,
    });
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-[11px] uppercase tracking-widest text-primary/70 flex items-center gap-1.5">
          <Mic className="h-3 w-3" /> Default Voice
        </label>
        {selected && (
          <Badge variant="secondary" className="text-[10px]">
            {selected.cloned && <Sparkles className="h-2.5 w-2.5 mr-1" />}
            {selected.sub}
          </Badge>
        )}
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => setOpen(true)}
          className="flex-1 justify-start bg-background/60 font-normal h-9 text-xs"
        >
          <Mic className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
          <span className="truncate">{selected ? selected.name : 'Stimme aus Bibliothek wählen…'}</span>
        </Button>

        {value && (
          <>
            <VoicePreviewButton voiceId={value} language={targetLanguage} size="icon" />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={disabled}
              onClick={() => { setPickedMeta(null); onChange(null); }}
              title="Stimme entfernen"
            >
              <X className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>

      <UniversalVoiceLibraryPicker
        open={open}
        onOpenChange={setOpen}
        onSelect={handleSelect}
        language={targetLanguage}
        currentVoiceId={value ?? undefined}
        title="Stimme für Charakter wählen"
      />
    </div>
  );
};
