import { Check, X, Sparkles } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

interface CouponBannerProps {
  code: string;
  onRemove: () => void;
}

/**
 * James-Bond-2028 styled banner shown when a coupon is auto-applied
 * via URL (e.g. from win-back emails). Gold accent + glassmorphism.
 */
export function CouponBanner({ code, onRemove }: CouponBannerProps) {
  const { t } = useTranslation();

  return (
    <div className="relative max-w-3xl mx-auto mb-12">
      {/* Gold glow */}
      <div className="absolute -inset-1 bg-gradient-to-r from-primary/30 via-accent/40 to-primary/30 blur-xl opacity-60" />

      <div className="relative flex items-center gap-4 rounded-2xl border border-primary/40 bg-card/80 backdrop-blur-xl px-6 py-5 shadow-2xl shadow-primary/20">
        <div className="flex-shrink-0 w-12 h-12 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/40">
          <Check className="w-6 h-6 text-primary-foreground" strokeWidth={3} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-xs font-bold uppercase tracking-widest text-primary">
              {t('pricing.couponBanner.label')}
            </span>
          </div>
          <p className="text-base font-semibold text-foreground">
            <span className="font-mono px-2 py-0.5 rounded bg-primary/15 text-primary border border-primary/30 mr-2">
              {code}
            </span>
            {t('pricing.couponBanner.message')}
          </p>
        </div>

        <button
          onClick={onRemove}
          className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label={t('pricing.couponBanner.remove')}
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
