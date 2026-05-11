import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { VariantPickerGrid, type VariantRecord } from '@/components/library-hubs/VariantPickerGrid';

const POSE_SLOTS = [
  { id: 'frontal-hero', label: 'Frontal Hero' },
  { id: 'three-quarter', label: '3/4 Turn' },
  { id: 'profile', label: 'Side Profile' },
  { id: 'action', label: 'Action / Walking' },
];

export function AvatarPoseSheet({ avatarId }: { avatarId: string }) {
  const qc = useQueryClient();
  const { data: poses = [], isLoading } = useQuery({
    queryKey: ['avatar-poses', avatarId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('avatar_pose_variants')
        .select('id, pose_id, label, image_url')
        .eq('avatar_id', avatarId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const generate = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('generate-avatar-poses', {
        body: { avatar_id: avatarId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(`Generated ${data?.generated ?? 0} pose variants`);
      qc.invalidateQueries({ queryKey: ['avatar-poses', avatarId] });
    },
    onError: (e: any) => toast.error(e?.message || 'Pose generation failed'),
  });

  const variantsBySlot = new Map<string, VariantRecord>(
    poses.map((p) => [p.pose_id, { variantId: p.id, label: p.label, imageUrl: p.image_url }]),
  );

  return (
    <VariantPickerGrid
      axis="pose"
      slots={POSE_SLOTS}
      variantsBySlot={variantsBySlot}
      isLoading={isLoading}
      onGenerate={() => generate.mutate()}
      isGenerating={generate.isPending}
    />
  );
}
