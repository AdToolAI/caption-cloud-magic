import { useEffect, useState } from 'react';
import { Activity, CircleSlash, FlaskConical, Radio } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { tx } from '@/lib/i18nText';
import {
  VIDEO_ENHANCE_MODELS,
  isVideoEnhanceModelKilled,
} from '@/config/videoEnhanceModels';

/**
 * Calibration status and operational status are shown as two SEPARATE blocks
 * on purpose: "estimator calibrating" must never read like "not live".
 * Nothing on this card gates a production run.
 */

interface Row {
  model_id: string;
  status: string;
  provider_cost_usd_estimated: number | null;
  provider_cost_usd_actual: number | null;
}

interface Stats {
  total: number;
  withActualCost: number;
  coverage: number;
  meanAbsErrorPct: number | null;
}

const CALIBRATION_SAMPLE_TARGET = 25;

function summarise(rows: Row[]): Stats {
  const total = rows.length;
  const verified = rows.filter(
    (r) => r.provider_cost_usd_actual !== null && Number(r.provider_cost_usd_actual) > 0,
  );
  const errors = verified
    .filter((r) => r.provider_cost_usd_estimated !== null && Number(r.provider_cost_usd_actual) > 0)
    .map(
      (r) =>
        Math.abs(
          Number(r.provider_cost_usd_estimated) - Number(r.provider_cost_usd_actual),
        ) / Number(r.provider_cost_usd_actual),
    );
  return {
    total,
    withActualCost: verified.length,
    coverage: total === 0 ? 0 : verified.length / total,
    meanAbsErrorPct:
      errors.length === 0 ? null : (errors.reduce((a, b) => a + b, 0) / errors.length) * 100,
  };
}

export function VideoEnhanceCalibrationCard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data } = await supabase
        .from('video_enhance_runs')
        .select('model_id, status, provider_cost_usd_estimated, provider_cost_usd_actual')
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(500);
      if (!active) return;
      setRows((data as Row[] | null) ?? []);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="rounded-2xl border border-border bg-card/60 backdrop-blur p-5">
      <header className="flex items-center gap-2 mb-1">
        <FlaskConical className="h-4 w-4 text-cyan-300" />
        <h3 className="text-base font-semibold tracking-tight">
          {tx({
            de: 'Video Enhance · Kalibrierung & Betrieb',
            en: 'Video Enhance · Calibration & operations',
            es: 'Video Enhance · Calibración y operación',
          })}
        </h3>
      </header>
      <p className="text-xs text-muted-foreground mb-4">
        {tx({
          de: 'Kalibrierung ist reine Beobachtung. Nur der Not-Aus stoppt ein Modell.',
          en: 'Calibration is observation only. Only the kill-switch stops a model.',
          es: 'La calibración es solo observación. Solo el interruptor de emergencia detiene un modelo.',
        })}
      </p>

      {loading ? (
        <p className="text-xs text-muted-foreground">
          {tx({ de: 'Lade…', en: 'Loading…', es: 'Cargando…' })}
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {VIDEO_ENHANCE_MODELS.map((model) => {
            const stats = summarise(rows.filter((r) => r.model_id === model.id));
            const killed = isVideoEnhanceModelKilled(model.id);
            const accountingVerified = stats.withActualCost > 0;
            const calibrating = stats.withActualCost < CALIBRATION_SAMPLE_TARGET;
            return (
              <div key={model.id} className="rounded-xl border border-border/60 bg-background/40 p-4">
                <div className="font-medium text-sm mb-3">{model.name}</div>

                {/* Operational status — the only release-relevant state. */}
                <div className="mb-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                    {tx({ de: 'Betriebsstatus', en: 'Operational status', es: 'Estado operativo' })}
                  </div>
                  {killed ? (
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-red-500/15 px-2 py-1 text-[11px] font-semibold text-red-300">
                      <CircleSlash className="h-3 w-3" />
                      {tx({ de: 'Not-Aus aktiv', en: 'Kill-switch active', es: 'Interruptor activo' })}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-300">
                      <Radio className="h-3 w-3" />
                      {tx({ de: 'Live', en: 'Live', es: 'En vivo' })}
                    </span>
                  )}
                </div>

                {/* Calibration — telemetry, never a gate. */}
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  {tx({ de: 'Kalibrierung', en: 'Calibration', es: 'Calibración' })}
                </div>
                <ul className="space-y-1 text-[11px] text-muted-foreground">
                  <li className="flex items-center gap-1.5">
                    <Activity className="h-3 w-3" />
                    {accountingVerified
                      ? tx({
                          de: 'Abrechnung verifiziert',
                          en: 'Accounting verified',
                          es: 'Contabilidad verificada',
                        })
                      : tx({
                          de: 'Kostenabdeckung wird gesammelt',
                          en: 'Cost coverage being collected',
                          es: 'Recopilando cobertura de costos',
                        })}
                  </li>
                  <li>
                    {calibrating
                      ? tx({
                          de: 'Estimator kalibriert',
                          en: 'Estimator calibrating',
                          es: 'Estimador calibrando',
                        })
                      : tx({ de: 'Estimator stabil', en: 'Estimator stable', es: 'Estimador estable' })}
                  </li>
                  <li className="tabular-nums">
                    {tx({ de: 'Kostenabdeckung', en: 'Cost coverage', es: 'Cobertura de costos' })}:{' '}
                    {(stats.coverage * 100).toFixed(0)}% ({stats.withActualCost}/{stats.total})
                  </li>
                  <li className="tabular-nums">
                    {tx({ de: 'Schätzfehler', en: 'Estimate error', es: 'Error de estimación' })}:{' '}
                    {stats.meanAbsErrorPct === null ? '—' : `${stats.meanAbsErrorPct.toFixed(0)}%`}
                  </li>
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
