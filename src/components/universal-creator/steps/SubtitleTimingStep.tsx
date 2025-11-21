import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Loader2, Wand2, Play, Pause, Edit2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { SubtitleConfig, SubtitleSegment, SubtitleStyle } from '@/types/universal-creator';
import { Input } from '@/components/ui/input';
import { SubtitleStyleEditor } from '@/components/video/SubtitleStyleEditor';

interface SubtitleTimingStepProps {
  audioUrl?: string;
  subtitleConfig?: SubtitleConfig;
  onSubtitleConfigChange: (config: SubtitleConfig) => void;
}

const defaultStyle: SubtitleStyle = {
  position: 'bottom',
  font: 'Inter',
  fontSize: 48,
  color: '#ffffff',
  backgroundColor: '#000000',
  backgroundOpacity: 0.5,
  animation: 'fade',
  outlineStyle: 'stroke',
  outlineColor: '#000000',
  outlineWidth: 2,
};

export function SubtitleTimingStep({
  audioUrl,
  subtitleConfig,
  onSubtitleConfigChange,
}: SubtitleTimingStepProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [editingSegment, setEditingSegment] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  const handleGenerateSubtitles = async () => {
    if (!audioUrl) {
      toast.error('Kein Audio vorhanden. Bitte generiere zuerst einen Voice-over.');
      return;
    }

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-subtitles', {
        body: { audioUrl },
      });

      if (error) throw error;

      if (data?.subtitles) {
        onSubtitleConfigChange({
          segments: data.subtitles,
          style: subtitleConfig?.style || defaultStyle,
        });
        toast.success(`${data.subtitles.length} Untertitel-Segmente erfolgreich generiert!`);
      }
    } catch (error: any) {
      console.error('Error generating subtitles:', error);
      toast.error(`Fehler: ${error.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleEditSegment = (segment: SubtitleSegment) => {
    setEditingSegment(segment.id);
    setEditText(segment.text);
  };

  const handleSaveEdit = (segmentId: string) => {
    if (!subtitleConfig) return;

    const updatedSegments = subtitleConfig.segments.map(seg =>
      seg.id === segmentId ? { ...seg, text: editText } : seg
    );

    onSubtitleConfigChange({
      ...subtitleConfig,
      segments: updatedSegments,
    });

    setEditingSegment(null);
    toast.success('Untertitel aktualisiert');
  };

  const handleDeleteSegment = (segmentId: string) => {
    if (!subtitleConfig) return;

    const updatedSegments = subtitleConfig.segments.filter(seg => seg.id !== segmentId);
    onSubtitleConfigChange({
      ...subtitleConfig,
      segments: updatedSegments,
    });

    toast.success('Segment gelöscht');
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(2);
    return `${mins}:${secs.padStart(5, '0')}`;
  };

  const getCurrentSegment = () => {
    return subtitleConfig?.segments.find(
      seg => currentTime >= seg.startTime && currentTime <= seg.endTime
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Untertitel & Timing</h2>
          <p className="text-muted-foreground">
            Generiere automatisch Untertitel und passe das Styling an
          </p>
        </div>
        <Button
          onClick={handleGenerateSubtitles}
          disabled={isGenerating || !audioUrl}
          size="lg"
        >
          {isGenerating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generiere...
            </>
          ) : (
            <>
              <Wand2 className="mr-2 h-4 w-4" />
              Untertitel generieren
            </>
          )}
        </Button>
      </div>

      {!audioUrl && (
        <Card className="p-6 bg-muted/50">
          <p className="text-center text-muted-foreground">
            Bitte generiere zuerst einen Voice-over im vorherigen Schritt
          </p>
        </Card>
      )}

      {audioUrl && !subtitleConfig?.segments.length && (
        <Card className="p-6 bg-muted/50">
          <p className="text-center text-muted-foreground">
            Klicke auf "Untertitel generieren", um automatisch Untertitel aus dem Audio zu erstellen
          </p>
        </Card>
      )}

      {subtitleConfig?.segments && subtitleConfig.segments.length > 0 && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Subtitle Segments */}
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">
                  Untertitel-Segmente ({subtitleConfig.segments.length})
                </h3>
              </div>

              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {subtitleConfig.segments.map((segment) => (
                  <Card
                    key={segment.id}
                    className={`p-4 ${
                      getCurrentSegment()?.id === segment.id
                        ? 'border-primary bg-primary/5'
                        : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 space-y-2">
                        <div className="text-xs text-muted-foreground">
                          {formatTime(segment.startTime)} → {formatTime(segment.endTime)}
                        </div>
                        {editingSegment === segment.id ? (
                          <div className="space-y-2">
                            <Input
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              className="w-full"
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => handleSaveEdit(segment.id)}
                              >
                                Speichern
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditingSegment(null)}
                              >
                                Abbrechen
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm">{segment.text}</p>
                        )}
                      </div>
                      {editingSegment !== segment.id && (
                        <div className="flex gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleEditSegment(segment)}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleDeleteSegment(segment.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </Card>

            {/* Subtitle Style Editor */}
            <div>
              <SubtitleStyleEditor
                style={subtitleConfig.style}
                onChange={(style) =>
                  onSubtitleConfigChange({
                    ...subtitleConfig,
                    style,
                  })
                }
                sampleText={getCurrentSegment()?.text || 'Beispiel Untertitel'}
                onSampleTextChange={() => {}}
              />
            </div>
          </div>

          {/* Audio Player Preview */}
          {audioUrl && (
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Audio-Vorschau</h3>
              <audio
                src={audioUrl}
                controls
                className="w-full"
                onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
              />
              {getCurrentSegment() && (
                <div className="mt-4 p-4 bg-muted rounded-lg">
                  <p className="text-sm font-medium mb-2">Aktueller Untertitel:</p>
                  <p className="text-lg" style={{
                    fontFamily: subtitleConfig.style.font,
                    color: subtitleConfig.style.color,
                  }}>
                    {getCurrentSegment()?.text}
                  </p>
                </div>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
