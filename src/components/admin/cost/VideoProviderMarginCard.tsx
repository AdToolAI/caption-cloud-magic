import { useMemo } from 'react';
import { AlertTriangle, TrendingUp, Crown } from 'lucide-react';
import {
  VIDEO_PROVIDER_MARGINS,
  computeMarginPct,
  blendedMargin,
  MARGIN_FLOOR,
} from '@/lib/cost/videoProviderMargins';

const eur = (n: number) => `€${n.toFixed(2)}`;
const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

export function VideoProviderMarginCard() {
  const rows = useMemo(
    () =>
      [...VIDEO_PROVIDER_MARGINS]
        .map((r) => ({ ...r, margin: computeMarginPct(r) }))
        .sort((a, b) => a.margin - b.margin),
    []
  );
  const avg = useMemo(() => blendedMargin(), []);
  const lowCount = rows.filter((r) => r.margin < MARGIN_FLOOR).length;

  return (
    <div className="rounded-2xl border border-border bg-card/60 backdrop-blur p-5 shadow-[0_8px_24px_-12px_rgba(245,199,106,0.15)]">
      <header className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-amber-300" />
            <h3 className="text-base font-semibold tracking-tight">Video-Provider Live-Marge</h3>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Verkaufspreis vs. Replicate-Cost · alle 11 Video-Provider · Lipsync/Audio nicht enthalten
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold tabular-nums text-amber-200">{pct(avg)}</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Blended</div>
        </div>
      </header>

      {lowCount > 0 && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
          <AlertTriangle className="h-3.5 w-3.5" />
          {lowCount} {lowCount === 1 ? 'Provider liegt' : 'Provider liegen'} unter dem 60%-Marge-Boden.
        </div>
      )}

      <div className="overflow-x-auto -mx-2">
        <table className="w-full text-xs">
          <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-2 py-1.5">Provider</th>
              <th className="text-right font-medium px-2 py-1.5">Verkauf</th>
              <th className="text-right font-medium px-2 py-1.5">Cost</th>
              <th className="text-right font-medium px-2 py-1.5">Marge</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const low = r.margin < MARGIN_FLOOR;
              return (
                <tr key={r.id} className="border-t border-border/40 hover:bg-muted/20 transition-colors">
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className={low ? 'text-amber-200' : 'text-foreground'}>{r.label}</span>
                      {r.tier === 'premium-engine' && (
                        <span
                          className="inline-flex items-center gap-1 rounded-md border border-amber-400/30 bg-amber-400/5 px-1.5 py-0.5 text-[9px] font-medium text-amber-300"
                          title="Premium-Engine: echte Provider-Kosten an User durchgereicht"
                        >
                          <Crown className="h-2.5 w-2.5" />
                          Premium
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {r.unit === 'per-second' ? '€/Sekunde' : '€/Clip (5s flat)'}
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{eur(r.sellEUR)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{eur(r.costEUR)}</td>
                  <td className="px-2 py-1.5 text-right">
                    <span
                      className={
                        'inline-flex items-center justify-end gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ' +
                        (low
                          ? 'bg-amber-500/15 text-amber-200'
                          : 'bg-emerald-500/10 text-emerald-300')
                      }
                    >
                      {low && <AlertTriangle className="h-2.5 w-2.5" />}
                      {pct(r.margin)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[10px] text-muted-foreground/70 leading-relaxed">
        Quelle: Replicate / Runway Listenpreise (Juni 2026). Stückkosten sind Schätzungen.
        Lipsync (Sync.so), HeyGen, ElevenLabs, Music & Picture Studio bleiben unverändert.
      </p>
    </div>
  );
}
