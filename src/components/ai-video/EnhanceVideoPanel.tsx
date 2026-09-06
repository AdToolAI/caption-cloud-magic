import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, HelpCircle, Loader2, Sparkles, XCircle } from 'lucide-react';

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
import { EnhanceRunProgress } from '@/components/ai-video/EnhanceRunProgress';
import type { CanonicalVideoAsset } from '@/lib/videoEnhance/canonicalVideoAsset';
import { isAiGeneratedSource } from '@/lib/videoEnhance/recommend';
import { engineErrorText } from '@/lib/videoEnhance/engineErrors';
import {
  describeResolutionChoices,
  firstUpscaleResolution,
  formatFrame,
  resolveExecutionEngine,
  resolveTargetFrame,
} from '@/lib/videoEnhance/targetFrame';
import {
  deliveredFacts,
  engineDisplayName,
  targetMatchDetail,
  targetMatchLabel,
  targetMatchOf,
} from '@/lib/videoEnhance/runPresentation';

import {
  TOPAZ_DEFAULT_INTERPOLATION_ID,
  TOPAZ_DEFAULT_MODEL_ID,
  TOPAZ_DEFAULT_OUTPUT_QUALITY,
  TOPAZ_INTERPOLATION_VIEWS,
  TOPAZ_OUTPUT_QUALITY_VIEWS,
  topazModelView,
  topazScaleFitsView,
  type TopazOutputQuality,
} from '@/config/videoEnhanceModels/topazCatalog';
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
 *
 * Before the start the panel states, in pixels and engine names, exactly what
 * will be delivered and by whom. While a run is in flight it shows the engine
 * that is REALLY executing and a live clock. After completion it says whether
 * the promised frame was met — measured on the finished file, not assumed.
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
  topazModel: { en: 'Model', de: 'Modell', es: 'Modelo' },
  outputQuality: { en: 'File quality', de: 'Dateiqualität', es: 'Calidad del archivo' },
  motionModel: { en: 'Motion smoothing', de: 'Bewegungsglättung', es: 'Suavizado de movimiento' },
  motionOnlyWhenFps: {
    en: 'Only used because you changed the frames per second.',
    de: 'Wird nur genutzt, weil du die Bilder pro Sekunde änderst.',
    es: 'Solo se usa porque cambiaste los fotogramas por segundo.',
  },
  scaleLocked: {
    en: 'needs a different target size',
    de: 'braucht eine andere Zielgröße',
    es: 'necesita otro tamaño de destino',
  },
  onlyFactor: {
    en: 'only works at',
    de: 'funktioniert nur bei',
    es: 'solo funciona a',
  },
  detectedFrom: { en: 'Detected from', de: 'Erkannt aus', es: 'Detectado de' },
  fromOrigin: {
    en: 'Set automatically from where the clip comes from',
    de: 'Automatisch aus der Herkunft des Clips gesetzt',
    es: 'Definido automáticamente según el origen del clip',
  },
  chosenByYou: { en: 'Chosen by you', de: 'Von dir gewählt', es: 'Elegido por ti' },
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
  cancelled: { en: 'The enhancement was cancelled and your credit was returned.', de: 'Die Verbesserung wurde abgebrochen, dein Guthaben ist zurück.', es: 'La mejora se canceló y se devolvió tu saldo.' },
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
  pixels: { en: 'pixels', de: 'Pixel', es: 'píxeles' },
  delivered: { en: 'Delivered', de: 'Geliefert', es: 'Entregado' },
  sourcePixels: { en: 'Source', de: 'Quelle', es: 'Origen' },
  targetPixels: { en: 'Target', de: 'Ziel', es: 'Objetivo' },
  requestedEngine: { en: 'Requested engine', de: 'Gewählte Engine', es: 'Motor solicitado' },
  executingEngine: { en: 'Executing engine', de: 'Ausführende Engine', es: 'Motor que ejecuta' },
  measuring: { en: 'Measuring the source…', de: 'Quelle wird vermessen …', es: 'Midiendo el origen…' },
  noGain: { en: 'no gain', de: 'kein Gewinn', es: 'sin ganancia' },
  smaller: { en: 'smaller than source', de: 'kleiner als Quelle', es: 'menor que el origen' },
  noUpscale: {
    en: 'This setting would not enlarge your video. Pick a higher resolution.',
    de: 'Diese Einstellung vergrößert dein Video nicht. Wähle eine höhere Auflösung.',
    es: 'Esta opción no ampliaría tu vídeo. Elige una resolución mayor.',
  },
  downscale: {
    en: 'This setting would make your video smaller than it already is.',
    de: 'Diese Einstellung würde dein Video kleiner machen, als es schon ist.',
    es: 'Esta opción haría tu vídeo más pequeño de lo que ya es.',
  },
  routed: {
    en: 'Different from the requested engine: only this engine can deliver the target frame for your clip.',
    de: 'Weicht von der gewählten Engine ab: Nur diese Engine kann das Zielformat für deinen Clip liefern.',
    es: 'Distinto del motor solicitado: solo este motor puede entregar el formato objetivo para tu clip.',
  },
  unreachable: {
    en: 'No engine can deliver this frame for your video right now.',
    de: 'Keine Engine kann dieses Format für dein Video derzeit liefern.',
    es: 'Ningún motor puede entregar este formato para tu vídeo ahora mismo.',
  },
  messengerHint: {
    en: 'Messengers like WhatsApp shrink videos when you send them. Download the file and send it as a document to keep the full quality.',
    de: 'Messenger wie WhatsApp rechnen Videos beim Versenden stark herunter. Lade die Datei herunter und verschicke sie als Dokument, um die volle Qualität zu behalten.',
    es: 'Los mensajeros como WhatsApp reducen los vídeos al enviarlos. Descarga el archivo y envíalo como documento para conservar toda la calidad.',
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
  const [outputQuality, setOutputQuality] = useState<TopazOutputQuality>(
    TOPAZ_DEFAULT_OUTPUT_QUALITY,
  );
  const [interpolationModel, setInterpolationModel] = useState(TOPAZ_DEFAULT_INTERPOLATION_ID);
  const [asset, setAsset] = useState<CanonicalVideoAsset | null>(null);

  const {
    run,
    estimate,
    plan,
    sourceMeta,
    isStarting,
    isRunning,
    error,
    errorCode,
    errorReason,
    previewPrice,
    startEnhance,
    cancelEnhance,
  } = useEnhanceVideo();

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

  // A fixed-factor Topaz model stops fitting as soon as the target size
  // changes. The selection is NOT rewritten behind the customer's back — the
  // mismatch is named and the start is blocked until they resolve it.


  const fpsChoices = model ? availableFps(model, mode, resolution) : [];
  useEffect(() => {
    if (fps !== null && !fpsChoices.includes(fps)) setFps(null);
  }, [fps, fpsChoices]);

  // Server-measured facts win over anything the browser read.
  const sourceHeight = sourceMeta?.height ?? asset?.height ?? null;
  const sourceWidth = sourceMeta?.width ?? asset?.width ?? null;
  const sourceKnown = !!sourceWidth && !!sourceHeight;

  // Every offered tier, described against THIS source: exact target frame and
  // whether it would really add pixels. Tiers that would be a no-op or a
  // downscale are disabled in the picker itself.
  const tierChoices = useMemo(
    () =>
      model && sourceKnown
        ? describeResolutionChoices(availableResolutions(model, mode), sourceWidth!, sourceHeight!)
        : null,
    [model, mode, sourceKnown, sourceWidth, sourceHeight],
  );

  // When the source is measured and the current tier is not an upscale, move
  // to the smallest tier that is — once per source, never against a choice
  // the customer made afterwards.
  const autoTierRef = useRef<string | null>(null);
  useEffect(() => {
    if (!model || !sourceKnown) return;
    const key = `${sourceWidth}x${sourceHeight}:${model.id}`;
    if (autoTierRef.current === key) return;
    autoTierRef.current = key;
    const current = tierChoices?.find((c) => c.resolution === resolution);
    if (current && current.verdict.ok) return;
    const next = firstUpscaleResolution(availableResolutions(model, mode), sourceWidth!, sourceHeight!);
    if (next && next !== resolution) setResolution(next);
  }, [model, mode, sourceKnown, sourceWidth, sourceHeight, tierChoices, resolution]);

  const topazEngine = model?.provider === 'topaz';
  const sourceFps = sourceMeta?.fps ?? null;
  // The frame-rate filter is only part of the order when the frame rate really
  // changes — so it is only offered, priced and sent in that case.
  const interpolationApplies = topazEngine && topazInterpolationAppliesView(sourceFps, fps);


  const config: EnhanceConfig | null = model
    ? {
        modelId: model.id,
        mode,
        modeExplicit: modeTouched,
        resolution,
        fps,
        tier: availableTiers(model)[0] ?? 'standard',
        // Topaz-only settings; an engine without an encoder or interpolation
        // choice must not receive them at all.
        ...(topazEngine ? { outputQuality } : {}),
        ...(interpolationApplies ? { interpolationModel } : {}),

      }
    : null;


  useEffect(() => {
    if (!config || !hasSource) return;
    void previewPrice(source, config);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, modelId, mode, modeTouched, resolution, fps, outputQuality, interpolationModel, hasSource]);

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

  const alreadyHigh = !!sourceHeight && sourceHeight >= 2000;
  const recommendedModel = aiSource ? 'ByteDance vCube' : 'Topaz Video Upscale';

  // Promise the delivered pixel frame up front. Portrait clips get the full
  // frame on the short side (4K portrait = 2160x3840), whatever engine runs.
  const targetFrame = sourceKnown ? resolveTargetFrame(resolution, sourceWidth!, sourceHeight!) : null;
  const sourceFrameLabel = sourceKnown ? formatFrame({ width: sourceWidth!, height: sourceHeight! }) : null;

  // A paid enhancement must actually add pixels — same rule as the server.
  const currentChoice = tierChoices?.find((c) => c.resolution === resolution) ?? null;
  const upscale = currentChoice?.verdict ?? null;

  // Which engine really delivers this frame. The server's plan (from the
  // estimate) is the authority; the client mirror only bridges the moment
  // before it arrives or when it belongs to a previous configuration.
  const planIsCurrent =
    !!plan &&
    plan.requestedModelId === model.id &&
    !!targetFrame &&
    plan.target.width === targetFrame.width &&
    plan.target.height === targetFrame.height;
  const mirror = sourceKnown
    ? resolveExecutionEngine(model.id, models.map((m) => m.id), resolution, sourceWidth!, sourceHeight!)
    : { executionModelId: model.id, routed: false };
  const executionModelId = planIsCurrent
    ? (plan!.strategy === 'unreachable' ? null : plan!.executionModelId)
    : mirror.executionModelId;
  const routed = !!executionModelId && executionModelId !== model.id;
  const frameUnreachable = targetFrame != null && executionModelId === null;

  const isTopaz = model.id === 'topaz-video-upscale';
  // Fixed-factor Topaz models (Proteus Natural 2x, Rhea 4x) are only offered
  // for a target size they are really trained for.
  const modeFits = (modeId: string): boolean => {
    if (!isTopaz || !sourceKnown) return true;
    const target = resolveTargetFrame(resolution, sourceWidth!, sourceHeight!);
    return topazScaleFitsView(
      topazModelView(modeId),
      { width: sourceWidth!, height: sourceHeight! },
      target,
    );
  };
  // A model whose credit consumption we have not confirmed yet stays visible
  // as beta, but cannot be started — the server enforces the same rule.
  const modeStartable = (modeId: string): boolean =>
    !isTopaz || isTopazModelStartableView(modeId, isEnhanceTestUser);

  const blockedReason = upscale && !upscale.ok
    ? (upscale.reason === 'downscale' ? tx('downscale', lang) : tx('noUpscale', lang))
    : frameUnreachable
      ? tx('unreachable', lang)
      : !modeFits(mode)
        ? `${topazModelView(mode).name} · ${tx('onlyFactor', lang)} ${topazModelView(mode).fixedUpscale}×`
        : !modeStartable(mode)
          ? `${topazModelView(mode).name} · ${tx('betaBlocked', lang)}`
          : null;


  const autoDetectedFootage = !modeTouched && !!asset && model.processingModes.length > 1;
  // The footage type that really reaches the engine: the server derives it
  // from the clip's provenance unless the customer picked one.
  const executionMode = planIsCurrent ? plan!.executionMode : mode;
  const executionModeLabel =
    getVideoEnhanceModel(executionModelId ?? model.id)?.processingModes.find((m) => m.id === executionMode)
      ?.label[lang] ?? executionMode;
  const showFootageRow =
    !!executionModelId && (getVideoEnhanceModel(executionModelId)?.processingModes.length ?? 0) > 1;

  const completed = run?.status === 'completed' && !!run.output_url;
  const match = completed && run ? targetMatchOf(run) : null;
  const MatchIcon = match === 'matched' ? CheckCircle2 : match === 'mismatch' ? AlertTriangle : HelpCircle;
  const matchTone =
    match === 'matched'
      ? 'text-primary'
      : match === 'mismatch'
        ? 'text-destructive'
        : 'text-muted-foreground';

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
                <Label>{isTopaz ? tx('topazModel', lang) : tx('style', lang)}</Label>
                <Select
                  value={mode}
                  onValueChange={(v) => {
                    setModeTouched(true);
                    setMode(v);
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {model.processingModes.map((m) => {
                      // A fixed-factor model that cannot reach the chosen
                      // target size is shown, but disabled with the reason —
                      // never silently run at a factor it was not trained for.
                      const fits = !isTopaz || modeFits(m.id);
                      const view = isTopaz ? topazModelView(m.id) : null;
                      return (
                        <SelectItem
                          key={m.id}
                          value={m.id}
                          disabled={!fits}
                          data-testid={`enhance-mode-${m.id}`}
                        >
                          {m.label[lang]}
                          {!fits && view?.fixedUpscale
                            ? ` · ${tx('onlyFactor', lang)} ${view.fixedUpscale}×`
                            : ''}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                {isTopaz ? (
                  <p className="text-xs text-muted-foreground">{topazModelView(mode).hint[lang]}</p>
                ) : (
                  autoDetectedFootage && (asset?.sourceModel || asset?.origin) && (
                    <p className="text-xs text-muted-foreground">
                      {tx('detectedFrom', lang)}{' '}
                      {asset?.sourceModel ??
                        (asset?.origin === 'uploaded'
                          ? tx('style', lang)
                          : recommendedModel)}
                    </p>
                  )
                )}
              </div>
            )}

            {isTopaz && (
              <div className="space-y-2">
                <Label>{tx('outputQuality', lang)}</Label>
                <Select
                  value={outputQuality}
                  onValueChange={(v) => setOutputQuality(v as TopazOutputQuality)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TOPAZ_OUTPUT_QUALITY_VIEWS.map((q) => (
                      <SelectItem key={q.id} value={q.id}>{q.label[lang]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {TOPAZ_OUTPUT_QUALITY_VIEWS.find((q) => q.id === outputQuality)?.hint[lang]}
                </p>
              </div>
            )}

            {isTopaz && fps !== null && (
              <div className="space-y-2">
                <Label>{tx('motionModel', lang)}</Label>
                <Select value={interpolationModel} onValueChange={setInterpolationModel}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TOPAZ_INTERPOLATION_VIEWS.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name} — {m.hint[lang]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{tx('motionOnlyWhenFps', lang)}</p>
              </div>
            )}


            <div className="space-y-2">
              <Label>{tx('resolution', lang)}</Label>
              <Select value={resolution} onValueChange={(v) => setResolution(v as VideoResolution)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {availableResolutions(model, mode).map((r) => {
                    const choice = tierChoices?.find((c) => c.resolution === r) ?? null;
                    const blocked = !!choice && !choice.verdict.ok;
                    const note = !choice
                      ? ''
                      : choice.verdict.ok
                        ? ''
                        : choice.verdict.reason === 'downscale'
                          ? ` · ${tx('smaller', lang)}`
                          : ` · ${tx('noGain', lang)}`;
                    return (
                      <SelectItem
                        key={r}
                        value={r}
                        disabled={blocked}
                        data-testid={`enhance-tier-${r}`}
                        data-blocked={blocked ? 'true' : 'false'}
                      >
                        {r.toUpperCase()}
                        {choice ? ` · ${formatFrame(choice.frame)}` : ''}
                        {note}
                      </SelectItem>
                    );
                  })}
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

          {/* What will be delivered and by whom — stated before the start. */}
          <div
            className="rounded-lg border border-border/60 bg-background/40 p-4 space-y-3"
            data-testid="enhance-delivery-plan"
          >
            <div className="flex items-start justify-between gap-4">
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

            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
              <dt className="text-muted-foreground">{tx('sourcePixels', lang)}</dt>
              <dd className="tabular-nums">
                {sourceFrameLabel ? `${sourceFrameLabel} ${tx('pixels', lang)}` : tx('measuring', lang)}
              </dd>
              <dt className="text-muted-foreground">{tx('targetPixels', lang)}</dt>
              <dd className="tabular-nums font-medium">
                {targetFrame ? `${formatFrame(targetFrame)} ${tx('pixels', lang)}` : '—'}
              </dd>
              <dt className="text-muted-foreground">{tx('requestedEngine', lang)}</dt>
              <dd>{model.name}</dd>
              <dt className="text-muted-foreground">{tx('executingEngine', lang)}</dt>
              <dd className={routed ? 'text-primary/90 font-medium' : ''}>
                {executionModelId ? engineDisplayName(executionModelId) : '—'}
              </dd>
              {showFootageRow && (
                <>
                  <dt className="text-muted-foreground">{tx('style', lang)}</dt>
                  <dd>
                    {executionModeLabel}
                    <span className="text-muted-foreground">
                      {' '}· {modeTouched && !routed ? tx('chosenByYou', lang) : tx('fromOrigin', lang)}
                    </span>
                  </dd>
                </>
              )}
            </dl>

            {routed && !blockedReason && (
              <p className="text-xs text-primary/90" data-testid="enhance-routed-note">
                {tx('routed', lang)}
              </p>
            )}
          </div>

          {blockedReason && <p className="text-sm text-destructive">{blockedReason}</p>}
        </>
      )}

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {engineErrorText(errorCode, error, lang, errorReason)}
        </p>
      )}

      {isRunning && run && <EnhanceRunProgress run={run} lang={lang} />}

      {completed && run ? (
        <div className="space-y-3">
          <p className="text-sm text-primary">{tx('done', lang)}</p>
          <video src={run.output_url ?? undefined} controls className="w-full rounded-lg" />
          <p
            className={`text-sm flex items-center gap-2 ${matchTone}`}
            data-testid="enhance-target-match"
            data-match={match ?? 'unverified'}
          >
            <MatchIcon className="w-4 h-4" aria-hidden="true" />
            <span className="font-medium">{targetMatchLabel(match ?? 'unverified', lang)}</span>
            {targetMatchDetail(run) && (
              <span className="text-muted-foreground tabular-nums">· {targetMatchDetail(run)}</span>
            )}
          </p>
          {deliveredFacts(run, lang).length > 0 && (
            <p className="text-xs text-muted-foreground" data-testid="enhance-delivered-facts">
              {tx('delivered', lang)}:{' '}
              {sourceFrameLabel ? `${sourceFrameLabel} → ` : ''}
              {deliveredFacts(run, lang).join(' · ')}
            </p>
          )}
          <Button asChild variant="secondary">
            <a href={run.output_url ?? undefined} download target="_blank" rel="noreferrer">
              <Download className="w-4 h-4 mr-2" />
              {tx('download', lang)}
            </a>
          </Button>
          <p className="text-xs text-muted-foreground">{tx('messengerHint', lang)}</p>
        </div>
      ) : run?.status === 'provider_failed' || run?.status === 'manual_review' ? (
        <p className="text-sm text-destructive">{tx('failed', lang)}</p>
      ) : run?.status === 'provider_cancelled_confirmed' ? (
        <p className="text-sm text-muted-foreground">{tx('cancelled', lang)}</p>
      ) : null}

      {hasSource && (
        <div className="flex gap-3">
          <Button
            onClick={onStart}
            disabled={isStarting || isRunning || !!blockedReason}
            className="flex-1"
          >
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
