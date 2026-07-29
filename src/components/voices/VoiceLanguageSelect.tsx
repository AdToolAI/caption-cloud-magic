import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { VOICE_LANGUAGES, toPickerLanguage } from '@/lib/voice-languages';
import { cn } from '@/lib/utils';

interface VoiceLanguageSelectProps {
  value?: string | null;
  onChange: (language: string) => void;
  /** Zeigt zusätzlich „Alle Sprachen". */
  allowAll?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * Einheitliches Sprach-Dropdown für alle Voice-/TTS-Bereiche (21 Sprachen).
 * Ersetzt die alten DE/EN/ES-Tabs.
 */
export function VoiceLanguageSelect({
  value,
  onChange,
  allowAll = false,
  disabled,
  className,
}: VoiceLanguageSelectProps) {
  const current = toPickerLanguage(value);
  return (
    <Select value={current} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className={cn('bg-background/50', className)}>
        <SelectValue placeholder="Sprache" />
      </SelectTrigger>
      <SelectContent className="max-h-[320px]">
        {allowAll && <SelectItem value="all">🌍 Alle Sprachen</SelectItem>}
        {VOICE_LANGUAGES.map((l) => (
          <SelectItem key={l.code} value={l.code}>
            {l.flag} {l.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
