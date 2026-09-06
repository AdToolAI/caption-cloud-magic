import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowUpCircle, Sparkles, Zap, AlertCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useTx } from '@/lib/i18nText';
import { useTranslation } from '@/hooks/useTranslation';
import { uiLocale } from '@/lib/uiLocale';
import { useEnhanceVideo } from '@/hooks/useEnhanceVideo';
import {
  ORDER_REJECTION_CODES,
  enhanceCopy,
  engineErrorText,
  toEnhanceLang,
} from '@/lib/videoEnhance/engineErrors';
import {
  evaluateUpscale,
  formatFrame,
  frameMeetsTarget,
  projectProviderOutput,
  resolveTargetFrame,
} from '@/lib/videoEnhance/targetFrame';
import {
  availableFps,
  availableResolutions,
  availableTiers,
  getVideoEnhanceModel,
  visibleVideoEnhanceModels,
  type EnhanceConfig,
  type VideoResolution,
} from '@/config/videoEnhanceModels';

/**
 * Director's Cut enhance panel.
 *
 * Simplified UX (Original / Recommended / High quality / Custom) on top of the
 * ONE central engine: registry + capability validation + pricing + wallet +
 * persistence all live behind `useEnhanceVideo` -> `video-enhance`.
 * The legacy `director-cut-upscale` function stays deployed as a rollback but
 * is no longer called from this UI.
 */

type Preset = 'original' | 'recommended' | 'high' | 'custom';

interface AIVideoUpscalingProps {
  videoUrl?: string;
  settings: {
    enabled: boolean;
    targetResolution: '2k' | '4k' | '8k';
    enhanceDetails: boolean;
    denoiseStrength: number;
    sharpnessBoost: number;
  };
  onSettingsChange: (settings: AIVideoUpscalingProps['settings']) => void;
  onUpscaleComplete?: (result: { job_id: string; status: string; output_url?: string }) => void;
}

/** Presets map onto the central configuration — no local pricing whatsoever. */
const PRESET_RESOLUTION: Record<Exclude<Preset, 'original' | 'custom'>, VideoResolution> = {
  recommended: '1080p',
  high: '4k',
};

