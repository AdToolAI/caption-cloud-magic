import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { BrandCharacter } from './useBrandCharacters';

/**
 * Returns ALL characters the current user can use:
 *  - Their own (any marketplace_status, not archived)
 *  - Characters they purchased from the marketplace (still published, not refunded)
 *
 * Single source of truth for studios (Toolkit, Composer, TalkingHead).
 */
export interface AccessibleCharacter extends BrandCharacter {
  source: 'owned' | 'purchased';
  purchase_id?: string;
  license_version?: string;
}

export function useAccessibleCharacters() {
  return useQuery({
    queryKey: ['accessible-characters'],
    staleTime: 30_000,
    queryFn: async (): Promise<AccessibleCharacter[]> => {
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) return [];

      // 1) Own
      const ownPromise = supabase
        .from('brand_characters')
        .select('*')
        .eq('user_id', u.user.id)
        .is('archived_at', null);

      // 2) Purchased (active, non-refunded)
      const purchasedPromise = supabase
        .from('character_purchases')
        .select('id, character_id, license_version, refunded_at')
        .eq('buyer_user_id', u.user.id)
        .is('refunded_at', null);

      const [{ data: own, error: ownErr }, { data: purch, error: purchErr }] =
        await Promise.all([ownPromise, purchasedPromise]);

      if (ownErr) throw ownErr;
      if (purchErr) throw purchErr;

      const ownList: AccessibleCharacter[] = (own ?? []).map((c) => ({
        ...(c as unknown as BrandCharacter),
        source: 'owned',
      }));

      const purchasedIds = (purch ?? []).map((p) => p.character_id);
      let purchasedList: AccessibleCharacter[] = [];

      if (purchasedIds.length > 0) {
        const { data: chars, error: chErr } = await supabase
          .from('brand_characters')
          .select('*')
          .in('id', purchasedIds)
          .eq('marketplace_status', 'published');
        if (chErr) throw chErr;

        const byId = new Map((chars ?? []).map((c: any) => [c.id, c]));
        purchasedList = (purch ?? [])
          .map((p): AccessibleCharacter | null => {
            const c = byId.get(p.character_id);
            if (!c) return null;
            return {
              ...(c as unknown as BrandCharacter),
              source: 'purchased',
              purchase_id: p.id,
              license_version: p.license_version ?? undefined,
            };
          })
          .filter((x): x is AccessibleCharacter => x !== null);
      }

      // De-dupe (someone could own AND have purchased their own — keep owned)
      const seen = new Set<string>();
      const out: AccessibleCharacter[] = [];
      for (const c of [...ownList, ...purchasedList]) {
        if (seen.has(c.id)) continue;
        seen.add(c.id);
        out.push(c);
      }
      return out;
    },
  });
}
