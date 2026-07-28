import { Link } from 'react-router-dom';
import { ShieldCheck, ArrowRight } from 'lucide-react';

/**
 * Kurzfassung der AI Video Refund Policy für Credit-Kauf-Screens.
 * Volltext: /legal/ai-video-refund
 */
export const RefundPolicyMini = ({ compact = false }: { compact?: boolean }) => {
  if (compact) {
    return (
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Technische Fehler (Timeout, Provider-Crash) werden automatisch erstattet. Vom Nutzer im
        Preview bestätigte Ergebnisse nicht.{' '}
        <Link to="/legal/ai-video-refund" className="text-primary hover:underline">
          Refund-Policy →
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
            Fair Refund für KI-Video-Credits
          </h4>
          <ul className="text-xs text-muted-foreground space-y-1 mb-2">
            <li>
              <span className="text-emerald-500">✓</span> Technische Fehler (Timeout, Provider
              5xx, Mux-Crash) → <strong>automatischer Refund</strong>.
            </li>
            <li>
              <span className="text-destructive">✗</span> Im Preview bestätigte Ergebnisse
              (Framing, Style, Face-Drift) → kein automatischer Refund.
            </li>
            <li>
              <span className="text-primary">•</span> Preview-Re-Rolls kosten nur ~1 Credit —
              kein Render-Spend vor deiner Bestätigung.
            </li>
          </ul>
          <Link
            to="/legal/ai-video-refund"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-gold-dark transition-colors"
          >
            Vollständige Refund-Policy
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </div>
  );
};
