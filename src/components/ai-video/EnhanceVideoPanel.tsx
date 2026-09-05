import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Loader2, Sparkles, XCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTranslation } from '@/hooks/useTranslation';
import { useEnhanceVideo } from '@/hooks/useEnhanceVideo';
import { VideoSourcePicker } from '@/components/ai-video/VideoSourcePicker';
import type { CanonicalVideoAsset } from '@/lib/videoEnhance/canonicalVideoAsset';
import { isAiGeneratedSource } from '@/lib/videoEnhance/recommend';
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
 * The single user-facing surface for video enhancement.
 *
 * Deliberately free of internal vocabulary: no rate cards, no cost
 * verification state, no calibration status. Those live in the admin area.
 *
 * Source identity is always a canonical asset ({ assetId, assetType }); the
 * settings only appear once a source exists (progressive disclosure).
 */

type Lang = 'en' | 'de' | 'es';

const COPY = {
  title: { en: 'Video Enhance', de: 'Video verbessern', es: 'Mejorar vídeo' },
  subtitle: {
    en: 'Sharpen and upscale a finished video.',
    de: 'Ein fertiges Video schärfen und hochskalieren.',
    es: 'Nitidez y escalado de un vídeo terminado.',
  },
  engine: { en: 'Engine', de: 'Engine', es: 'Motor' },
  style: { en: 'Footage type', de: 'Materialart', es: 'Tipo de material' },
  detectedFrom: { en: 'Detected from', de: 'Erkannt aus', es: 'Detectado de' },
  change: { en: 'Change', de: 'Ändern', es: 'Cambiar' },
  resolution: { en: 'Resolution', de: 'Auflösung', es: 'Resolución' },
  fps: { en: 'Frames per second', de: 'Bilder pro Sekunde', es: 'Fotogramas por segundo' },
  keepFps: { en: 'Keep original', de: 'Original behalten', es: 'Mantener original' },
  output: { en: 'Output', de: 'Ergebnis', es: 'Resultado' },
  price: { en: 'Price', de: 'Preis', es: 'Precio' },
  calculating: { en: 'Calculating…', de: 'Wird berechnet …', es: 'Calculando…' },
  start: { en: 'Enhance video', de: 'Video verbessern', es: 'Mejorar vídeo' },
  running: { en: 'Enhancing…', de: 'Wird verbessert …', es: 'Mejorando…' },
  cancel: { en: 'Cancel', de: 'Abbrechen', es: 'Cancelar' },
  done: { en: 'Your enhanced video is ready.', de: 'Dein verbessertes Video ist fertig.', es: 'Tu vídeo mejorado está listo.' },
  download: { en: 'Download', de: 'Herunterladen', es: 'Descargar' },
  failed: { en: 'The enhancement did not finish.', de: 'Die Verbesserung wurde nicht abgeschlossen.', es: 'La mejora no se completó.' },
  cancelled: { en: 'The enhancement was cancelled and your credit was returned.', de: 'Die Verbesserung wurde abgebrochen, dein Guthaben ist zurück.', es: 'La mejora se canceló und dein Guthaben ist zurück.' },
  recommended: { en: 'recommended', de: 'empfohlen', es: 'recomendado' },
  bestForAi: {
    en: 'Best for AI-generated video',
    de: 'Am besten für KI-generiertes Material',
    es: 'Ideal para vídeo generado por IA',
  },
  bestForCamera: {
    en: 'Best for camera and uploaded footage',
    de: 'Am besten für Kamera- und Upload-Material',
    es: 'Ideal para material de cámara y subidas',
  },
  alreadyHigh: {
    en: 'Already high resolution · enhancement may provide limited benefit',
    de: 'Bereits hohe Auflösung · Verbesserung bringt vermutlich wenig',
    es: 'Ya es de alta resolución · la mejora puede aportar poco',
  },
} as const;

function tx(key: keyof typeof COPY, lang: Lang): string {
  return COPY[key][lang] ?? COPY[key].en;
}

interface Props {
  /** Preselected stored asset — keeps the parent/child lineage intact. */
  initialSourceAssetId?: string;
  initialSourceAssetType?: 'generation' | 'creation';
  /** Deprecated fallback for surfaces not yet migrated to asset IDs. */
  initialSourceUrl?: string;
  /** Fired once the enhanced video exists in our own storage. */
  onCompleted?: (outputUrl: string) => void;
}

