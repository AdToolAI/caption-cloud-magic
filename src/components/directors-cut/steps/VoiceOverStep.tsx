import { useState } from 'react';
import { AIVoiceOver } from '../features/AIVoiceOver';

interface VoiceOverStepProps {
  onVoiceOverGenerated?: (url: string) => void;
}

export function VoiceOverStep({ onVoiceOverGenerated }: VoiceOverStepProps) {
  const [voiceOverSettings, setVoiceOverSettings] = useState({
    enabled: false,
    scriptText: '',
    voiceId: 'sarah',
    language: 'de-DE',
    speed: 1,
    pitch: 0,
    volume: 80,
    emotionalTone: 'neutral' as 'neutral' | 'enthusiastic' | 'calm' | 'serious' | 'friendly',
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold">KI Voice-Over</h3>
        <p className="text-sm text-muted-foreground">
          Generiere professionelle Sprachaufnahmen mit KI
        </p>
      </div>

      {/* AI Voice-Over */}
      <AIVoiceOver
        settings={voiceOverSettings}
        onSettingsChange={setVoiceOverSettings}
        onVoiceOverGenerated={onVoiceOverGenerated}
      />
    </div>
  );
}
