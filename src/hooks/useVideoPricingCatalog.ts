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

  /** Returns the canonical sell price/second (EUR or USD), or `null` if the
   *  catalog is not loaded / model is missing. Callers should fall back to
   *  the local config when this is null. */
  const getPricePerSecond = (modelId: string, currency: 'EUR' | 'USD'): number | null => {
    const entry = map.get(modelId);
    if (!entry) return null;
    return currency === 'USD' ? entry.sellUSD : entry.sellEUR;
  };

  const discountFactor = (100 - (query.data?.discountPercent ?? 0)) / 100;

  /**
   * Binding total for a generation, computed exactly like the backend:
   * `deduct_ai_video_credits` rounds `list * seconds * discountFactor` once,
   * at the end. Rounding the per-second price first would drift by cents.
   */
  const getTotalCost = (
    modelId: string,
    currency: 'EUR' | 'USD',
    seconds: number,
  ): number | null => {
    const entry = map.get(modelId);
    if (!entry) return null;
    const list = currency === 'USD'
      ? (entry.listUSD ?? entry.sellUSD)
      : (entry.listEUR ?? entry.sellEUR);
    return Math.round(list * seconds * discountFactor * 100) / 100;
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
