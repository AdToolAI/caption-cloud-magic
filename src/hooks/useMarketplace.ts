import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { MarketplaceTemplate, PurchaseResult, PricingType, TemplateRating, CreatorEarning } from '@/types/marketplace';

interface MarketplaceFilters {
  pricingType?: PricingType | 'all';
  useCase?: string;
  style?: string;
  minRating?: number;
  sort?: 'trending' | 'top_rated' | 'newest' | 'price_asc' | 'price_desc';
}

export function useMarketplaceTemplates(filters: MarketplaceFilters = {}) {
  return useQuery({
    queryKey: ['marketplace-templates', filters],
    queryFn: async () => {
      let query = supabase
        .from('motion_studio_templates' as any)
        .select('*')
        .eq('marketplace_status', 'published');

      if (filters.pricingType && filters.pricingType !== 'all') {
        query = query.eq('pricing_type', filters.pricingType);
      }
      if (filters.useCase) query = query.eq('use_case', filters.useCase);
      if (filters.style) query = query.eq('style', filters.style);
      if (filters.minRating) query = query.gte('average_rating', filters.minRating);

      switch (filters.sort) {
        case 'top_rated':
          query = query.order('average_rating', { ascending: false }).order('total_ratings', { ascending: false });
          break;
        case 'newest':
          query = query.order('published_at', { ascending: false });
          break;
        case 'price_asc':
          query = query.order('price_credits', { ascending: true });
          break;
        case 'price_desc':
          query = query.order('price_credits', { ascending: false });
          break;
        case 'trending':
        default:
          query = query.order('total_purchases', { ascending: false }).order('published_at', { ascending: false });
      }

      const { data, error } = await query.limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as MarketplaceTemplate[];
    },
    staleTime: 60 * 1000,
  });
}

export function useMyOwnedTemplates() {
  return useQuery({
    queryKey: ['marketplace-owned'],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) return [];

      const { data, error } = await supabase
        .from('template_purchases' as any)
        .select('template_id')
        .eq('buyer_user_id', userData.user.id);

      if (error) throw error;
      return ((data ?? []) as any[]).map(r => r.template_id as string);
    },
  });
}

export function useTemplatePurchase() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (templateId: string): Promise<PurchaseResult> => {
      const { data, error } = await supabase.functions.invoke('purchase-marketplace-template', {
        body: { templateId },
      });
      if (error) throw error;
      return data as PurchaseResult;
    },
    onSuccess: (result) => {
      if (!result.ok) {
        const msg =
          result.error === 'INSUFFICIENT_CREDITS'
            ? `Nicht genug Credits — du brauchst ${result.required}, hast aber nur ${result.balance}.`
            : result.error === 'CANNOT_BUY_OWN_TEMPLATE'
            ? 'Du kannst dein eigenes Template nicht kaufen.'
            : `Kauf fehlgeschlagen: ${result.error}`;
        toast({ title: 'Fehler', description: msg, variant: 'destructive' });
        return;
      }
      if (result.already_owned) {
        toast({ title: 'Bereits gekauft', description: 'Du besitzt dieses Template bereits.' });
      } else if (result.price_credits === 0) {
        toast({ title: 'Template hinzugefügt', description: 'Free-Template ist jetzt in deiner Bibliothek.' });
      } else {
        toast({
          title: 'Kauf erfolgreich',
          description: `${result.price_credits} Credits abgebucht. Creator erhält ${result.creator_earned}.`,
        });
      }
      queryClient.invalidateQueries({ queryKey: ['marketplace-owned'] });
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      queryClient.invalidateQueries({ queryKey: ['marketplace-templates'] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Unbekannter Fehler';
      toast({ title: 'Kauf fehlgeschlagen', description: msg, variant: 'destructive' });
    },
  });
}

export function useMyMarketplaceTemplates() {
  return useQuery({
    queryKey: ['my-marketplace-templates'],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) return [];

      const { data, error } = await supabase
        .from('motion_studio_templates' as any)
        .select('*')
        .eq('creator_user_id', userData.user.id)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as unknown as MarketplaceTemplate[];
    },
  });
}

