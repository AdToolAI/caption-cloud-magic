import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { VariantPickerGrid, type VariantRecord } from '@/components/library-hubs/VariantPickerGrid';

const VIBE_SLOTS = [
  { id: 'golden-hour', label: 'Golden Hour' },
  { id: 'blue-hour', label: 'Blue Hour' },
  { id: 'overcast', label: 'Overcast' },
  { id: 'night-neon', label: 'Night / Neon' },
  { id: 'foggy-dawn', label: 'Foggy Dawn' },
];

export function LocationVibeStrip({ locationId }: { locationId: string }) {
  const qc = useQueryClient();
  const { data: vibes = [], isLoading } = useQuery({
    queryKey: ['location-vibes', locationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('location_vibe_variants')
        .select('id, vibe_id, label, image_url')
        .eq('location_id', locationId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const generate = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('generate-location-vibes', {
        body: { location_id: locationId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(`Generated ${data?.generated ?? 0} vibe variants`);
      qc.invalidateQueries({ queryKey: ['location-vibes', locationId] });
    },
    onError: (e: any) => toast.error(e?.message || 'Vibe generation failed'),
  });

  const variantsBySlot = new Map<string, VariantRecord>(
    vibes.map((v) => [v.vibe_id, { variantId: v.id, label: v.label, imageUrl: v.image_url }]),
  );

  return (
    <VariantPickerGrid
      axis="vibe"
      layout="strip"
      slots={VIBE_SLOTS}
      variantsBySlot={variantsBySlot}
      isLoading={isLoading}
      onGenerate={() => generate.mutate()}
      isGenerating={generate.isPending}
    />
  );
}
