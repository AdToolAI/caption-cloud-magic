/**
 * useVideoPricingCatalog — single source of truth for per-second video prices.
 *
 * Fetches the canonical catalog from the `pricing-catalog` Edge Function so
 * the price shown to the user before generation is identical to what the
 * generate-*-video functions actually deduct.
 *
 * If the fetch fails (e.g. offline), callers must fall back to the local
 * `costPerSecond` on the ToolkitModel — that's the previous behavior, so at
 * worst we regress to the current state.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export type CatalogModel = {
  id: string;
  label: string;
  unit: 'per-second' | 'per-clip';
  /** Effective price for the current account (already discounted). */
  sellEUR: number;
  sellUSD: number;
  /** Undiscounted list price, for strike-through display. */
  listEUR?: number;
  listUSD?: number;
  minDuration?: number;
  maxDuration?: number;
  fixedClipSeconds?: number;
};

type CatalogResponse = {
  version: string;
  discountPercent?: number;
  /** Currency the wallet is denominated in — display MUST follow it. */
  walletCurrency?: 'EUR' | 'USD';
  models: CatalogModel[];
};

async function fetchCatalog(): Promise<CatalogResponse> {
  const { data, error } = await supabase.functions.invoke('pricing-catalog', {
    method: 'GET',
  });
  if (error) throw error;
  return data as CatalogResponse;
}

export function useVideoPricingCatalog() {
  // The catalog is personalized (creator discount), so cache it per user.
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ['video-pricing-catalog', user?.id ?? 'anon'],
    queryFn: fetchCatalog,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });

  const map = new Map<string, CatalogModel>();
  (query.data?.models ?? []).forEach((m) => map.set(m.id, m));

  const discountFactor = (100 - (query.data?.discountPercent ?? 0)) / 100;
  const round2 = (n: number) => Math.round(n * 100) / 100;

  /**
   * Canonical sell price/second (EUR or USD) for a BILLING ID, or `null` when
   * the catalog is not loaded / the id is missing. Callers must pass the
   * tier-scoped pricing id (see `resolvePricingId` in the model registry), not
   * the bare model id — a 480p tier is billed on its own catalog row.
   *
   * Rounded exactly like the backend: `resolveAccountCostPerSecond` rounds the
   * LIST price to 2 decimals first, and the deduction RPC applies the discount
   * afterwards.
   */
  const getPricePerSecond = (pricingId: string, currency: 'EUR' | 'USD'): number | null => {
    const entry = map.get(pricingId);
    if (!entry) return null;
    const list = currency === 'USD'
      ? (entry.listUSD ?? entry.sellUSD)
      : (entry.listEUR ?? entry.sellEUR);
    return round2(round2(list) * discountFactor);
  };

  /**
   * Binding total for a generation, computed exactly like the backend chain:
   *   perSecond = round2(listPrice)                 (accountVideoPricing)
   *   charged   = round2(perSecond * seconds * discountFactor)
   *                                                 (deduct_ai_video_credits)
   * Rounding only once at the end drifts by cents against the deduction.
   */
  const getTotalCost = (
    pricingId: string,
    currency: 'EUR' | 'USD',
    seconds: number,
  ): number | null => {
    const entry = map.get(pricingId);
    if (!entry) return null;
    const list = currency === 'USD'
      ? (entry.listUSD ?? entry.sellUSD)
      : (entry.listEUR ?? entry.sellEUR);
    return round2(round2(list) * seconds * discountFactor);
  };


  return {
    isLoading: query.isLoading,
    isError: query.isError,
    /** True once canonical prices are available — only then may a binding
     *  price be shown / a paid generation be started. */
    isReady: !query.isLoading && (query.data?.models?.length ?? 0) > 0,
    version: query.data?.version,
    discountPercent: query.data?.discountPercent ?? 0,
    /** Currency the account is actually charged in (null while loading). */
    walletCurrency: query.data?.walletCurrency ?? null,
    discountFactor,
    getPricePerSecond,
    getTotalCost,
    getEntry: (modelId: string) => map.get(modelId) ?? null,
  };
}
