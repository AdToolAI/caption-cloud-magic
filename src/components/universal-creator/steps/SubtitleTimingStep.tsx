import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Loader2, Wand2, Play, Pause, Edit2, Trash2, Info } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { SubtitleConfig, SubtitleSegment, SubtitleStyle } from '@/types/universal-creator';
import { Input } from '@/components/ui/input';
import { SubtitleStyleEditor } from '@/components/video/SubtitleStyleEditor';
import { useTranslation } from '@/hooks/useTranslation';

interface SubtitleTimingStepProps {
  audioUrl?: string;
  subtitleConfig?: SubtitleConfig;
  onSubtitleConfigChange: (config: SubtitleConfig) => void;
}

const defaultStyle: SubtitleStyle = {
  position: 'bottom', font: 'Inter', fontSize: 48, color: '#ffffff',
  backgroundColor: '#000000', backgroundOpacity: 0.5, animation: 'fade',
  animationSpeed: 1, outlineStyle: 'stroke', outlineColor: '#000000', outlineWidth: 2,
};

export function SubtitleTimingStep({ audioUrl, subtitleConfig, onSubtitleConfigChange }: SubtitleTimingStepProps) {
  const { t } = useTranslation();
  const [isGenerating, setIsGenerating] = useState(false);
  const [editingSegment, setEditingSegment] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editStartTime, setEditStartTime] = useState(0);
  const [editEndTime, setEditEndTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  const handleGenerateSubtitles = async () => {
    if (!audioUrl) { toast.error(t('uc.noAudioGenVoiceFirst')); return; }
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-subtitles', { body: { audioUrl } });
      if (error) throw error;
      if (data?.subtitles) {
        onSubtitleConfigChange({ segments: data.subtitles, style: subtitleConfig?.style || defaultStyle });
        toast.success(`${data.subtitles.length} ${t('uc.subtitleSegmentsGenerated')}`);
      }
    } catch (error: any) {
      console.error('Error generating subtitles:', error);
      toast.error(`${t('uc.scriptError')}: ${error.message}`);
    } finally { setIsGenerating(false); }
  };

  const handleEditSegment = (segment: SubtitleSegment) => {
    setEditingSegment(segment.id); setEditText(segment.text);
    setEditStartTime(segment.startTime); setEditEndTime(segment.endTime);
  };

  const handleSaveEdit = (segmentId: string) => {
    if (!subtitleConfig) return;
    const updatedSegments = subtitleConfig.segments.map(seg => {
      if (seg.id !== segmentId) return seg;
      const newWords = editText.split(/\s+/).filter(Boolean).map((word, i, arr) => {
        const duration = (editEndTime - editStartTime) / arr.length;
        return { text: word, startTime: editStartTime + i * duration, endTime: editStartTime + (i + 1) * duration };
      });
      return { ...seg, text: editText, words: newWords, startTime: editStartTime, endTime: editEndTime };
    });
    onSubtitleConfigChange({ ...subtitleConfig, segments: updatedSegments });
    setEditingSegment(null);
    toast.success(t('uc.subtitleUpdated'));
  };

  const handleDeleteSegment = (segmentId: string) => {
    if (!subtitleConfig) return;
    onSubtitleConfigChange({ ...subtitleConfig, segments: subtitleConfig.segments.filter(seg => seg.id !== segmentId) });
    toast.success(t('uc.segmentDeleted'));
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(2);
    return `${mins}:${secs.padStart(5, '0')}`;
  };

  const getCurrentSegment = () => subtitleConfig?.segments.find(seg => currentTime >= seg.startTime && currentTime <= seg.endTime);

  if (!audioUrl) {
    return (
      <Card className="p-6">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Info className="w-5 h-5 text-blue-500" />
            <h3 className="text-lg font-semibold">{t('uc.subtitlesOptional')}</h3>
          </div>
          <p className="text-sm text-muted-foreground">{t('uc.noVoiceoverSubtitleMsg')}</p>
          <Button variant="outline" onClick={() => { onSubtitleConfigChange({ segments: [], style: defaultStyle }); toast.success(t('uc.subtitleStepSkipped')); }}>
            {t('uc.continueWithoutSubtitles')}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">{t('uc.subtitlesAndTiming')}</h2>
          <p className="text-muted-foreground">{t('uc.autoGenerateSubtitles')}</p>
        </div>
        <Button onClick={handleGenerateSubtitles} disabled={isGenerating || !audioUrl} size="lg">
          {isGenerating ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t('uc.generating')}</>) : (<><Wand2 className="mr-2 h-4 w-4" />{t('uc.generateSubtitles')}</>)}
        </Button>
      </div>

      {audioUrl && !subtitleConfig?.segments.length && (
        <Card className="p-6 bg-muted/50">
          <p className="text-center text-muted-foreground">{t('uc.clickGenerateSubtitles')}</p>
        </Card>
      )}

      {subtitleConfig?.segments && subtitleConfig.segments.length > 0 && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">{t('uc.subtitleSegments')} ({subtitleConfig.segments.length})</h3>
              </div>
              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {subtitleConfig.segments.map((segment) => (
                  <Card key={segment.id} className={`p-4 ${getCurrentSegment()?.id === segment.id ? 'border-primary bg-primary/5' : ''}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 space-y-2">
                        <div className="text-xs text-muted-foreground">{formatTime(segment.startTime)} → {formatTime(segment.endTime)}</div>
                        {editingSegment === segment.id ? (
                          <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-xs text-muted-foreground">{t('uc.startTime')}</label>
                                <Input type="number" step="0.01" min="0" value={editStartTime} onChange={(e) => setEditStartTime(parseFloat(e.target.value) || 0)} className="w-full" />
                              </div>
                              <div>
                                <label className="text-xs text-muted-foreground">{t('uc.endTime')}</label>
                                <Input type="number" step="0.01" min="0" value={editEndTime} onChange={(e) => setEditEndTime(parseFloat(e.target.value) || 0)} className="w-full" />
                              </div>
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground">{t('uc.text')}</label>
                              <Input value={editText} onChange={(e) => setEditText(e.target.value)} className="w-full" />
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" onClick={() => handleSaveEdit(segment.id)}>{t('uc.save')}</Button>
                              <Button size="sm" variant="outline" onClick={() => setEditingSegment(null)}>{t('uc.cancel')}</Button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm">{segment.text}</p>
                        )}
                      </div>
                      {editingSegment !== segment.id && (
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" onClick={() => handleEditSegment(segment)}><Edit2 className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" onClick={() => handleDeleteSegment(segment.id)}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </Card>
            <div>
              <SubtitleStyleEditor
                style={subtitleConfig.style}
                onChange={(style) => onSubtitleConfigChange({ ...subtitleConfig, style })}
                sampleText={getCurrentSegment()?.text || t('uc.sampleSubtitle')}
                onSampleTextChange={() => {}}
              />
            </div>
          </div>

          {audioUrl && (
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">{t('uc.audioPreviewSubtitles')}</h3>
              <audio src={audioUrl} controls className="w-full" onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} />
              {getCurrentSegment() && (
                <div className="mt-4 p-4 bg-muted rounded-lg">
                  <p className="text-sm font-medium mb-2">{t('uc.currentSubtitle')}</p>
                  <p className="text-lg" style={{ fontFamily: subtitleConfig.style.font, color: subtitleConfig.style.color }}>{getCurrentSegment()?.text}</p>
                </div>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