export function useSubmitTemplateToMarketplace() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (args: { templateId: string; pricingType: PricingType; priceCredits: number }) => {
      const { data, error } = await supabase.functions.invoke('submit-template-to-marketplace', {
        body: args,
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error ?? 'Submit failed');
      return data;
    },
    onSuccess: (data) => {
      const isPublished = data.status === 'published';
      toast({
        title: isPublished ? 'Live im Marketplace' : 'Eingereicht',
        description: isPublished
          ? 'Dein Free-Template ist jetzt öffentlich verfügbar.'
          : 'Dein Premium-Template wartet auf Admin-Freigabe.',
      });
      queryClient.invalidateQueries({ queryKey: ['my-marketplace-templates'] });
      queryClient.invalidateQueries({ queryKey: ['marketplace-templates'] });
      queryClient.invalidateQueries({ queryKey: ['admin-pending-templates'] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Unbekannter Fehler';
      toast({ title: 'Einreichung fehlgeschlagen', description: msg, variant: 'destructive' });
    },
  });
}

export function useCreatorEarnings() {
  return useQuery({
    queryKey: ['creator-earnings'],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) return { ledger: [] as CreatorEarning[], total: 0 };

      const { data, error } = await supabase
        .from('creator_earnings_ledger' as any)
        .select('*')
        .eq('creator_user_id', userData.user.id)
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;
      const ledger = (data ?? []) as unknown as CreatorEarning[];
      const total = ledger.reduce((acc, r) => acc + (r.credits_earned ?? 0), 0);
      return { ledger, total };
    },
  });
}

export function useTemplateRatings(templateId: string | null) {
  return useQuery({
    queryKey: ['template-ratings', templateId],
    enabled: !!templateId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('template_marketplace_ratings' as any)
        .select('*')
        .eq('template_id', templateId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as TemplateRating[];
    },
  });
}

export function useSubmitRating() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (args: { templateId: string; rating: number; reviewText?: string }) => {
      const { data, error } = await supabase.functions.invoke('submit-template-rating', { body: args });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error ?? 'Rating failed');
      return data;
    },
    onSuccess: (_d, vars) => {
      toast({ title: 'Bewertung gespeichert', description: 'Danke für dein Feedback!' });
      queryClient.invalidateQueries({ queryKey: ['template-ratings', vars.templateId] });
      queryClient.invalidateQueries({ queryKey: ['marketplace-templates'] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Unbekannter Fehler';
      toast({ title: 'Bewertung fehlgeschlagen', description: msg, variant: 'destructive' });
    },
  });
}

// Admin
export function usePendingMarketplaceTemplates() {
  return useQuery({
    queryKey: ['admin-pending-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('motion_studio_templates' as any)
        .select('*')
        .eq('marketplace_status', 'pending_review')
        .order('updated_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as MarketplaceTemplate[];
    },
  });
}

export function useReviewTemplate() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (args: { templateId: string; decision: 'approve' | 'reject'; rejectionReason?: string }) => {
      const { data, error } = await supabase.functions.invoke('review-marketplace-template', { body: args });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error ?? 'Review failed');
      return data;
    },
    onSuccess: (_d, vars) => {
      toast({
        title: vars.decision === 'approve' ? 'Freigegeben' : 'Abgelehnt',
        description: vars.decision === 'approve'
          ? 'Template ist jetzt im Marketplace live.'
          : 'Creator wurde über die Ablehnung informiert.',
      });
      queryClient.invalidateQueries({ queryKey: ['admin-pending-templates'] });
      queryClient.invalidateQueries({ queryKey: ['marketplace-templates'] });
    },
    onError: (err: unknown) => {
      toast({ title: 'Aktion fehlgeschlagen', description: err instanceof Error ? err.message : 'Fehler', variant: 'destructive' });
    },
  });
}