export function EnhanceVideoPanel({
  initialSourceAssetId,
  initialSourceAssetType,
  initialSourceUrl,
  onCompleted,
}: Props) {
  const { language } = useTranslation();
  const lang: Lang = (['en', 'de', 'es'].includes(language) ? language : 'en') as Lang;

  const models = useMemo(() => visibleVideoEnhanceModels(), []);
  const [modelId, setModelId] = useState(models[0]?.id ?? '');
  const model = getVideoEnhanceModel(modelId);

  const [mode, setMode] = useState(model?.processingModes[0]?.id ?? 'standard');
  const [modeTouched, setModeTouched] = useState(false);
  const [resolution, setResolution] = useState<VideoResolution>('1080p');
  const [fps, setFps] = useState<number | null>(null);
  const [asset, setAsset] = useState<CanonicalVideoAsset | null>(null);

  const { run, estimate, sourceMeta, isStarting, isRunning, error, previewPrice, startEnhance, cancelEnhance } =
    useEnhanceVideo();

  const legacySource = !asset && !!initialSourceAssetId;
  const hasSource = !!asset || legacySource || (!asset && !!initialSourceUrl);

  const source = useMemo(
    () =>
      asset
        ? { assetId: asset.assetId, assetType: asset.assetType }
        : { assetId: initialSourceAssetId, assetType: initialSourceAssetType, url: initialSourceUrl },
    [asset, initialSourceAssetId, initialSourceAssetType, initialSourceUrl],
  );

  const aiSource = useMemo(() => {
    const model = sourceMeta?.sourceModel ?? asset?.sourceModel ?? undefined;
    if (asset?.origin === 'uploaded') return false;
    return isAiGeneratedSource(model) || asset?.origin === 'generated';
  }, [asset, sourceMeta]);

  // Preselect the engine and the footage type from what we already know.
  useEffect(() => {
    if (!asset) return;
    const preferred = aiSource ? 'bytedance-vcube' : 'topaz-video-upscale';
    if (models.some((m) => m.id === preferred)) setModelId(preferred);
    setModeTouched(false);
  }, [asset, aiSource, models]);

  // Keep the configuration inside what the selected engine really supports.
  useEffect(() => {
    if (!model) return;
    const preferredMode =
      !modeTouched && aiSource && model.processingModes.some((m) => m.id === 'aigc')
        ? 'aigc'
        : mode;
    const nextMode = model.processingModes.some((m) => m.id === preferredMode)
      ? preferredMode
      : model.processingModes[0].id;
    if (nextMode !== mode) setMode(nextMode);
    const resolutions = availableResolutions(model, nextMode);
    if (!resolutions.includes(resolution)) setResolution(resolutions[0]);
  }, [model, mode, modeTouched, aiSource, resolution]);

  const fpsChoices = model ? availableFps(model, mode, resolution) : [];
  useEffect(() => {
    if (fps !== null && !fpsChoices.includes(fps)) setFps(null);
  }, [fps, fpsChoices]);

  const config: EnhanceConfig | null = model
    ? { modelId: model.id, mode, resolution, fps, tier: availableTiers(model)[0] ?? 'standard' }
    : null;

  useEffect(() => {
    if (!config || !hasSource) return;
    void previewPrice(source, config);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, modelId, mode, resolution, fps, hasSource]);

  const onStart = useCallback(() => {
    if (!config || !hasSource) return;
    void startEnhance(source, config);
  }, [config, hasSource, source, startEnhance]);

  // Notify the host surface exactly once per finished run.
  const notifiedRef = useRef<string | null>(null);
  useEffect(() => {
    if (run?.status === 'completed' && run.output_url && notifiedRef.current !== run.id) {
      notifiedRef.current = run.id;
      onCompleted?.(run.output_url);
    }
  }, [run, onCompleted]);

  if (!model) return null;

  const priceLabel =
    estimate != null
      ? new Intl.NumberFormat(lang === 'en' ? 'en-US' : lang === 'es' ? 'es-ES' : 'de-DE', {
          style: 'currency',
          currency: 'EUR',
        }).format(estimate.userPriceEur)
      : tx('calculating', lang);

  // Server-measured facts win over anything the browser read.
  const sourceHeight = sourceMeta?.height ?? asset?.height ?? null;
  const alreadyHigh = !!sourceHeight && sourceHeight >= 2000;
  const recommendedModel = aiSource ? 'ByteDance vCube' : 'Topaz Video Upscale';

  const autoDetectedFootage = !modeTouched && !!asset && model.processingModes.length > 1;

  return (
    <Card className="p-6 space-y-6 bg-card/60 backdrop-blur-sm border-border">
      <div>
        <h2 className="text-xl font-bold font-heading">{tx('title', lang)}</h2>
        <p className="text-sm text-muted-foreground">{tx('subtitle', lang)}</p>
      </div>

      {!initialSourceUrl && !initialSourceAssetId && (
        <VideoSourcePicker selected={asset} onSelect={setAsset} />
      )}

      {hasSource && (
        <p className="text-sm text-primary/90">
          {alreadyHigh
            ? `✓ ${tx('alreadyHigh', lang)}`
            : `✦ ${recommendedModel} ${tx('recommended', lang)} · ${aiSource ? tx('bestForAi', lang) : tx('bestForCamera', lang)}`}
        </p>
      )}

      {hasSource && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>{tx('engine', lang)}</Label>
              <Select value={modelId} onValueChange={setModelId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {models.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name} — {m.positioning[lang]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {model.processingModes.length > 1 && (
              <div className="space-y-2">
                <Label>{tx('style', lang)}</Label>
                <Select
                  value={mode}
                  onValueChange={(v) => {
                    setModeTouched(true);
                    setMode(v);
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {model.processingModes.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.label[lang]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {autoDetectedFootage && (asset?.sourceModel || asset?.origin) && (
                  <p className="text-xs text-muted-foreground">
                    {tx('detectedFrom', lang)}{' '}
                    {asset?.sourceModel ??
                      (asset?.origin === 'uploaded'
                        ? tx('style', lang)
                        : recommendedModel)}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label>{tx('resolution', lang)}</Label>
              <Select value={resolution} onValueChange={(v) => setResolution(v as VideoResolution)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {availableResolutions(model, mode).map((r) => (
                    <SelectItem key={r} value={r}>{r.toUpperCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{tx('fps', lang)}</Label>
              <Select
                value={fps === null ? 'source' : String(fps)}
                onValueChange={(v) => setFps(v === 'source' ? null : Number(v))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="source">{tx('keepFps', lang)}</SelectItem>
                  {fpsChoices.map((f) => (
                    <SelectItem key={f} value={String(f)}>{f} FPS</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border/60 bg-background/40 p-4">
            <div className="text-sm">
              <p className="text-muted-foreground">{tx('output', lang)}</p>
              <p className="font-medium">
                {resolution.toUpperCase()} · {fps === null ? tx('keepFps', lang) : `${fps} FPS`}
              </p>
            </div>
            <div className="text-right text-sm">
              <p className="text-muted-foreground">{tx('price', lang)}</p>
              <p className="font-bold text-lg">{priceLabel}</p>
            </div>
          </div>
        </>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {run?.status === 'completed' && run.output_url ? (
        <div className="space-y-3">
          <p className="text-sm text-primary">{tx('done', lang)}</p>
          <video src={run.output_url} controls className="w-full rounded-lg" />
          <Button asChild variant="secondary">
            <a href={run.output_url} download target="_blank" rel="noreferrer">
              <Download className="w-4 h-4 mr-2" />
              {tx('download', lang)}
            </a>
          </Button>
        </div>
      ) : run?.status === 'provider_failed' || run?.status === 'manual_review' ? (
        <p className="text-sm text-destructive">{tx('failed', lang)}</p>
      ) : run?.status === 'provider_cancelled_confirmed' ? (
        <p className="text-sm text-muted-foreground">{tx('cancelled', lang)}</p>
      ) : null}

      {hasSource && (
        <div className="flex gap-3">
          <Button onClick={onStart} disabled={isStarting || isRunning} className="flex-1">
            {isStarting || isRunning ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{tx('running', lang)}</>
            ) : (
              <><Sparkles className="w-4 h-4 mr-2" />{tx('start', lang)}</>
            )}
          </Button>
          {isRunning && run && (
            <Button variant="outline" onClick={() => void cancelEnhance(run.id)}>
              <XCircle className="w-4 h-4 mr-2" />
              {tx('cancel', lang)}
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
