import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Gauge, ShieldAlert } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { tx } from '@/lib/i18nText';
import {
  VIDEO_PRICING_HARD_MULTIPLIER_CAP,
  VIDEO_PRICING_TARGET_MIN_MULTIPLIER,
} from '@/lib/videoEnhance/rates';

interface RunRow {
  id: string;
  model_id: string;
  resolution: string;
  fps: number | null;
  tier: string | null;
  status: string;
  user_price_eur: number | null;
  provider_cost_usd_estimated: number | null;
  provider_cost_usd_actual: number | null;
  provider_cost_eur_buffered: number | null;
  provider_cost_source: string | null;
  effective_multiplier: number | null;
  verified_effective_multiplier: number | null;
  pricing_gate: string | null;
  overcharge_refund_amount_eur: number | null;
  created_at: string;
}

const eur = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : `€${Number(n).toFixed(2)}`;
const usd = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : `$${Number(n).toFixed(3)}`;

function MultiplierBadge({ value }: { value: number | null }) {
  if (value === null || !Number.isFinite(value)) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-muted/40 px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
        {tx({ de: 'Kosten unbestätigt', en: 'Cost unverified', es: 'Costo sin verificar' })}
      </span>
    );
  }
  const blocked = value > VIDEO_PRICING_HARD_MULTIPLIER_CAP + 1e-9;
  const below = value < VIDEO_PRICING_TARGET_MIN_MULTIPLIER - 1e-9;
  return (
    <span
      className={
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ' +
        (blocked
          ? 'bg-red-500/15 text-red-300'
          : below
            ? 'bg-amber-500/15 text-amber-200'
            : 'bg-emerald-500/10 text-emerald-300')
      }
    >
      {blocked ? <ShieldAlert className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
      {`${value.toFixed(1)}×`}
      {blocked
        ? ` ${tx({ de: 'Pricing blockiert', en: 'Pricing blocked', es: 'Precio bloqueado' })}`
        : ''}
    </span>
  );
}

