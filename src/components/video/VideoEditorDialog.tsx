import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useVideoEditor } from '@/hooks/useVideoEditor';
import { useChangeDetection } from '@/hooks/useChangeDetection';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { VideoCreation } from '@/types/video';
import { Loader2, AlertCircle, Save, Eye } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { VideoPreviewComparison } from './VideoPreviewComparison';
import { ScriptEditor } from './ScriptEditor';
import { VoiceOverEditor } from './VoiceOverEditor';

interface VideoEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  video: VideoCreation;
}

export const VideoEditorDialog = ({ open, onOpenChange, video }: VideoEditorDialogProps) => {
  const [script, setScript] = useState('');
  const [voiceStyle, setVoiceStyle] = useState('9BWtsMINqrJLrRacOk9x');
  const [voiceSpeed, setVoiceSpeed] = useState(1.0);
  const [subtitles, setSubtitles] = useState(true);
  const [quality, setQuality] = useState('1080p');
  
  const { editVideo, loading } = useVideoEditor();
  const { toast } = useToast();

  const initialValues = {
    script_text: video?.customizations?.script_text || '',
    voice_style: video?.customizations?.voice_style || '9BWtsMINqrJLrRacOk9x',
    voice_speed: Number(video?.customizations?.voice_speed) || 1.0,
    enable_subtitles: video?.customizations?.enable_subtitles !== false,
    quality: video?.customizations?.quality || '1080p',
  };

  const { hasChanges, changedFields, changeCount, estimatedCost, updateValue, resetChanges } = useChangeDetection({ initialValues });

  useEffect(() => {
    if (open && video) {
      setScript(String(video.customizations?.script_text || ''));
      setVoiceStyle(String(video.customizations?.voice_style || '9BWtsMINqrJLrRacOk9x'));
      setVoiceSpeed(Number(video.customizations?.voice_speed) || 1.0);
      setSubtitles(Boolean(video.customizations?.enable_subtitles !== false));
      setQuality(String(video.customizations?.quality || '1080p'));
    }
  }, [open, video]);

  const handleSave = async () => {
    if (!video || !hasChanges) return;
    const result = await editVideo({
      originalVideoId: video.id,
      customizations: { script_text: script, voice_style: voiceStyle, voice_speed: voiceSpeed, enable_subtitles: subtitles, quality },
    });
    if (result) {
      toast({ title: "Video wird generiert", description: `Version ${result.version_number} wird erstellt.` });
      onOpenChange(false);
    }
  };

  const handleClose = () => {
    if (hasChanges && !window.confirm(`${changeCount} ungespeicherte Änderung(en). Schließen?`)) return;
    onOpenChange(false);
  };

  useKeyboardShortcuts({ onSave: handleSave, onClose: handleClose }, open);
  useEffect(() => { updateValue('script_text', script); }, [script, updateValue]);
  useEffect(() => { updateValue('voice_style', voiceStyle); }, [voiceStyle, updateValue]);
  useEffect(() => { updateValue('voice_speed', voiceSpeed); }, [voiceSpeed, updateValue]);
  useEffect(() => { updateValue('enable_subtitles', subtitles); }, [subtitles, updateValue]);
  useEffect(() => { updateValue('quality', quality); }, [quality, updateValue]);

  if (!video) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Video bearbeiten</DialogTitle>
          <DialogDescription>Neue Version mit angepassten Einstellungen erstellen</DialogDescription>
        </DialogHeader>

        {hasChanges && (
          <Alert className="border-primary/50 bg-primary/5">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{changeCount} Änderung(en) - {estimatedCost} Credits</AlertTitle>
          </Alert>
        )}

        <Tabs defaultValue="preview" className="flex-1 overflow-y-auto">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="preview"><Eye className="h-4 w-4 mr-2" />Preview</TabsTrigger>
            <TabsTrigger value="script">Skript</TabsTrigger>
            <TabsTrigger value="voice">Voice-Over</TabsTrigger>
            <TabsTrigger value="options">Optionen</TabsTrigger>
          </TabsList>

          <TabsContent value="preview" className="mt-4"><VideoPreviewComparison originalUrl={video.output_url} isGenerating={loading} /></TabsContent>
          <TabsContent value="script" className="mt-4"><ScriptEditor value={script} onChange={setScript} maxLength={500} showAIAssist /></TabsContent>
          <TabsContent value="voice" className="mt-4"><VoiceOverEditor voiceStyle={voiceStyle} voiceSpeed={voiceSpeed} scriptText={script} onVoiceStyleChange={setVoiceStyle} onVoiceSpeedChange={setVoiceSpeed} /></TabsContent>
          <TabsContent value="options" className="mt-4 space-y-4">
            <div className="flex items-center justify-between">
              <Label>Untertitel</Label>
              <Switch checked={subtitles} onCheckedChange={setSubtitles} />
            </div>
            <div className="space-y-2">
              <Label>Video-Qualität</Label>
              <Select value={quality} onValueChange={setQuality}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="720p">HD (720p)</SelectItem>
                  <SelectItem value="1080p">Full HD (1080p)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={handleClose}>Abbrechen</Button>
          <Button onClick={handleSave} disabled={loading || !hasChanges}>
            {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generiere...</> : <><Save className="mr-2 h-4 w-4" />Neue Version</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
