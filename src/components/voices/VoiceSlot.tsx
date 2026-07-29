import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Library, Mic, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { UniversalVoiceLibraryPicker } from '@/components/voices/UniversalVoiceLibraryPicker';
import { VoicePreviewButton } from '@/components/voices/VoicePreviewButton';
import { VoiceLanguageSelect } from '@/components/voices/VoiceLanguageSelect';
import { toPickerLanguage, voiceLanguageLabel } from '@/lib/voice-languages';
import type { VoiceCategoryId } from '@/lib/voice-categories';
import type { VoiceMeta } from '@/lib/elevenlabs-voices';

export interface VoiceSlotSelection {
  voiceId: string;
  voiceName: string;
  language: string;
  meta?: VoiceMeta;
}

interface VoiceSlotProps {
  /** Sprechername / Rolle, z. B. „Sprecher 2" oder „Anna". */
  label?: string;
  voiceId?: string | null;
  voiceName?: string | null;
  language?: string | null;
  onChange: (selection: VoiceSlotSelection) => void;
  onClear?: () => void;
  /** Kontext-Empfehlung, z. B. `ads`, `narration`, `characters`. */
  category?: VoiceCategoryId;
  /** Zeigt die Sprachauswahl direkt im Slot (21 Sprachen). */
  showLanguage?: boolean;
  enforceNative?: boolean;
  disabled?: boolean;
  className?: string;
  pickerTitle?: string;
}

/**
 * Kanonische Stimmen-Auswahl der Plattform.
 * Einzige Quelle: `UniversalVoiceLibraryPicker` → `list-voices` (volle Bibliothek).
 * Wird für Einzel-Voiceover UND für jeden einzelnen Sprecher verwendet.
 */
export function VoiceSlot({
  label,
  voiceId,
  voiceName,
  language,
  onChange,
  onClear,
  category = 'all',
  showLanguage = true,
  enforceNative = true,
  disabled,
  className,
  pickerTitle,
}: VoiceSlotProps) {
  const [open, setOpen] = useState(false);
  const lang = toPickerLanguage(language);

  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-foreground/80 truncate">{label}</span>
          {voiceId && (
            <Badge variant="secondary" className="text-[10px] shrink-0">
              {voiceLanguageLabel(lang)}
            </Badge>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        {showLanguage && (
          <VoiceLanguageSelect
            value={lang}
            disabled={disabled}
            className="h-9 w-[150px] shrink-0 text-xs"
            onChange={(next) => {
              if (voiceId) onChange({ voiceId, voiceName: voiceName || 'Voice', language: next });
            }}
          />
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => setOpen(true)}
          className="flex-1 justify-start h-9 font-normal bg-background/60 text-xs min-w-0"
        >
          <Mic className="h-3.5 w-3.5 mr-2 text-muted-foreground shrink-0" />
          <span className="truncate">{voiceName || (voiceId ? 'Stimme aktiv' : 'Stimme wählen…')}</span>
          <Library className="h-3.5 w-3.5 ml-auto text-primary shrink-0" />
        </Button>

        {voiceId && (
          <VoicePreviewButton voiceId={voiceId} language={lang} size="icon" className="shrink-0" />
        )}
        {voiceId && onClear && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled}
            onClick={onClear}
            title="Stimme entfernen"
            className="shrink-0"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <UniversalVoiceLibraryPicker
        open={open}
        onOpenChange={setOpen}
        language={lang}
        category={category}
        enforceNative={enforceNative}
        currentVoiceId={voiceId ?? undefined}
        title={pickerTitle || (label ? `Stimme für ${label}` : 'Voice-Bibliothek')}
        onSelect={(voice, resolvedLanguage) =>
          onChange({
            voiceId: voice.id,
            voiceName: voice.name,
            language: resolvedLanguage || lang,
            meta: voice,
          })
        }
      />
    </div>
  );
}
