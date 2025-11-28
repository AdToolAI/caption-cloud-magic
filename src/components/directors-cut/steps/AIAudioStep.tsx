import { useState } from 'react';
import { SceneAnalysis } from '@/types/directors-cut';
import { BeatSyncEditor } from '../features/BeatSyncEditor';
import { AISoundDesign } from '../features/AISoundDesign';
import { AIVoiceOver } from '../features/AIVoiceOver';

interface AIAudioStepProps {
  videoUrl: string;
  scenes?: SceneAnalysis[];
  onVoiceOverGenerated?: (url: string) => void;
}

export function AIAudioStep({ videoUrl, scenes = [], onVoiceOverGenerated }: AIAudioStepProps) {
  const [detectedBeats, setDetectedBeats] = useState<any[]>([]);
  const [generatedSounds, setGeneratedSounds] = useState<any[]>([]);
  
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
        <h3 className="text-lg font-semibold">KI-Audio</h3>
        <p className="text-sm text-muted-foreground">
          Beat-Sync, Sound Design und KI-generierte Voiceovers
        </p>
      </div>

      {/* Beat Sync & Sound Design */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <BeatSyncEditor
          videoUrl={videoUrl}
          onBeatsDetected={setDetectedBeats}
          onSyncApplied={(settings) => console.log('Beat sync settings:', settings)}
        />
        <AISoundDesign
          scenes={scenes}
          onSoundsGenerated={setGeneratedSounds}
        />
      </div>

      {/* AI Voice-Over */}
      <div className="pt-6 border-t">
        <AIVoiceOver
          settings={voiceOverSettings}
          onSettingsChange={setVoiceOverSettings}
          onVoiceOverGenerated={onVoiceOverGenerated}
        />
      </div>
    </div>
  );
}
