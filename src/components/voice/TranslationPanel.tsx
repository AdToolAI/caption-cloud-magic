import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Languages, Play } from 'lucide-react';
import { useVoiceTranslation } from '@/hooks/useVoiceTranslation';
import { useCustomVoices } from '@/hooks/useCustomVoices';
import { useTx } from '@/lib/i18nText';

const LANGUAGES = [
  { code: 'de', name: 'Deutsch' },
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'it', name: 'Italiano' },
  { code: 'pt', name: 'Português' },
  { code: 'pl', name: 'Polski' },
  { code: 'nl', name: 'Nederlands' },
];

export function TranslationPanel() {
  const tx = useTx();
  const [text, setText] = useState('');
  const [sourceLanguage, setSourceLanguage] = useState('de');
  const [targetLanguage, setTargetLanguage] = useState('en');
  const [selectedVoice, setSelectedVoice] = useState('');
  const { loading, translation, translateAndGenerate } = useVoiceTranslation();
  const { voices } = useCustomVoices();

  const handleTranslate = async () => {
    await translateAndGenerate({
      text,
      source_language: sourceLanguage,
      target_language: targetLanguage,
      custom_voice_id: selectedVoice || undefined,
    });
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Languages className="h-5 w-5" />
          {tx({ de: "Text übersetzen & Voiceover erstellen", en: "Translate text & create voiceover", es: "Traducir texto y crear locución" })}
        </h3>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{tx({ de: "Von", en: "From", es: "Desde" })}</Label>
              <Select value={sourceLanguage} onValueChange={setSourceLanguage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((lang) => (
                    <SelectItem key={lang.code} value={lang.code}>
                      {lang.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>{tx({ de: "Nach", en: "To", es: "Hacia" })}</Label>
              <Select value={targetLanguage} onValueChange={setTargetLanguage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((lang) => (
                    <SelectItem key={lang.code} value={lang.code}>
                      {lang.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>{tx({ de: "Text", en: "Text", es: "Texto" })}</Label>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={tx({ de: "Gib deinen Text ein...", en: "Enter your text...", es: "Introduce tu texto..." })}
              rows={4}
            />
          </div>

          <div>
            <Label>{tx({ de: "Voice (Optional)", en: "Voice (optional)", es: "Voz (opcional)" })}</Label>
            <Select value={selectedVoice} onValueChange={setSelectedVoice}>
              <SelectTrigger>
                <SelectValue placeholder={tx({ de: "Standard Voice", en: "Default voice", es: "Voz predeterminada" })} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">{tx({ de: "Standard Voice", en: "Default voice", es: "Voz predeterminada" })}</SelectItem>
                {voices.filter(v => v.is_active).map((voice) => (
                  <SelectItem key={voice.id} value={voice.id}>
                    {voice.name} ({voice.language})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleTranslate}
            disabled={loading || !text}
            className="w-full gap-2"
          >
            <Languages className="h-4 w-4" />
            {loading ? tx({ de: 'Übersetzt...', en: 'Translating...', es: 'Traduciendo...' }) : tx({ de: 'Übersetzen & Voiceover erstellen', en: 'Translate & create voiceover', es: 'Traducir y crear locución' })}
          </Button>
        </div>
      </Card>

      {translation && (
        <Card className="p-4">
          <h4 className="font-semibold mb-2">{tx({ de: "Ergebnis", en: "Result", es: "Resultado" })}</h4>
          <div className="space-y-3">
            <div className="p-3 bg-muted rounded">
              <p className="text-sm">{translation.translated_text}</p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => {
                  const audio = new Audio(translation.voiceover_url);
                  audio.play();
                }}
              >
                <Play className="h-3 w-3" />
                {tx({ de: "Voiceover abspielen", en: "Play voiceover", es: "Reproducir locución" })}
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  window.open(translation.voiceover_url, '_blank');
                }}
              >
                {tx({ de: "Download", en: "Download", es: "Descargar" })}
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
