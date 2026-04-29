import { useMemo } from 'react';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel,
  SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Mic } from 'lucide-react';
import { useCustomVoices } from '@/hooks/useCustomVoices';

const ELEVENLABS_VOICES: { id: string; name: string }[] = [
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah — warm female' },
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda — clear female' },
  { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica — energetic' },
  { id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice — confident' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George — deep male' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam — young male' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel — narrator' },
  { id: 'CwhRBWXzGAHq8TQ4Fs17', name: 'Roger — confident' },
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian — warm narrator' },
];

interface AvatarVoicePickerProps {
  value: string | null;
  provider: 'elevenlabs' | 'custom' | null;
  onChange: (v: { voiceId: string; provider: 'elevenlabs' | 'custom'; name: string } | null) => void;
  disabled?: boolean;
}

export const AvatarVoicePicker = ({ value, onChange, disabled }: AvatarVoicePickerProps) => {
  const { voices: customVoices } = useCustomVoices();

  const customList = useMemo(
    () => (customVoices ?? []).filter((v) => v?.elevenlabs_voice_id && v?.is_active !== false),
    [customVoices]
  );

  const handleChange = (selected: string) => {
    if (!selected) {
      onChange(null);
      return;
    }
    const eleven = ELEVENLABS_VOICES.find((v) => v.id === selected);
    if (eleven) {
      onChange({ voiceId: eleven.id, provider: 'elevenlabs', name: eleven.name });
      return;
    }
    const custom = customList.find((v) => v.elevenlabs_voice_id === selected);
    if (custom) {
      onChange({
        voiceId: custom.elevenlabs_voice_id,
        provider: 'custom',
        name: custom.name || 'Custom voice',
      });
    }
  };

  return (
    <div className="space-y-1.5">
      <label className="text-[11px] uppercase tracking-widest text-primary/70 flex items-center gap-1.5">
        <Mic className="h-3 w-3" /> Default Voice
      </label>
      <Select value={value ?? undefined} onValueChange={handleChange} disabled={disabled}>
        <SelectTrigger className="h-9 text-xs bg-background/60">
          <SelectValue placeholder="Pick a voice…" />
        </SelectTrigger>
        <SelectContent className="z-[60] bg-background border-primary/20">
          <SelectGroup>
            <SelectLabel className="text-[10px] uppercase tracking-widest text-primary/60">
              ElevenLabs Library
            </SelectLabel>
            {ELEVENLABS_VOICES.map((v) => (
              <SelectItem key={v.id} value={v.id} className="text-xs">
                {v.name}
              </SelectItem>
            ))}
          </SelectGroup>
          {customList.length > 0 && (
            <SelectGroup>
              <SelectLabel className="text-[10px] uppercase tracking-widest text-primary/60 mt-2">
                Your Custom Voices
              </SelectLabel>
              {customList.map((v) => (
                <SelectItem key={v.id} value={v.elevenlabs_voice_id} className="text-xs">
                  {v.name || 'Custom voice'}
                </SelectItem>
              ))}
            </SelectGroup>
          )}
        </SelectContent>
      </Select>
    </div>
  );
};
