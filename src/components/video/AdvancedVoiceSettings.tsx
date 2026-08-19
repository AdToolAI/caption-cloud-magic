import { tx } from "@/lib/i18nText";
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Settings, RotateCcw } from 'lucide-react';
import { useState } from 'react';

interface AdvancedVoiceSettingsProps {
  onSettingsChange: (settings: VoiceSettings) => void;
}

export interface VoiceSettings {
  stability: number;
  similarityBoost: number;
  styleExaggeration: number;
  useSpeakerBoost: boolean;
}

const DEFAULT_SETTINGS: VoiceSettings = {
  stability: 0.5,
  similarityBoost: 0.75,
  styleExaggeration: 0.0,
  useSpeakerBoost: true,
};

export const AdvancedVoiceSettings = ({ onSettingsChange }: AdvancedVoiceSettingsProps) => {
  const [settings, setSettings] = useState<VoiceSettings>(DEFAULT_SETTINGS);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const updateSetting = <K extends keyof VoiceSettings>(key: K, value: VoiceSettings[K]) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    onSettingsChange(newSettings);
  };

  const resetToDefaults = () => {
    setSettings(DEFAULT_SETTINGS);
    onSettingsChange(DEFAULT_SETTINGS);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="gap-2"
        >
          <Settings className="h-4 w-4" />
          {showAdvanced ? tx({ de: 'Erweiterte Einstellungen ausblenden', en: 'Hide advanced settings', es: 'Ocultar configuración avanzada' }) : tx({ de: 'Erweiterte Einstellungen', en: 'Advanced Settings', es: 'Configuración avanzada' })}
        </Button>
        {showAdvanced && (
          <Button variant="ghost" size="sm" onClick={resetToDefaults}>
            <RotateCcw className="h-4 w-4 mr-2" />
            {tx({ de: "{tx({ de: \"Zurücksetzen\", en: \"Reset\", es: \"Restablecer\" })}", en: "Reset", es: "Restablecer" })}
          </Button>
        )}
      </div>

      {showAdvanced && (
        <div className="space-y-6 p-4 bg-muted rounded-lg">
          {/* Stability */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label className="text-sm font-medium">
                {tx({ de: "{tx({ de: \"Stabilität\", en: \"Stability\", es: \"Estabilidad\" })}", en: "Stability", es: "Estabilidad" })}
                <span className="ml-2 text-xs text-muted-foreground">(Konsistenz)</span>
              </Label>
              <span className="text-sm text-muted-foreground">{settings.stability.toFixed(2)}</span>
            </div>
            <Slider
              value={[settings.stability]}
              onValueChange={([value]) => updateSetting('stability', value)}
              min={0}
              max={1}
              step={0.05}
            />
            <p className="text-xs text-muted-foreground">
              Höhere Werte = konsistentere Stimme, niedrigere Werte = mehr Variation
            </p>
          </div>

          {/* Similarity Boost */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label className="text-sm font-medium">
                {tx({ de: "{tx({ de: \"Ähnlichkeit\", en: \"Similarity\", es: \"Similitud\" })}", en: "Similarity", es: "Similitud" })}
                <span className="ml-2 text-xs text-muted-foreground">{tx({ de: "(Authentizität)", en: "(Authenticity)", es: "(Autenticidad)" })}</span>
              </Label>
              <span className="text-sm text-muted-foreground">{settings.similarityBoost.toFixed(2)}</span>
            </div>
            <Slider
              value={[settings.similarityBoost]}
              onValueChange={([value]) => updateSetting('similarityBoost', value)}
              min={0}
              max={1}
              step={0.05}
            />
            <p className="text-xs text-muted-foreground">
              {tx({ de: "{tx({ de: \"Wie sehr die Stimme dem Original ähneln soll\", en: \"How much the voice should resemble the original\", es: \"Cuánto debe parecerse la voz al original\" })}", en: "How much the voice should resemble the original", es: "Cuánto debe parecerse la voz al original" })}
            </p>
          </div>

          {/* Style Exaggeration */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label className="text-sm font-medium">
                {tx({ de: "{tx({ de: \"Stil-Verstärkung\", en: \"Style Exaggeration\", es: \"Exageración de estilo\" })}", en: "Style Exaggeration", es: "Exageración de estilo" })}
                <span className="ml-2 text-xs text-muted-foreground">(Emotion)</span>
              </Label>
              <span className="text-sm text-muted-foreground">{settings.styleExaggeration.toFixed(2)}</span>
            </div>
            <Slider
              value={[settings.styleExaggeration]}
              onValueChange={([value]) => updateSetting('styleExaggeration', value)}
              min={0}
              max={1}
              step={0.05}
            />
            <p className="text-xs text-muted-foreground">
              {tx({ de: "{tx({ de: \"Verstärkt emotionale Ausdrücke in der Stimme\", en: \"Amplifies emotional expressions in the voice\", es: \"Amplifica las expresiones emocionales en la voz\" })}", en: "Amplifies emotional expressions in the voice", es: "Amplifica las expresiones emocionales en la voz" })}
            </p>
          </div>

          {/* Speaker Boost */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Speaker Boost</Label>
              <p className="text-xs text-muted-foreground">
                {tx({ de: "{tx({ de: \"Verbessert die Stimmqualität für längere Texte\", en: \"Improves voice quality for longer texts\", es: \"Mejora la calidad de voz para textos largos\" })}", en: "Improves voice quality for longer texts", es: "Mejora la calidad de voz para textos largos" })}
              </p>
            </div>
            <Switch
              checked={settings.useSpeakerBoost}
              onCheckedChange={(checked) => updateSetting('useSpeakerBoost', checked)}
            />
          </div>

          {/* Presets */}
          <div className="pt-4 border-t space-y-2">
            <Label className="text-sm font-medium">Voreinstellungen</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const preset = { stability: 0.7, similarityBoost: 0.8, styleExaggeration: 0.0, useSpeakerBoost: true };
                  setSettings(preset);
                  onSettingsChange(preset);
                }}
              >
                Professionell
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const preset = { stability: 0.4, similarityBoost: 0.6, styleExaggeration: 0.5, useSpeakerBoost: true };
                  setSettings(preset);
                  onSettingsChange(preset);
                }}
              >
                Energisch
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const preset = { stability: 0.8, similarityBoost: 0.9, styleExaggeration: 0.3, useSpeakerBoost: true };
                  setSettings(preset);
                  onSettingsChange(preset);
                }}
              >
                Emotional
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const preset = { stability: 0.9, similarityBoost: 0.85, styleExaggeration: 0.0, useSpeakerBoost: true };
                  setSettings(preset);
                  onSettingsChange(preset);
                }}
              >
                Neutral
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
