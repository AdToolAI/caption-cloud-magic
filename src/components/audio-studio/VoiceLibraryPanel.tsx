import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mic, Plus, Trash2, Play, Pause } from 'lucide-react';
import { useCustomVoices } from '@/hooks/useCustomVoices';
import { VoiceCloneDialog } from '@/components/voice/VoiceCloneDialog';

export function VoiceLibraryPanel() {
  const { voices, loading, deleteVoice, toggleVoiceActive } = useCustomVoices();
  const [showCloneDialog, setShowCloneDialog] = useState(false);
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);

  const handleDelete = async (voice_id: string) => {
    if (confirm('Voice wirklich löschen?')) {
      await deleteVoice(voice_id);
    }
  };

  return (
    <Card className="backdrop-blur-xl bg-card/60 border-border/50 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold">Custom Voices</h3>
          <p className="text-sm text-muted-foreground">
            Verwalte deine geklonten Stimmen für Voiceovers
          </p>
        </div>
        <Button onClick={() => setShowCloneDialog(true)} size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          Voice klonen
        </Button>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {voices.map((voice) => (
          <Card key={voice.id} className="p-4 bg-muted/30 border-border/50">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center">
                  <Mic className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-semibold">{voice.name}</h4>
                  <Badge variant="secondary" className="text-xs">
                    {voice.language}
                  </Badge>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleDelete(voice.id)}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {voice.sample_urls.length} Audio-Samples
              </p>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-2"
                  onClick={() => {
                    if (playingVoice === voice.id) {
                      setPlayingVoice(null);
                    } else {
                      setPlayingVoice(voice.id);
                      const audio = new Audio(voice.sample_urls[0]);
                      audio.play();
                      audio.onended = () => setPlayingVoice(null);
                    }
                  }}
                >
                  {playingVoice === voice.id ? (
                    <Pause className="h-3 w-3" />
                  ) : (
                    <Play className="h-3 w-3" />
                  )}
                  Preview
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
            </div>

            <div className="mt-3 pt-3 border-t border-border/50">
              <p className="text-xs text-muted-foreground">
                Erstellt: {new Date(voice.created_at).toLocaleDateString('de-DE')}
              </p>
            </div>
          </Card>
        ))}

        {voices.length === 0 && !loading && (
          <div className="col-span-full p-12 text-center">
            <Mic className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">Keine Custom Voices</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Erstelle deine erste Custom Voice durch Voice Cloning
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
