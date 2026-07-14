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

export type CatalogModel = {
  id: string;
  label: string;
  unit: 'per-second' | 'per-clip';
  sellEUR: number;
  sellUSD: number;
  minDuration?: number;
  maxDuration?: number;
  fixedClipSeconds?: number;
};

type CatalogResponse = {
  version: string;
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
  const query = useQuery({
    queryKey: ['video-pricing-catalog'],
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

  return {
    isLoading: query.isLoading,
    isError: query.isError,
    version: query.data?.version,
    getPricePerSecond,
    getEntry: (modelId: string) => map.get(modelId) ?? null,
  };
}
