import { tx } from "@/lib/i18nText";
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
            ? tx({ de: `Nicht genug Credits — du brauchst ${result.required}, hast aber nur ${result.balance}.`, en: `Not enough credits — you need ${result.required} but only have ${result.balance}.`, es: `No hay suficientes créditos: necesitas ${result.required} pero solo tienes ${result.balance}.` })
            : result.error === 'CANNOT_BUY_OWN_TEMPLATE'
            ? tx({ de: 'Du kannst dein eigenes Template nicht kaufen.', en: 'You cannot buy your own template.', es: 'No puedes comprar tu propia plantilla.' })
            : tx({ de: `Kauf fehlgeschlagen: ${result.error}`, en: `Purchase failed: ${result.error}`, es: `Error en la compra: ${result.error}` });
        toast({ title: tx({ de: 'Fehler', en: 'Error', es: 'Error' }), description: msg, variant: 'destructive' });
        return;
      }
      if (result.already_owned) {
        toast({ title: tx({ de: 'Bereits gekauft', en: 'Already purchased', es: 'Ya comprado' }), description: tx({ de: 'Du besitzt dieses Template bereits.', en: 'You already own this template.', es: 'Ya posees esta plantilla.' }) });
      } else if (result.price_credits === 0) {
        toast({ title: tx({ de: 'Template hinzugefügt', en: 'Added template', es: 'Plantilla agregada' }), description: tx({ de: 'Free-Template ist jetzt in deiner Bibliothek.', en: 'Free template is now in your library.', es: 'La plantilla gratuita ya está en tu biblioteca.' }) });
      } else {
        toast({
          title: tx({ de: 'Kauf erfolgreich', en: 'Purchase successful', es: 'Compra exitosa' }),
          description: tx({ de: `${result.price_credits} Credits abgebucht. Creator erhält ${result.creator_earned}.`, en: `${result.price_credits} credits deducted. Creator receives ${result.creator_earned}.`, es: `${result.price_credits} créditos debitados. El creador recibe ${result.creator_earned}.` }),
        });
      }
      queryClient.invalidateQueries({ queryKey: ['marketplace-owned'] });
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      queryClient.invalidateQueries({ queryKey: ['marketplace-templates'] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : tx({ de: 'Unbekannter Fehler', en: 'Unknown error', es: 'Error desconocido' });
      toast({ title: tx({ de: 'Kauf fehlgeschlagen', en: 'Purchase failed', es: 'Compra fallida' }), description: msg, variant: 'destructive' });
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
        title: isPublished ? tx({ de: "Live im Marketplace", en: "Live in marketplace", es: "En vivo en el marketplace" }) : 'Eingereicht',
        description: isPublished
          ? tx({ de: 'Dein Free-Template ist jetzt öffentlich verfügbar.', en: 'Your free template is now publicly available.', es: 'Tu plantilla gratuita ya está disponible públicamente.' })
          : tx({ de: 'Dein Premium-Template wartet auf Admin-Freigabe.', en: 'Your premium template is waiting for admin approval.', es: 'Su plantilla premium está esperando la aprobación del administrador.' }),
      });
      queryClient.invalidateQueries({ queryKey: ['my-marketplace-templates'] });
      queryClient.invalidateQueries({ queryKey: ['marketplace-templates'] });
      queryClient.invalidateQueries({ queryKey: ['admin-pending-templates'] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : tx({ de: 'Unbekannter Fehler', en: 'Unknown error', es: 'Error desconocido' });
      toast({ title: tx({ de: 'Einreichung fehlgeschlagen', en: 'Submission failed', es: 'Envío fallido' }), description: msg, variant: 'destructive' });
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
      toast({ title: tx({ de: 'Bewertung gespeichert', en: 'Rating saved', es: 'Calificación guardada' }), description: tx({ de: 'Danke für dein Feedback!', en: 'Thanks for your feedback!', es: '¡Gracias por tus comentarios!' }) });
      queryClient.invalidateQueries({ queryKey: ['template-ratings', vars.templateId] });
      queryClient.invalidateQueries({ queryKey: ['marketplace-templates'] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : tx({ de: 'Unbekannter Fehler', en: 'Unknown error', es: 'Error desconocido' });
      toast({ title: tx({ de: 'Bewertung fehlgeschlagen', en: 'Rating failed', es: 'Calificación fallida' }), description: msg, variant: 'destructive' });
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
          ? tx({ de: 'Template ist jetzt im Marketplace live.', en: 'Template is now live on the Marketplace.', es: 'La plantilla ya está disponible en el Marketplace.' })
          : tx({ de: 'Creator wurde über die Ablehnung informiert.', en: 'Creator has been informed about the rejection.', es: 'Se ha informado al creador sobre el rechazo.' }),
      });
      queryClient.invalidateQueries({ queryKey: ['admin-pending-templates'] });
      queryClient.invalidateQueries({ queryKey: ['marketplace-templates'] });
    },
    onError: (err: unknown) => {
      toast({ title: tx({ de: 'Aktion fehlgeschlagen', en: 'Action failed', es: 'Acción fallida' }), description: err instanceof Error ? err.message : tx({ de: 'Fehler', en: 'Error', es: 'Error' }), variant: 'destructive' });
    },
  });
}