export function AIVideoUpscaling({
  videoUrl,
  settings,
  onSettingsChange,
  onUpscaleComplete,
}: AIVideoUpscalingProps) {
  const tx = useTx();
  const { language } = useTranslation();
  const lang = toEnhanceLang(language);
  const [preset, setPreset] = useState<Preset>('recommended');

  const models = useMemo(() => visibleVideoEnhanceModels(), []);
  const [modelId, setModelId] = useState(models[0]?.id ?? '');
  const model = getVideoEnhanceModel(modelId);
  const [mode, setMode] = useState(model?.processingModes[0]?.id ?? 'standard');
  const [resolution, setResolution] = useState<VideoResolution>('1080p');
  const [fps, setFps] = useState<number | null>(null);

  const {
    run,
    estimate,
    sourceMeta,
    isStarting,
    isRunning,
    error,
    errorCode,
    previewPrice,
    startEnhance,
  } = useEnhanceVideo();

  // ---- promised frame, upscale rule and executing engine -------------------
  // The server measured the source during the price preview; the same rules
  // as the engine run here so the user sees the verdict BEFORE paying.
  const sourceWidth = sourceMeta?.width ?? 0;
  const sourceHeight = sourceMeta?.height ?? 0;
  const targetFrame = model && sourceWidth && sourceHeight
    ? resolveTargetFrame(resolution, sourceWidth, sourceHeight)
    : null;
  const upscale = targetFrame
    ? evaluateUpscale(targetFrame, { width: sourceWidth, height: sourceHeight })
    : null;
  const executionModelId = model && targetFrame
    ? (frameMeetsTarget(
        projectProviderOutput(model.id, resolution, sourceWidth, sourceHeight),
        targetFrame,
      )
        ? model.id
        : models.find((m) =>
            frameMeetsTarget(
              projectProviderOutput(m.id, resolution, sourceWidth, sourceHeight),
              targetFrame,
            ),
          )?.id ?? null)
    : model?.id ?? null;
  const routedModel = model && executionModelId && executionModelId !== model.id
    ? models.find((m) => m.id === executionModelId) ?? null
    : null;
  const frameUnreachable = targetFrame != null && executionModelId === null;
  const blockedReason = upscale && !upscale.ok
    ? enhanceCopy(upscale.reason === 'downscale' ? 'downscale' : 'notAnUpscale', lang)
    : frameUnreachable
      ? enhanceCopy('unreachable', lang)
      : null;
  // A rejected price preview (e.g. the server's upscale gate) also blocks the
  // start button — the server would refuse anyway, but the user should not
  // have to click to learn that.
  const orderRejected = !!errorCode && ORDER_REJECTION_CODES.has(errorCode);

  // Presets simply preselect the central configuration.
  useEffect(() => {
    if (preset === 'recommended' || preset === 'high') {
      setResolution(PRESET_RESOLUTION[preset]);
      setFps(null);
    }
  }, [preset]);

  // Never leave the capabilities the selected engine really supports.
  useEffect(() => {
    if (!model) return;
    const nextMode = model.processingModes.some((m) => m.id === mode)
      ? mode
      : model.processingModes[0].id;
    if (nextMode !== mode) setMode(nextMode);
    const resolutions = availableResolutions(model, nextMode);
    if (!resolutions.includes(resolution)) setResolution(resolutions[0]);
  }, [model, mode, resolution]);

  const fpsChoices = model ? availableFps(model, mode, resolution) : [];
  useEffect(() => {
    if (fps !== null && !fpsChoices.includes(fps)) setFps(null);
  }, [fps, fpsChoices]);

  const config: EnhanceConfig | null = model
    ? { modelId: model.id, mode, resolution, fps, tier: availableTiers(model)[0] ?? 'standard' }
    : null;

  useEffect(() => {
    if (!config || !videoUrl || !settings.enabled || preset === 'original') return;
    void previewPrice({ url: videoUrl }, config);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoUrl, modelId, mode, resolution, fps, settings.enabled, preset]);

  useEffect(() => {
    if (run?.status === 'completed' && run.output_url) {
      onUpscaleComplete?.({ job_id: run.id, status: run.status, output_url: run.output_url });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.status, run?.output_url]);

  const handleEnhance = useCallback(async () => {
    if (!videoUrl) {
      toast({
        title: tx({ de: 'Kein Video ausgewählt', en: 'No video selected', es: 'Ningún video seleccionado' }),
        description: tx({ de: 'Bitte wähle zuerst ein Video aus.', en: 'Please select a video first.', es: 'Por favor, selecciona primero un video.' }),
        variant: 'destructive',
      });
      return;
    }
    if (!config) return;
    const started = await startEnhance({ url: videoUrl }, config);
    if (started) {
      toast({
        title: tx({ de: 'Verbesserung gestartet', en: 'Enhancement started', es: 'Mejora iniciada' }),
        description: tx({ de: 'Dein Video wird verbessert.', en: 'Your video is being enhanced.', es: 'Tu vídeo se está mejorando.' }),
      });
    }
  }, [videoUrl, config, startEnhance, tx]);

  const priceLabel =
    estimate != null
      ? new Intl.NumberFormat(uiLocale(), { style: 'currency', currency: 'EUR' }).format(estimate.userPriceEur)
      : '—';

  const presetOptions: { value: Preset; label: string; hint: string }[] = [
    {
      value: 'original',
      label: tx({ de: 'Original', en: 'Original', es: 'Original' }),
      hint: tx({ de: 'Keine Verbesserung', en: 'No enhancement', es: 'Sin mejora' }),
    },
    {
      value: 'recommended',
      label: tx({ de: 'Empfohlen', en: 'Recommended', es: 'Recomendado' }),
      hint: '1080p',
    },
    {
      value: 'high',
      label: tx({ de: 'Hohe Qualität', en: 'High quality', es: 'Alta calidad' }),
      hint: '4K',
    },
    {
      value: 'custom',
      label: tx({ de: 'Eigene Einstellung', en: 'Custom', es: 'Personalizado' }),
      hint: tx({ de: 'Selbst wählen', en: 'Choose yourself', es: 'Elige tú' }),
    },
  ];

  return (
    <div className="p-4 space-y-4 rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ArrowUpCircle className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">
            {tx({ de: 'Video verbessern', en: 'Enhance video', es: 'Mejorar vídeo' })}
          </h3>
        </div>
        <Switch
          checked={settings.enabled}
          onCheckedChange={(enabled) => onSettingsChange({ ...settings, enabled })}
        />
      </div>

      {settings.enabled && (
        <div className="space-y-4">
          <RadioGroup
            value={preset}
            onValueChange={(value: Preset) => setPreset(value)}
            className="grid grid-cols-2 gap-2 md:grid-cols-4"
          >
            {presetOptions.map((option) => (
              <div key={option.value}>
                <RadioGroupItem value={option.value} id={`preset-${option.value}`} className="peer sr-only" />
                <Label
                  htmlFor={`preset-${option.value}`}
                  className="flex flex-col items-center justify-center rounded-md border-2 border-muted bg-popover p-2 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary cursor-pointer text-center"
                >
                  <span className="font-semibold text-sm">{option.label}</span>
                  <span className="text-[10px] text-muted-foreground leading-tight">{option.hint}</span>
                </Label>
              </div>
            ))}
          </RadioGroup>

          {preset !== 'original' && model && (
            <>
              {preset === 'custom' && (
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{tx({ de: 'Engine', en: 'Engine', es: 'Motor' })}</Label>
                    <Select value={modelId} onValueChange={setModelId}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {models.map((m) => (
                          <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{tx({ de: 'Auflösung', en: 'Resolution', es: 'Resolución' })}</Label>
                    <Select value={resolution} onValueChange={(v) => setResolution(v as VideoResolution)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {availableResolutions(model, mode).map((r) => (
                          <SelectItem key={r} value={r}>{r.toUpperCase()}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {model.processingModes.length > 1 && (
                    <div className="space-y-2">
                      <Label>{tx({ de: 'Materialart', en: 'Footage type', es: 'Tipo de material' })}</Label>
                      <Select value={mode} onValueChange={setMode}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {model.processingModes.map((m) => (
                            <SelectItem key={m.id} value={m.id}>{m.label[lang] ?? m.label.en}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label>{tx({ de: 'Bilder pro Sekunde', en: 'Frames per second', es: 'Fotogramas por segundo' })}</Label>
                    <Select
                      value={fps === null ? 'source' : String(fps)}
                      onValueChange={(v) => setFps(v === 'source' ? null : Number(v))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="source">
                          {tx({ de: 'Original behalten', en: 'Keep original', es: 'Mantener original' })}
                        </SelectItem>
                        {fpsChoices.map((f) => (
                          <SelectItem key={f} value={String(f)}>{f} FPS</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              <div className="rounded-lg border border-border/60 bg-background/40 p-3 text-sm space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    {resolution.toUpperCase()} ·{' '}
                    {fps === null
                      ? tx({ de: 'Original-FPS', en: 'Source FPS', es: 'FPS original' })
                      : `${fps} FPS`}
                  </span>
                  <span className="font-bold">{videoUrl ? priceLabel : '—'}</span>
                </div>
                {/* Before the run: what the file is and what will really be delivered. */}
                {targetFrame && (
                  <p className="text-xs text-muted-foreground">
                    {formatFrame({ width: sourceWidth, height: sourceHeight })} →{' '}
                    <span className="text-foreground font-medium">{formatFrame(targetFrame)}</span>{' '}
                    {tx({ de: 'Pixel', en: 'pixels', es: 'píxeles' })}
                    {sourceMeta?.durationSeconds
                      ? ` · ${sourceMeta.durationSeconds.toFixed(1)} s`
                      : ''}
                  </p>
                )}
                {routedModel && !blockedReason && (
                  <p className="text-xs text-primary/90">
                    {tx({
                      de: 'Läuft auf der Engine, die dieses Format wirklich liefern kann:',
                      en: 'Runs on the engine that can really deliver this frame:',
                      es: 'Se ejecuta en el motor que sí puede entregar este formato:',
                    })}{' '}
                    {routedModel.name}
                  </p>
                )}
                {/* During the run: the live status of the job. */}
                {run && run.status !== 'completed' && (
                  <p className="text-xs text-muted-foreground" aria-live="polite">
                    {tx({ de: 'Status', en: 'Status', es: 'Estado' })}: {run.status.replace(/_/g, ' ')}
                  </p>
                )}
              </div>

              {blockedReason && (
                <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg">
                  <AlertCircle className="h-4 w-4" />
                  <span className="text-sm">{blockedReason}</span>
                </div>
              )}

              {error && !blockedReason && (
                <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg" role="alert">
                  <AlertCircle className="h-4 w-4" />
                  <span className="text-sm">{engineErrorText(errorCode, error, lang)}</span>
                </div>
              )}

              <Button
                onClick={() => void handleEnhance()}
                disabled={isStarting || isRunning || !videoUrl || !!blockedReason || orderRejected}
                className="w-full gap-2"
              >
                {isStarting || isRunning ? (
                  <>
                    <Zap className="h-4 w-4 animate-pulse" />
                    {tx({ de: 'Wird verbessert …', en: 'Enhancing…', es: 'Mejorando…' })}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    {tx({ de: 'Video verbessern', en: 'Enhance video', es: 'Mejorar vídeo' })}
                  </>
                )}
              </Button>

              {run?.status === 'completed' && run.output_url && (
                <div className="space-y-2">
                  <video src={run.output_url} controls className="w-full rounded-lg" />
                  {/* After the run: the measured facts of the delivered file. */}
                  {run.actual_width && run.actual_height && (
                    <p className="text-xs text-muted-foreground">
                      {tx({ de: 'Geliefert', en: 'Delivered', es: 'Entregado' })}:{' '}
                      <span className="text-foreground font-medium">
                        {run.actual_width}×{run.actual_height}
                      </span>{' '}
                      {tx({ de: 'Pixel', en: 'pixels', es: 'píxeles' })}
                      {run.output_size_bytes
                        ? ` · ${(run.output_size_bytes / (1024 * 1024)).toFixed(1)} MB`
                        : ''}
                      {run.output_fps ? ` · ${Math.round(run.output_fps)} FPS` : ''}
                      {run.output_duration_seconds
                        ? ` · ${run.output_duration_seconds.toFixed(1)} s`
                        : ''}
                      {run.output_codec ? ` · ${run.output_codec.toUpperCase()}` : ''}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
