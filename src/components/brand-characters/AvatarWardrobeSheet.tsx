import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { VariantPickerGrid, type VariantRecord } from '@/components/library-hubs/VariantPickerGrid';

const OUTFIT_SLOTS = [
  { id: 'casual', label: 'Casual' },
  { id: 'formal', label: 'Formal' },
  { id: 'action', label: 'Action' },
  { id: 'brand', label: 'Brand' },
];

export function AvatarWardrobeSheet({ avatarId }: { avatarId: string }) {
  const qc = useQueryClient();
  const { data: outfits = [], isLoading } = useQuery({
    queryKey: ['avatar-wardrobe', avatarId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('avatar_wardrobe_variants')
        .select('id, outfit_id, label, image_url')
        .eq('avatar_id', avatarId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as Array<{ id: string; outfit_id: string; label: string; image_url: string }>;
    },
  });

  const generate = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('generate-avatar-wardrobe', {
        body: { avatar_id: avatarId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(`Generated ${data?.generated ?? 0} wardrobe variants`);
      qc.invalidateQueries({ queryKey: ['avatar-wardrobe', avatarId] });
    },
    onError: (e: any) => toast.error(e?.message || 'Wardrobe generation failed'),
  });

  const variantsBySlot = new Map<string, VariantRecord>(
    outfits.map((o) => [o.outfit_id, { variantId: o.id, label: o.label, imageUrl: o.image_url }]),
  );

  return (
    <VariantPickerGrid
      axis="wardrobe"
      slots={OUTFIT_SLOTS}
      variantsBySlot={variantsBySlot}
      isLoading={isLoading}
      onGenerate={() => generate.mutate()}
      isGenerating={generate.isPending}
    />
  );
}
