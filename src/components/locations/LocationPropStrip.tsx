import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { VariantPickerGrid, type VariantRecord } from '@/components/library-hubs/VariantPickerGrid';

const PROP_SLOTS = [
  { id: 'empty', label: 'Empty' },
  { id: 'product-hero', label: 'Product Hero' },
  { id: 'lifestyle', label: 'Lifestyle' },
  { id: 'event', label: 'Event' },
];

export function LocationPropStrip({ locationId }: { locationId: string }) {
  const qc = useQueryClient();
  const { data: propsList = [], isLoading } = useQuery({
    queryKey: ['location-props', locationId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('location_prop_variants')
        .select('id, prop_id, label, image_url')
        .eq('location_id', locationId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as Array<{ id: string; prop_id: string; label: string; image_url: string }>;
    },
  });

  const generate = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('generate-location-props', {
        body: { location_id: locationId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(`Generated ${data?.generated ?? 0} prop variants`);
      qc.invalidateQueries({ queryKey: ['location-props', locationId] });
    },
    onError: (e: any) => toast.error(e?.message || 'Prop generation failed'),
  });

  const variantsBySlot = new Map<string, VariantRecord>(
    propsList.map((p) => [p.prop_id, { variantId: p.id, label: p.label, imageUrl: p.image_url }]),
  );

  return (
    <VariantPickerGrid
      axis="prop"
      layout="strip"
      slots={PROP_SLOTS}
      variantsBySlot={variantsBySlot}
      isLoading={isLoading}
      onGenerate={() => generate.mutate()}
      isGenerating={generate.isPending}
    />
  );
}
