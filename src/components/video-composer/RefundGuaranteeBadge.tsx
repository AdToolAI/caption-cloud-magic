/**
 * RefundGuaranteeBadge — surface the existing automated refund safety
 * net to the user at the moment they commit credits. The refund logic
 * itself is already implemented (see mem://architecture/failure-credit-refund-automation);
 * this badge just communicates it.
 */
import { ShieldCheck } from 'lucide-react';

interface Props {
  /** Compact form for inline placement next to a total. */
  compact?: boolean;
}

export default function RefundGuaranteeBadge({ compact = false }: Props) {
  if (compact) {
    return (
      <div className="inline-flex items-center gap-1 text-[10px] text-emerald-400/90">
        <ShieldCheck className="h-3 w-3" />
        Refund-garantiert
      </div>
    );
  }
  return (
    <div className="rounded-md bg-emerald-500/10 border border-emerald-500/30 px-3 py-2 text-[11px] text-emerald-300 flex items-start gap-1.5">
      <ShieldCheck className="h-3.5 w-3.5 shrink-0 mt-0.5" />
      Bei Render-Fehlern werden alle Credits automatisch zurückerstattet.
    </div>
  );
}
