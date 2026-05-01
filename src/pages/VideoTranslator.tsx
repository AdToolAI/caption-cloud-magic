import { useState, useCallback, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, Languages, Play, Download, RotateCcw, Check, Loader2, AlertCircle, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { useVideoTranslation, TranslationStatus } from '@/hooks/useVideoTranslation';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from '@/hooks/useTranslation';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

const LANGUAGES = [
  { value: 'de', label: '🇩🇪 Deutsch' },
  { value: 'en', label: '🇺🇸 English' },
  { value: 'es', label: '🇪🇸 Español' },
  { value: 'fr', label: '🇫🇷 Français' },
  { value: 'it', label: '🇮🇹 Italiano' },
  { value: 'pt', label: '🇵🇹 Português' },
  { value: 'zh', label: '🇨🇳 中文' },
  { value: 'ja', label: '🇯🇵 日本語' },
  { value: 'ko', label: '🇰🇷 한국어' },
  { value: 'ar', label: '🇸🇦 العربية' },
  { value: 'hi', label: '🇮🇳 हिन्दी' },
  { value: 'ru', label: '🇷🇺 Русский' },
  { value: 'tr', label: '🇹🇷 Türkçe' },
  { value: 'nl', label: '🇳🇱 Nederlands' },
  { value: 'pl', label: '🇵🇱 Polski' },
  { value: 'sv', label: '🇸🇪 Svenska' },
];

import { useTrackPageFeature } from "@/hooks/useTrackPageFeature";

export default function VideoTranslator() {
  useTrackPageFeature("video_translator");
  const { user } = useAuth();
  const { t } = useTranslation();
  const { status, translation, progressPercent, startTranslation, reset } = useVideoTranslation();
  const [targetLanguage, setTargetLanguage] = useState('en');
  const [voiceId, setVoiceId] = useState('');
  const [includeSubtitles, setIncludeSubtitles] = useState(true);
  const [videoUrl, setVideoUrl] = useState('');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const voices = useMemo(() => [
    { value: 'EXAVITQu4vr4xnSDxMaL', label: `Sarah (${t('vidTrans.female')})` },
    { value: 'JBFqnCBsd6RMkjVDRZzb', label: `George (${t('vidTrans.male')})` },
    { value: 'CwhRBWXzGAHq8TQ4Fs17', label: `Roger (${t('vidTrans.male')})` },
    { value: 'FGY2WhTYpPnrIDTdsKH5', label: `Laura (${t('vidTrans.female')})` },
    { value: 'onwK4e9ZLuTAKqWW03F9', label: `Daniel (${t('vidTrans.male')})` },
    { value: 'pFZP5JQG7iQjIQuC4Bku', label: `Lily (${t('vidTrans.female')})` },
  ], [t]);

  const steps: { status: TranslationStatus; label: string }[] = useMemo(() => [
    { status: 'transcribing', label: t('vidTrans.stepTranscription') },
    { status: 'translating', label: t('vidTrans.stepTranslation') },
    { status: 'generating', label: t('vidTrans.stepVoiceover') },
    { status: 'rendering', label: t('vidTrans.stepMerge') },
    { status: 'completed', label: t('vidTrans.stepDone') },
  ], [t]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      setVideoFile(file);
      setVideoUrl('');
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'video/*': ['.mp4', '.mov', '.avi', '.webm', '.mkv'] },
    maxFiles: 1,
    maxSize: 500 * 1024 * 1024,
  });

  const handleStart = async () => {
    if (!user) return;

    let finalVideoUrl = videoUrl;

    if (videoFile && !videoUrl) {
      setUploading(true);
      const ext = videoFile.name.split('.').pop();
      const path = `${user.id}/${Date.now()}_translate.${ext}`;

      const { error } = await supabase.storage
        .from('video-assets')
        .upload(path, videoFile, { contentType: videoFile.type, upsert: false });

      if (error) {
        setUploading(false);
        return;
      }

      const { data: { publicUrl } } = supabase.storage.from('video-assets').getPublicUrl(path);
      finalVideoUrl = publicUrl;
      setUploading(false);
    }

    if (!finalVideoUrl) return;

    await startTranslation({
      video_url: finalVideoUrl,
      target_language: targetLanguage,
      voice_id: voiceId || undefined,
      include_subtitles: includeSubtitles,
    });
  };

  const isProcessing = ['uploading', 'transcribing', 'translating', 'generating', 'rendering'].includes(status);
  const currentStepIndex = steps.findIndex(s => s.status === status);

  return (
    <div className="container max-w-4xl mx-auto py-8 px-4 space-y-8">
      {/* Hero */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium">
          <Languages className="h-4 w-4" />
          {t('vidTrans.badge')}
        </div>
        <h1 className="text-3xl font-bold tracking-tight">{t('vidTrans.title')}</h1>
        <p className="text-muted-foreground max-w-xl mx-auto">
          {t('vidTrans.description')}
        </p>
      </div>

      {/* Input Area */}
      {status === 'idle' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('vidTrans.selectVideo')}</CardTitle>
            <CardDescription>{t('vidTrans.selectVideoDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Dropzone */}
            <div
              {...getRootProps()}
              className={cn(
                'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors',
                isDragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50',
                videoFile && 'border-primary bg-primary/5'
              )}
            >
              <input {...getInputProps()} />
              {videoFile ? (
                <div className="space-y-2">
                  <Play className="h-8 w-8 mx-auto text-primary" />
                  <p className="font-medium">{videoFile.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {(videoFile.size / (1024 * 1024)).toFixed(1)} MB
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                  <p className="font-medium">{t('vidTrans.dropVideo')}</p>
                  <p className="text-sm text-muted-foreground">{t('vidTrans.dropFormats')}</p>
                </div>
              )}
            </div>

            {/* OR URL */}
            <div className="flex items-center gap-4">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">{t('vidTrans.or')}</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <div>
              <Label>{t('vidTrans.videoUrl')}</Label>
              <Input
                placeholder="https://example.com/video.mp4"
                value={videoUrl}
                onChange={(e) => { setVideoUrl(e.target.value); setVideoFile(null); }}
              />
            </div>

            {/* Settings */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('vidTrans.targetLanguage')}</Label>
                <Select value={targetLanguage} onValueChange={setTargetLanguage}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map(l => (
                      <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t('vidTrans.voiceOptional')}</Label>
                <Select value={voiceId} onValueChange={setVoiceId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('vidTrans.defaultVoice')} />
                  </SelectTrigger>
                  <SelectContent>
                    {voices.map(v => (
                      <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Switch checked={includeSubtitles} onCheckedChange={setIncludeSubtitles} />
              <Label>{t('vidTrans.generateSubtitles')}</Label>
            </div>

            <Button
              onClick={handleStart}
              disabled={(!videoFile && !videoUrl) || uploading}
              className="w-full"
              size="lg"
            >
              {uploading ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> {t('vidTrans.uploading')}</>
              ) : (
                <><Languages className="h-4 w-4 mr-2" /> {t('vidTrans.startTranslation')}</>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Progress */}
      {isProcessing && (
        <Card>
          <CardContent className="py-8 space-y-6">
            <div className="text-center space-y-2">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
              <h3 className="font-semibold text-lg">{t('vidTrans.translating')}</h3>
              <p className="text-sm text-muted-foreground">
                {status === 'transcribing' && t('vidTrans.statusTranscribing')}
                {status === 'translating' && t('vidTrans.statusTranslating')}
                {status === 'generating' && t('vidTrans.statusGenerating')}
                {status === 'rendering' && t('vidTrans.statusRendering')}
                {status === 'uploading' && t('vidTrans.statusUploading')}
              </p>
            </div>

            <Progress value={progressPercent} className="h-2" />

            {/* Step indicators */}
            <div className="flex items-center justify-between">
              {steps.map((step, i) => {
                const isCompleted = currentStepIndex > i;
                const isCurrent = currentStepIndex === i;
                return (
                  <div key={step.status} className="flex flex-col items-center flex-1">
                    <div className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center mb-1 border-2 transition-all',
                      isCompleted && 'bg-primary border-primary text-primary-foreground',
                      isCurrent && 'bg-primary/10 border-primary animate-pulse',
                      !isCompleted && !isCurrent && 'bg-muted border-muted-foreground/20 text-muted-foreground',
                    )}>
                      {isCompleted ? <Check className="w-4 h-4" /> :
                        isCurrent ? <Loader2 className="w-4 h-4 animate-spin" /> :
                        <span className="text-xs">{i + 1}</span>}
                    </div>
                    <span className={cn('text-xs text-center', isCurrent ? 'text-foreground font-medium' : 'text-muted-foreground')}>
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>

            <p className="text-center text-sm text-muted-foreground">{progressPercent}% {t('vidTrans.percentComplete')}</p>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {status === 'failed' && (
        <Card className="border-destructive/50">
          <CardContent className="py-8 text-center space-y-4">
            <AlertCircle className="h-10 w-10 mx-auto text-destructive" />
            <h3 className="font-semibold text-lg">{t('vidTrans.errorTitle')}</h3>
            <p className="text-sm text-muted-foreground">{translation?.error_message || t('vidTrans.errorDefault')}</p>
            <Button variant="outline" onClick={reset}>
              <RotateCcw className="h-4 w-4 mr-2" /> {t('vidTrans.retry')}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Result */}
      {status === 'completed' && translation && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Check className="h-5 w-5 text-primary" />
              {t('vidTrans.resultTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Transcript comparison */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-muted-foreground">{t('vidTrans.originalText')} ({translation.source_language})</Label>
                <div className="p-3 rounded-lg bg-muted/50 text-sm max-h-40 overflow-y-auto">
                  {translation.original_transcript || t('vidTrans.notAvailable')}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-primary font-medium">{t('vidTrans.translationLabel')} ({translation.target_language})</Label>
                <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-sm max-h-40 overflow-y-auto">
                  {translation.translated_transcript || t('vidTrans.notAvailable')}
                </div>
              </div>
            </div>

            {/* Audio player */}
            {translation.voiceover_url && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Volume2 className="h-4 w-4" /> Voiceover
                </Label>
                <audio controls className="w-full" src={translation.voiceover_url} />
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-3">
              {translation.voiceover_url && (
                <Button asChild variant="outline">
                  <a href={translation.voiceover_url} download target="_blank" rel="noopener noreferrer">
                    <Download className="h-4 w-4 mr-2" /> {t('vidTrans.downloadVoiceover')}
                  </a>
                </Button>
              )}
              <Button variant="outline" onClick={reset}>
                <RotateCcw className="h-4 w-4 mr-2" /> {t('vidTrans.newTranslation')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