export function VideoEnhanceMultiplierCard() {
  const [rows, setRows] = useState<RunRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data } = await supabase
        .from('video_enhance_runs')
        .select(
          'id, model_id, resolution, fps, tier, status, user_price_eur, provider_cost_usd_estimated, provider_cost_usd_actual, provider_cost_eur_buffered, provider_cost_source, effective_multiplier, verified_effective_multiplier, pricing_gate, overcharge_refund_amount_eur, created_at',
        )
        .order('created_at', { ascending: false })
        .limit(25);
      if (!active) return;
      setRows((data as RunRow[] | null) ?? []);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const blocked = rows.filter(
    (r) =>
      (r.verified_effective_multiplier ?? r.effective_multiplier ?? 0) >
      VIDEO_PRICING_HARD_MULTIPLIER_CAP + 1e-9,
  ).length;
  const refunded = rows.filter((r) => Number(r.overcharge_refund_amount_eur ?? 0) > 0);

  return (
    <div className="rounded-2xl border border-border bg-card/60 backdrop-blur p-5 shadow-[0_8px_24px_-12px_rgba(245,199,106,0.15)]">
      <header className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <Gauge className="h-4 w-4 text-amber-300" />
            <h3 className="text-base font-semibold tracking-tight">
              {tx({
                de: 'Video Enhance · Effektiver Faktor',
                en: 'Video Enhance · Effective multiplier',
                es: 'Video Enhance · Multiplicador efectivo',
              })}
            </h3>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {tx({
              de: `Kundenpreis ÷ Providerkosten · Zielband ${VIDEO_PRICING_TARGET_MIN_MULTIPLIER}×–${VIDEO_PRICING_HARD_MULTIPLIER_CAP}× · harter Deckel ${VIDEO_PRICING_HARD_MULTIPLIER_CAP}×`,
              en: `Customer price ÷ provider cost · target band ${VIDEO_PRICING_TARGET_MIN_MULTIPLIER}×–${VIDEO_PRICING_HARD_MULTIPLIER_CAP}× · hard cap ${VIDEO_PRICING_HARD_MULTIPLIER_CAP}×`,
              es: `Precio del cliente ÷ costo del proveedor · banda objetivo ${VIDEO_PRICING_TARGET_MIN_MULTIPLIER}×–${VIDEO_PRICING_HARD_MULTIPLIER_CAP}× · tope duro ${VIDEO_PRICING_HARD_MULTIPLIER_CAP}×`,
            })}
          </p>
        </div>
      </header>

      {blocked > 0 && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-300">
          <AlertTriangle className="h-3.5 w-3.5" />
          {tx({
            de: `${blocked} Lauf/Läufe über dem Deckel — Pricing blockiert, Rate Card prüfen.`,
            en: `${blocked} run(s) above the cap — pricing blocked, review the rate card.`,
            es: `${blocked} ejecución(es) por encima del tope — precio bloqueado, revisa la tarifa.`,
          })}
        </div>
      )}

      <div className="overflow-x-auto -mx-2">
        <table className="w-full text-xs">
          <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-2 py-1.5">
                {tx({ de: 'Lauf', en: 'Run', es: 'Ejecución' })}
              </th>
              <th className="text-right font-medium px-2 py-1.5">
                {tx({ de: 'Providerkosten', en: 'Provider cost', es: 'Costo proveedor' })}
              </th>
              <th className="text-right font-medium px-2 py-1.5">
                {tx({ de: 'Gepuffert', en: 'Buffered', es: 'Con margen FX' })}
              </th>
              <th className="text-right font-medium px-2 py-1.5">
                {tx({ de: 'Kundenpreis', en: 'User price', es: 'Precio cliente' })}
              </th>
              <th className="text-right font-medium px-2 py-1.5">
                {tx({ de: 'Faktor', en: 'Multiplier', es: 'Multiplicador' })}
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="px-2 py-3 text-center text-muted-foreground">
                  {tx({ de: 'Lade…', en: 'Loading…', es: 'Cargando…' })}
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-2 py-3 text-center text-muted-foreground">
                  {tx({ de: 'Noch keine Läufe.', en: 'No runs yet.', es: 'Aún no hay ejecuciones.' })}
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border/40 hover:bg-muted/20 transition-colors">
                <td className="px-2 py-1.5">
                  <div>{r.model_id}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {`${r.resolution}/${r.fps ?? '—'}fps · ${r.tier ?? '—'} · ${r.status}`}
                  </div>
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                  <div>{usd(r.provider_cost_usd_actual ?? r.provider_cost_usd_estimated)}</div>
                  <div className="text-[10px]">
                    {r.provider_cost_usd_actual !== null
                      ? (r.provider_cost_source ?? tx({ de: 'verifiziert', en: 'verified', es: 'verificado' }))
                      : tx({ de: 'geschätzt', en: 'estimated', es: 'estimado' })}
                  </div>
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                  {eur(r.provider_cost_eur_buffered)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{eur(r.user_price_eur)}</td>
                <td className="px-2 py-1.5 text-right">
                  <MultiplierBadge
                    value={r.verified_effective_multiplier ?? r.effective_multiplier ?? null}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {refunded.length > 0 && (
        <div className="mt-3 rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2 text-[11px] text-emerald-200">
          <div className="font-medium mb-1">
            {tx({
              de: 'Ausgelöste Gutschriften (Deckel-Ausgleich)',
              en: 'Triggered credits (cap true-up)',
              es: 'Abonos activados (ajuste de tope)',
            })}
          </div>
          <ul className="space-y-0.5">
            {refunded.map((r) => (
              <li key={r.id} className="tabular-nums">
                {`${eur(r.overcharge_refund_amount_eur)} · ${r.model_id} · ${r.id.slice(0, 8)}`}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-3 text-[10px] text-muted-foreground/70 leading-relaxed">
        {tx({
          de: 'Der verifizierte Faktor rechnet auf den echten Providerkosten ohne FX-Puffer. Über dem Deckel wird die Differenz automatisch als Wallet-Gutschrift zurückgegeben — nie nachbelastet.',
          en: 'The verified multiplier is computed on real provider cost without the FX buffer. Above the cap the difference is automatically returned as a wallet credit — never charged back.',
          es: 'El multiplicador verificado se calcula sobre el costo real del proveedor sin margen FX. Por encima del tope, la diferencia se devuelve como abono en la cartera, nunca se cobra de más.',
        })}
      </p>
    </div>
  );
}
