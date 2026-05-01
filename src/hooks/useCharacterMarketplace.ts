import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { trackEvent, ANALYTICS_EVENTS } from '@/lib/analytics';

export interface MarketplaceCharacter {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  reference_image_url: string;
  portrait_url: string | null;
  default_voice_name: string | null;
  default_voice_id: string | null;
  marketplace_status: string;
  pricing_type: 'free' | 'premium';
  price_credits: number;
  origin_type: 'ai_generated' | 'licensed_real_person' | 'self_portrait' | null;
  origin_metadata: Record<string, unknown>;
  sample_video_urls: string[];
  voice_sample_url: string | null;
  tags: string[];
  total_purchases: number;
  average_rating: number;
  total_ratings: number;
  published_at: string | null;
  nsfw_flag: boolean;
}

export function useMarketplaceCharacters() {
  return useQuery({
    queryKey: ['marketplace-characters'],
    queryFn: async (): Promise<MarketplaceCharacter[]> => {
      const { data, error } = await supabase
        .from('brand_characters')
        .select('*')
        .eq('marketplace_status', 'published')
        .order('published_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as MarketplaceCharacter[];
    },
  });
}

export function useMyPurchasedCharacterIds() {
  return useQuery({
    queryKey: ['character-purchases-mine'],
    queryFn: async (): Promise<string[]> => {
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) return [];
      const { data, error } = await supabase
        .from('character_purchases')
        .select('character_id')
        .eq('buyer_user_id', u.user.id)
        .is('refunded_at', null);
      if (error) throw error;
      return (data ?? []).map((r) => r.character_id);
    },
  });
}

export function usePurchaseCharacter() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (characterId: string) => {
      const { data, error } = await supabase.functions.invoke('purchase-marketplace-character', {
        body: { characterId, licenseAccepted: true },
      });
      if (error) throw error;
      return data as { ok: boolean; already_owned?: boolean; price_credits?: number; error?: string };
    },
    onSuccess: (res) => {
      if (res.ok) {
        toast({ title: res.already_owned ? 'Already owned' : 'Character unlocked', description: res.already_owned ? 'You already own this character.' : `${res.price_credits ?? 0} credits charged.` });
        qc.invalidateQueries({ queryKey: ['character-purchases-mine'] });
        qc.invalidateQueries({ queryKey: ['brand-characters'] });
      } else {
        toast({ title: 'Purchase failed', description: res.error ?? 'Unknown error', variant: 'destructive' });
      }
    },
    onError: (e: unknown) => {
      toast({ title: 'Purchase failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    },
  });
}

export interface SubmitCharacterPayload {
  characterId: string;
  pricingType: 'free' | 'premium';
  priceCredits: number;
  originType: 'ai_generated' | 'licensed_real_person' | 'self_portrait';
  originMetadata: Record<string, unknown>;
  licenseReleasePath?: string;
  sampleVideoUrls?: string[];
  voiceSampleUrl?: string;
  tags?: string[];
  nsfwFlag?: boolean;
  consents: Record<string, boolean>;
}

export function useSubmitCharacterToMarketplace() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (payload: SubmitCharacterPayload) => {
      const { data, error } = await supabase.functions.invoke('submit-character-to-marketplace', { body: payload });
      if (error) throw error;
      return data as { ok: boolean; status?: string; error?: string };
    },
    onSuccess: (res) => {
      if (res.ok) {
        toast({ title: res.status === 'published' ? 'Published live' : 'Submitted for review', description: res.status === 'published' ? 'Your character is now in the marketplace.' : 'Admins typically review within 24 hours.' });
        qc.invalidateQueries({ queryKey: ['marketplace-characters'] });
        qc.invalidateQueries({ queryKey: ['brand-characters'] });
      } else {
        toast({ title: 'Submission failed', description: res.error ?? 'Unknown error', variant: 'destructive' });
      }
    },
    onError: (e: unknown) => {
      toast({ title: 'Submission failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    },
  });
}

export function useReportCharacter() {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: { characterId: string; reason: string; description: string; reporterEmail?: string }) => {
      const { data, error } = await supabase.functions.invoke('report-marketplace-character', { body: input });
      if (error) throw error;
      return data as { ok: boolean; reportId?: string; quarantined?: boolean; error?: string };
    },
    onSuccess: (res) => {
      if (res.ok) toast({ title: 'Report submitted', description: res.quarantined ? 'Character quarantined pending review.' : 'Thank you — our team will investigate.' });
      else toast({ title: 'Report failed', description: res.error ?? 'Unknown error', variant: 'destructive' });
    },
  });
}
