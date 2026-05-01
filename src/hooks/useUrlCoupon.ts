import { useCallback, useEffect, useState } from 'react';
import { trackEvent, ANALYTICS_EVENTS } from '@/lib/analytics';

const STORAGE_KEY = 'adtool_url_coupon';

/**
 * Reads a coupon code from the URL (`?coupon=XYZ`) on mount and
 * persists it in sessionStorage so it survives navigation within
 * the pricing/checkout flow. The coupon is passed straight through
 * to Stripe Checkout — no DB validation required.
 */
export function useUrlCoupon() {
  const [couponCode, setCouponCode] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return sessionStorage.getItem(STORAGE_KEY);
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('coupon');
    if (fromUrl && fromUrl.trim()) {
      const normalized = fromUrl.trim().toUpperCase();
      sessionStorage.setItem(STORAGE_KEY, normalized);
      setCouponCode(normalized);
      trackEvent(ANALYTICS_EVENTS.COUPON_APPLIED, {
        coupon: normalized,
        source: 'url',
      });

      // Clean ?coupon= from the URL so refreshes stay tidy
      params.delete('coupon');
      const newSearch = params.toString();
      const newUrl =
        window.location.pathname +
        (newSearch ? `?${newSearch}` : '') +
        window.location.hash;
      window.history.replaceState({}, '', newUrl);
    }
  }, []);

  const clearCoupon = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setCouponCode(null);
  }, []);

  return { couponCode, clearCoupon };
}
