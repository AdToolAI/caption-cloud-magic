import { Link } from 'react-router-dom';
import { tx } from '@/lib/i18nText';
import { ShieldCheck, ArrowRight } from 'lucide-react';

/**
 * Kurzfassung der AI Video Refund Policy für Credit-Kauf-Screens.
 * Volltext: /legal/ai-video-refund
 */
export const RefundPolicyMini = ({ compact = false }: { compact?: boolean }) => {
  if (compact) {
    return (
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        {tx({ de: 'Technische Fehler (Timeout, Provider-Crash) werden automatisch erstattet. Vom Nutzer im Preview bestätigte Ergebnisse nicht.', en: 'Technical errors (timeout, provider crash) are refunded automatically. Results confirmed by the user in the preview are not.', es: 'Los errores técnicos (tiempo de espera, fallo del proveedor) se reembolsan automáticamente. Los resultados confirmados por el usuario en la vista previa no.' })}{' '}
        <Link to="/legal/ai-video-refund" className="text-primary hover:underline">
          {tx({ de: 'Refund-Policy →', en: 'Refund policy →', es: 'Política de reembolso →' })}
        </Link>
      </p>
    );
  }

  return (
    <div className="rounded-2xl border border-border/50 bg-card/40 backdrop-blur-sm p-5">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <ShieldCheck className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-foreground mb-1">
            {tx({ de: 'Fair Refund für KI-Video-Credits', en: 'Fair refund for AI video credits', es: 'Reembolso justo para créditos de video con IA' })}
          </h4>
          <ul className="text-xs text-muted-foreground space-y-1 mb-2">
            <li>
              <span className="text-emerald-500">✓</span> {tx({ de: <>Technische Fehler (Timeout, Provider 5xx, Mux-Crash) → <strong>automatischer Refund</strong>.</>, en: <>Technical errors (timeout, provider 5xx, Mux crash) → <strong>automatic refund</strong>.</>, es: <>Errores técnicos (tiempo de espera, proveedor 5xx, fallo de Mux) → <strong>reembolso automático</strong>.</> })}
            </li>
            <li>
              <span className="text-destructive">✗</span> {tx({ de: 'Im Preview bestätigte Ergebnisse (Framing, Style, Face-Drift) → kein automatischer Refund.', en: 'Results confirmed in the preview (framing, style, face drift) → no automatic refund.', es: 'Resultados confirmados en la vista previa (encuadre, estilo, deriva facial) → sin reembolso automático.' })}
            </li>
            <li>
              <span className="text-primary">•</span> {tx({ de: 'Preview-Re-Rolls kosten nur ~1 Credit — kein Render-Spend vor deiner Bestätigung.', en: 'Preview re-rolls cost only ~1 credit — no render spend before your confirmation.', es: 'Las repeticiones de vista previa cuestan solo ~1 crédito — sin gasto de renderizado antes de tu confirmación.' })}
            </li>
          </ul>
          <Link
            to="/legal/ai-video-refund"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-gold-dark transition-colors"
          >
            {tx({ de: 'Vollständige Refund-Policy', en: 'Full refund policy', es: 'Política de reembolso completa' })}
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </div>
  );
};
