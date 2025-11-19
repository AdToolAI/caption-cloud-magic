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
import { VideoCreation, ScriptSegment } from '@/types/video';
import { Loader2, AlertCircle, Save, Eye, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { VideoPreviewComparison } from './VideoPreviewComparison';
import { ScriptEditor } from './ScriptEditor';
import { VoiceOverEditor } from './VoiceOverEditor';
import { MediaEditor } from './MediaEditor';
import { BatchEditDialog } from './BatchEditDialog';
import { VideoQuickPreview } from './VideoQuickPreview';
import { VideoTimeline } from './VideoTimeline';
import { SubtitleStyleEditor, SubtitleStyle } from './SubtitleStyleEditor';
import { ExportOptionsEditor, ExportOptions } from './ExportOptionsEditor';
import { TimelineScriptEditor } from './TimelineScriptEditor';

interface VideoEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  video: VideoCreation;
}

export const VideoEditorDialog = ({ open, onOpenChange, video }: VideoEditorDialogProps) => {
  const [script, setScript] = useState('');
  const [scriptSegments, setScriptSegments] = useState<ScriptSegment[]>([]);
  const [totalVideoDuration, setTotalVideoDuration] = useState(30);
  const [voiceStyle, setVoiceStyle] = useState('9BWtsMINqrJLrRacOk9x');
  const [voiceSpeed, setVoiceSpeed] = useState(1.0);
  const [subtitles, setSubtitles] = useState(true);
  const [quality, setQuality] = useState('1080p');
  const [mediaUrl, setMediaUrl] = useState('');
  const [showBatchEdit, setShowBatchEdit] = useState(false);
  const [showQuickPreview, setShowQuickPreview] = useState(false);
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);

  // Filter states (lifted from MediaEditor for preview)
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [grayscale, setGrayscale] = useState(0);
  const [sepia, setSepia] = useState(0);
  const [hueRotate, setHueRotate] = useState(0);
  
  // Phase 3C: Timeline, Subtitle Styles, Export Options
  const [timelineClips, setTimelineClips] = useState<Array<{
    id: string;
    type: 'intro' | 'main' | 'outro' | 'custom';
    duration: number;
    transition: 'none' | 'fade' | 'wipe' | 'zoom';
    content: string;
  }>>([
    { id: 'clip-1', type: 'intro', duration: 3, transition: 'fade', content: 'Intro Scene' },
    { id: 'clip-2', type: 'main', duration: 8, transition: 'none', content: 'Main Content' },
    { id: 'clip-3', type: 'outro', duration: 3, transition: 'fade', content: 'Outro Scene' },
  ]);
  
  const [subtitlePreviewText, setSubtitlePreviewText] = useState('Beispiel-Untertitel');
  
  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyle>({
    position: 'bottom',
    font: 'Inter',
    fontSize: 24,
    color: '#FFFFFF',
    backgroundColor: '#000000',
    backgroundOpacity: 0.7,
    animation: 'fade',
    outline: true,
    outlineColor: '#000000',
  });
  
  const [exportOptions, setExportOptions] = useState<ExportOptions>({
    format: 'mp4',
    aspectRatio: '16:9',
    quality: '1080p',
    fps: 30,
    includeWatermark: false,
    includeEndScreen: true,
  });
  
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

  const calculateSegmentDuration = (text: string, speed: number): number => {
    const words = text.trim().split(/\s+/).filter(w => w.length > 0).length;
    if (words === 0) return 3;
    const baseWordsPerMinute = 150;
    const adjustedWPM = baseWordsPerMinute * speed;
    return Math.max(1, (words / adjustedWPM) * 60);
  };

  useEffect(() => {
    if (open && video) {
      // Extract media URLs from multiple sources
      const extractMediaUrls = () => {
        // 1. Try PRODUCT_IMAGE from customizations
        const productImages = video.customizations?.PRODUCT_IMAGE;
        if (productImages) {
          try {
            const parsed = JSON.parse(productImages as string);
            return Array.isArray(parsed) ? parsed : [parsed];
          } catch {
            return [productImages as string];
          }
        }
        
        // 2. Try media_assets array
        if (video.media_assets && Array.isArray(video.media_assets) && video.media_assets.length > 0) {
          return video.media_assets
            .filter((asset: any) => asset.type === 'image')
            .sort((a: any, b: any) => (a.order || 0) - (b.order || 0))
            .map((asset: any) => asset.url);
        }
        
        // 3. No media found - return empty array (preview will still work!)
        return [];
      };
      
      setMediaUrls(extractMediaUrls());
      
      // Handle script - check for segments first, then fall back to plain text
      const segmentsData = video.customizations?.script_segments;
      if (segmentsData && typeof segmentsData === 'string') {
        try {
          const parsed = JSON.parse(segmentsData);
          setScriptSegments(parsed);
          setScript(parsed.map((s: ScriptSegment) => s.text).join(' '));
        } catch {
          // Fall back to plain text
          const plainText = String(video.customizations?.script_text || '');
          setScript(plainText);
          if (plainText.trim()) {
            const duration = calculateSegmentDuration(plainText, Number(video.customizations?.voice_speed || 1.0));
            setScriptSegments([{
              id: 'segment-initial',
              text: plainText,
              startTime: 0,
              duration,
              voiceSettings: {
                voiceId: String(video.customizations?.voice_style || '9BWtsMINqrJLrRacOk9x'),
                speed: Number(video.customizations?.voice_speed || 1.0)
              },
              locked: false
            }]);
          } else {
            setScriptSegments([]);
          }
        }
      } else {
        // Plain text format (legacy)
        const plainText = String(video.customizations?.script_text || '');
        setScript(plainText);
        if (plainText.trim()) {
          const duration = calculateSegmentDuration(plainText, Number(video.customizations?.voice_speed || 1.0));
          setScriptSegments([{
            id: 'segment-initial',
            text: plainText,
            startTime: 0,
            duration,
            voiceSettings: {
              voiceId: String(video.customizations?.voice_style || '9BWtsMINqrJLrRacOk9x'),
              speed: Number(video.customizations?.voice_speed || 1.0)
            },
            locked: false
          }]);
        } else {
          setScriptSegments([]);
        }
      }
      
      setVoiceStyle(String(video.customizations?.voice_style || '9BWtsMINqrJLrRacOk9x'));
      setVoiceSpeed(Number(video.customizations?.voice_speed) || 1.0);
      setSubtitles(Boolean(video.customizations?.enable_subtitles !== false));
      setQuality(String(video.customizations?.quality || '1080p'));
      
      const durationData = video.customizations?.total_duration;
      setTotalVideoDuration(durationData ? Number(durationData) : 30);
      
      // Initialize filter states
      setBrightness(Number(video.customizations?.BRIGHTNESS) || 100);
      setContrast(Number(video.customizations?.CONTRAST) || 100);
      setSaturation(Number(video.customizations?.SATURATION) || 100);
      setGrayscale(Number(video.customizations?.GRAYSCALE) || 0);
      setSepia(Number(video.customizations?.SEPIA) || 0);
      setHueRotate(Number(video.customizations?.HUE_ROTATE) || 0);
      
      // Initialize subtitle preview with start of script
      if (video.customizations?.script_text) {
        const firstLine = String(video.customizations.script_text).split('\n')[0];
        setSubtitlePreviewText(firstLine?.slice(0, 60) || 'Beispiel-Untertitel');
      }
    }
  }, [open, video]);

  const handleSave = async () => {
    if (!video || !hasChanges) return;
    
    console.log('[VideoEditor] Saving with customizations:', {
      script_text: script,
      voice_style: voiceStyle,
      voice_speed: voiceSpeed,
      scriptLength: script.length,
      enable_subtitles: subtitles,
      quality
    });
    
    const result = await editVideo({
      originalVideoId: video.id,
      customizations: {
        script_text: script,
        script_segments: JSON.stringify(scriptSegments),
        total_duration: totalVideoDuration,
        voice_style: voiceStyle,
        voice_speed: voiceSpeed,
        enable_subtitles: subtitles,
        quality
      },
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
          <TabsList className="grid w-full grid-cols-9">
            <TabsTrigger value="preview"><Eye className="h-4 w-4 mr-2" />Preview</TabsTrigger>
            <TabsTrigger value="script">Skript</TabsTrigger>
            <TabsTrigger value="timeline-editor">📹 Timeline</TabsTrigger>
            <TabsTrigger value="voice">Voice-Over</TabsTrigger>
            <TabsTrigger value="media">Medien</TabsTrigger>
            <TabsTrigger value="timeline">Video-Timeline</TabsTrigger>
            <TabsTrigger value="subtitles">Untertitel</TabsTrigger>
            <TabsTrigger value="export">Export</TabsTrigger>
            <TabsTrigger value="options">Optionen</TabsTrigger>
          </TabsList>

          <TabsContent value="preview" className="mt-4">
            <VideoPreviewComparison 
              originalUrl={video.output_url} 
              thumbnailUrl={video.thumbnail_url}
              isGenerating={loading} 
            />
          </TabsContent>
          <TabsContent value="script" className="mt-4"><ScriptEditor value={script} onChange={(newScript) => {
            setScript(newScript);
            if (scriptSegments.length === 1) {
              const duration = calculateSegmentDuration(newScript, voiceSpeed);
              setScriptSegments([{
                ...scriptSegments[0],
                text: newScript,
                duration
              }]);
            }
          }} maxLength={500} showAIAssist /></TabsContent>
          
          <TabsContent value="timeline-editor" className="mt-4">
            <TimelineScriptEditor
              segments={scriptSegments}
              onSegmentsChange={(newSegments) => {
                setScriptSegments(newSegments);
                setScript(newSegments.map(s => s.text).join(' '));
              }}
              totalDuration={totalVideoDuration}
              voiceStyle={voiceStyle}
              voiceSpeed={voiceSpeed}
              mediaUrls={mediaUrls}
            />
          </TabsContent>
          
          <TabsContent value="voice" className="mt-4"><VoiceOverEditor voiceStyle={voiceStyle} voiceSpeed={voiceSpeed} scriptText={script} onVoiceStyleChange={setVoiceStyle} onVoiceSpeedChange={setVoiceSpeed} /></TabsContent>
          <TabsContent value="media" className="mt-4">
            <MediaEditor 
              currentImageUrl={mediaUrl}
              onImageChange={setMediaUrl}
              brightness={brightness}
              onBrightnessChange={setBrightness}
              contrast={contrast}
              onContrastChange={setContrast}
              saturation={saturation}
              onSaturationChange={setSaturation}
              grayscale={grayscale}
              onGrayscaleChange={setGrayscale}
              sepia={sepia}
              onSepiaChange={setSepia}
              hueRotate={hueRotate}
              onHueRotateChange={setHueRotate}
            />
          </TabsContent>
          <TabsContent value="timeline" className="mt-4"><VideoTimeline clips={timelineClips} onClipsChange={setTimelineClips} /></TabsContent>
          <TabsContent value="subtitles" className="mt-4">
            <SubtitleStyleEditor 
              style={subtitleStyle} 
              onChange={setSubtitleStyle}
              sampleText={subtitlePreviewText}
              onSampleTextChange={setSubtitlePreviewText}
            />
          </TabsContent>
          <TabsContent value="export" className="mt-4"><ExportOptionsEditor options={exportOptions} onChange={setExportOptions} /></TabsContent>
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

        <DialogFooter className="flex justify-between items-center border-t pt-4">
          <Button variant="outline" onClick={() => setShowBatchEdit(true)}>
            Batch-Edit
          </Button>
          
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleClose}>
              Abbrechen
            </Button>
            
            <Button 
              variant="secondary"
              onClick={() => setShowQuickPreview(true)}
              disabled={!script || loading}
              title={mediaUrls.length === 0 ? "⚠️ Keine Medien - Vorschau zeigt nur Text/Audio" : "Schnelle kostenlose Vorschau deines Videos"}
            >
              <Eye className="mr-2 h-4 w-4" />
              Schnelle Vorschau
            </Button>
            
            <Button onClick={handleSave} disabled={loading || !hasChanges}>
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generiere...</> : <><Save className="mr-2 h-4 w-4" />Neue Version ({estimatedCost} Credits)</>}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>

      {/* Batch Edit Dialog */}
      <BatchEditDialog
        open={showBatchEdit}
        onOpenChange={setShowBatchEdit}
        video={video}
      />

      {/* Quick Preview Dialog */}
      <Dialog open={showQuickPreview} onOpenChange={setShowQuickPreview}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Schnelle Vorschau</DialogTitle>
            <DialogDescription>
              Diese Vorschau zeigt eine Simulation deines Videos. Die finale Version wird in höherer 
              Qualität und mit professionellen Transitions gerendert.
            </DialogDescription>
          </DialogHeader>
          
          <VideoQuickPreview
            script={script}
            scriptSegments={scriptSegments}
            mediaUrls={mediaUrls}
            voiceStyle={voiceStyle}
            voiceSpeed={voiceSpeed}
            filters={{
              brightness,
              contrast,
              saturation,
              grayscale,
              sepia,
              hueRotate
            }}
            subtitles={{
              enabled: subtitles,
              style: subtitleStyle
            }}
          />
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowQuickPreview(false)}
            >
              Zurück zum Editor
            </Button>
            <Button 
              onClick={() => {
                setShowQuickPreview(false);
                handleSave();
              }}
              disabled={!hasChanges}
            >
              <Check className="mr-2 h-4 w-4" />
              Sieht gut aus - Jetzt rendern ({estimatedCost} Credits)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
};
