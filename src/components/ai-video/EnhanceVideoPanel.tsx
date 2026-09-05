import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from '@/hooks/useTranslation';
import { useEnhanceVideo } from '@/hooks/useEnhanceVideo';
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
 */

type Lang = 'en' | 'de' | 'es';

const COPY = {
  title: { en: 'Video Enhance', de: 'Video verbessern', es: 'Mejorar vídeo' },
  subtitle: {
    en: 'Sharpen and upscale a finished video.',
    de: 'Ein fertiges Video schärfen und hochskalieren.',
    es: 'Nitidez y escalado de un vídeo terminado.',
  },
  pickVideo: { en: 'Video', de: 'Video', es: 'Vídeo' },
  pickVideoPlaceholder: {
    en: 'Choose one of your videos',
    de: 'Eines deiner Videos wählen',
    es: 'Elige uno de tus vídeos',
  },
  noVideos: {
    en: 'You have no finished videos yet.',
    de: 'Du hast noch keine fertigen Videos.',
    es: 'Todavía no tienes vídeos terminados.',
  },
  engine: { en: 'Engine', de: 'Engine', es: 'Motor' },
  style: { en: 'Footage type', de: 'Materialart', es: 'Tipo de material' },
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
} as const;

function tx(key: keyof typeof COPY, lang: Lang): string {
  return COPY[key][lang] ?? COPY[key].en;
}

interface Props {
  /** Preselected source, e.g. when opened from the media library. */
  initialSourceUrl?: string;
}

export function EnhanceVideoPanel({ initialSourceUrl }: Props) {
  const { user } = useAuth();
  const { language } = useTranslation();
  const lang: Lang = (['en', 'de', 'es'].includes(language) ? language : 'en') as Lang;

  const models = useMemo(() => visibleVideoEnhanceModels(), []);
  const [modelId, setModelId] = useState(models[0]?.id ?? '');
  const model = getVideoEnhanceModel(modelId);

  const [mode, setMode] = useState(model?.processingModes[0]?.id ?? 'standard');
  const [resolution, setResolution] = useState<VideoResolution>('1080p');
  const [fps, setFps] = useState<number | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | undefined>(initialSourceUrl);

  const { run, estimate, isStarting, isRunning, error, previewPrice, startEnhance, cancelEnhance } =
    useEnhanceVideo();

  const { data: videos = [] } = useQuery({
    queryKey: ['enhance-source-videos', user?.id],
    enabled: !!user && !initialSourceUrl,
    queryFn: async () => {
      const { data, error: qErr } = await supabase
        .from('ai_video_generations')
        .select('id, video_url, prompt, created_at')
        .eq('user_id', user!.id)
        .eq('status', 'completed')
        .not('video_url', 'is', null)
        .order('created_at', { ascending: false })
        .limit(30);
      if (qErr) throw qErr;
      return (data ?? []) as { id: string; video_url: string; prompt: string | null }[];
    },
  });

  // Keep the configuration inside what the selected engine really supports.
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
    if (!config || !sourceUrl) return;
    void previewPrice({ url: sourceUrl }, config);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceUrl, modelId, mode, resolution, fps]);

  const onStart = useCallback(() => {
    if (!config || !sourceUrl) return;
    void startEnhance({ url: sourceUrl }, config);
  }, [config, sourceUrl, startEnhance]);

  if (!model) return null;

  const priceLabel =
    estimate != null
      ? new Intl.NumberFormat(lang === 'en' ? 'en-US' : lang === 'es' ? 'es-ES' : 'de-DE', {
          style: 'currency',
          currency: 'EUR',
        }).format(estimate.userPriceEur)
      : tx('calculating', lang);

  return (
    <Card className="p-6 space-y-6 bg-card/60 backdrop-blur-sm border-border">
      <div>
        <h2 className="text-xl font-bold font-heading">{tx('title', lang)}</h2>
        <p className="text-sm text-muted-foreground">{tx('subtitle', lang)}</p>
      </div>

      {!initialSourceUrl && (
        <div className="space-y-2">
          <Label>{tx('pickVideo', lang)}</Label>
          {videos.length === 0 ? (
            <p className="text-sm text-muted-foreground">{tx('noVideos', lang)}</p>
          ) : (
            <Select value={sourceUrl} onValueChange={setSourceUrl}>
              <SelectTrigger>
                <SelectValue placeholder={tx('pickVideoPlaceholder', lang)} />
              </SelectTrigger>
              <SelectContent>
                {videos.map((v) => (
                  <SelectItem key={v.id} value={v.video_url}>
                    {(v.prompt ?? v.id).slice(0, 60)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

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
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {model.processingModes.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.label[lang]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          <p className="font-bold text-lg">{sourceUrl ? priceLabel : '—'}</p>
        </div>
      </div>

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

      <div className="flex gap-3">
        <Button onClick={onStart} disabled={!sourceUrl || isStarting || isRunning} className="flex-1">
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
    </Card>
  );
}
