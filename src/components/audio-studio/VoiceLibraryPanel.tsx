import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Mic, Plus, Trash2, Play, Pause, Loader2, Sparkles } from 'lucide-react';
import { useCustomVoices } from '@/hooks/useCustomVoices';
import { VoiceCloneDialog } from '@/components/voice/VoiceCloneDialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function VoiceLibraryPanel() {
  const { voices, loading, deleteVoice, toggleVoiceActive } = useCustomVoices();
  const [showCloneDialog, setShowCloneDialog] = useState(false);
  const [playingSampleId, setPlayingSampleId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testTexts, setTestTexts] = useState<Record<string, string>>({});

  const handleDelete = async (voice_id: string) => {
    if (confirm('Voice wirklich löschen?')) {
      await deleteVoice(voice_id);
    }
  };

  const handleTestSynthesis = async (voiceId: string, elevenlabsVoiceId: string) => {
    const text = (testTexts[voiceId] || '').trim();
    if (!text) {
      toast.error('Bitte gib einen Test-Text ein');
      return;
    }
    setTestingId(voiceId);
    try {
      const { data, error } = await supabase.functions.invoke('preview-voice', {
        body: { text, voiceId: elevenlabsVoiceId },
      });
      if (error) throw error;
      const audioB64 = data?.audioBase64 || data?.audio || data?.audioContent;
      if (!audioB64) throw new Error('Keine Audio-Daten erhalten');
      const audio = new Audio(`data:audio/mpeg;base64,${audioB64}`);
      await audio.play();
    } catch (err) {
      console.error('[VoiceLibraryPanel] test failed:', err);
      toast.error('Test-Synthese fehlgeschlagen');
    } finally {
      setTestingId(null);
    }
  };

  return (
    <Card className="backdrop-blur-xl bg-card/60 border-border/50 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold">Custom Voices</h3>
          <p className="text-sm text-muted-foreground">
            Verwalte deine geklonten Stimmen, weise sie Charakteren in deiner Motion-Studio-Library
            zu und teste die Synthese mit eigenem Text.
          </p>
        </div>
        <Button onClick={() => setShowCloneDialog(true)} size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          Voice klonen
        </Button>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {voices.map((voice) => (
          <Card key={voice.id} className="p-4 bg-muted/30 border-border/50 space-y-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center">
                  <Mic className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-semibold">{voice.name}</h4>
                  <div className="flex gap-1.5 mt-0.5">
                    <Badge variant="secondary" className="text-[10px]">
                      {voice.language}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {voice.sample_urls.length} Samples
                    </Badge>
                  </div>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => handleDelete(voice.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>

            {/* Sample preview + active toggle */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 gap-2"
                onClick={() => {
                  if (playingSampleId === voice.id) {
                    setPlayingSampleId(null);
                  } else {
                    setPlayingSampleId(voice.id);
                    const audio = new Audio(voice.sample_urls[0]);
                    audio.play();
                    audio.onended = () => setPlayingSampleId(null);
                  }
                }}
              >
                {playingSampleId === voice.id ? (
                  <Pause className="h-3 w-3" />
                ) : (
                  <Play className="h-3 w-3" />
                )}
                Sample
              </Button>
              <Button
                variant={voice.is_active ? 'default' : 'outline'}
                size="sm"
                className="flex-1"
                onClick={() => toggleVoiceActive(voice.id, !voice.is_active)}
              >
                {voice.is_active ? 'Aktiv' : 'Inaktiv'}
              </Button>
            </div>

            {/* Test synthesis */}
            <div className="space-y-2 pt-2 border-t border-border/50">
              <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
                <Sparkles className="h-3 w-3" />
                Test-Synthese
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="Beispieltext eingeben..."
                  value={testTexts[voice.id] || ''}
                  onChange={(e) =>
                    setTestTexts((p) => ({ ...p, [voice.id]: e.target.value }))
                  }
                  className="text-xs h-8 bg-background/60"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 shrink-0"
                  disabled={testingId === voice.id}
                  onClick={() => handleTestSynthesis(voice.id, voice.elevenlabs_voice_id)}
                >
                  {testingId === voice.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Play className="h-3 w-3" />
                  )}
                  Sprechen
                </Button>
              </div>
            </div>

            <p className="text-[10px] text-muted-foreground">
              Erstellt: {new Date(voice.created_at).toLocaleDateString('de-DE')}
            </p>
          </Card>
        ))}

        {voices.length === 0 && !loading && (
          <div className="col-span-full p-12 text-center">
            <Mic className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">Keine Custom Voices</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Erstelle deine erste Custom Voice durch Voice Cloning. Du kannst diese danach in der
              Motion Studio Library deinen Charakteren zuweisen.
            </p>
            <Button onClick={() => setShowCloneDialog(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Erste Voice erstellen
            </Button>
          </div>
        )}
      </div>

      <VoiceCloneDialog open={showCloneDialog} onOpenChange={setShowCloneDialog} />
    </Card>
  );
}
