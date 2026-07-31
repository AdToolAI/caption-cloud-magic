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
  /** Older Cast & World rows with the same normalized name. */
  aliasIds?: string[];
}

function normalizedCharacterName(name: string | null | undefined): string {
  return String(name ?? '').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

function characterPriority(character: AccessibleCharacter): number {
  const row = character as AccessibleCharacter & Record<string, unknown>;
  let score = character.source === 'owned' ? 10_000 : 0;
  if (character.reference_image_url) score += 1_000;
  if (character.description) score += 100;
  if (row.identity_card || row.identity_card_json) score += 50;
  const updated = Date.parse(String(row.updated_at ?? row.created_at ?? ''));
  if (Number.isFinite(updated)) score += updated / 1_000_000_000_000;
  return score;
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

      // Cast & World is the single character source. Collapse both duplicate
      // ids and duplicate names so every person is offered exactly once.
      const byId = new Map<string, AccessibleCharacter>();
      for (const c of [...ownList, ...purchasedList]) {
        const current = byId.get(c.id);
        if (!current || characterPriority(c) > characterPriority(current)) byId.set(c.id, c);
      }

      const byName = new Map<string, AccessibleCharacter[]>();
      for (const c of byId.values()) {
        const key = normalizedCharacterName(c.name) || `id:${c.id}`;
        const group = byName.get(key) ?? [];
        group.push(c);
        byName.set(key, group);
      }

      return Array.from(byName.values()).map((group) => {
        const ranked = [...group].sort((a, b) => characterPriority(b) - characterPriority(a));
        const winner = ranked[0];
        if (!winner) throw new Error('Invalid empty Cast & World character group');
        return {
          ...winner,
          aliasIds: ranked.slice(1).map((c) => c.id),
        };
      });
    },
  });
}
