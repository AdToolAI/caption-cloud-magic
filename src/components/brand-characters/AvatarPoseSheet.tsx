import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Sparkles, Loader2, ImageIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';

interface PoseVariant {
  id: string;
  pose_id: string;
  label: string;
  image_url: string;
}

const PLACEHOLDER_POSES = [
  { id: 'frontal-hero', label: 'Frontal Hero' },
  { id: 'three-quarter', label: '3/4 Turn' },
  { id: 'profile', label: 'Side Profile' },
  { id: 'action', label: 'Action / Walking' },
];

interface Props { avatarId: string }

export function AvatarPoseSheet({ avatarId }: Props) {
  const qc = useQueryClient();
  const { data: poses = [], isLoading } = useQuery({
    queryKey: ['avatar-poses', avatarId],
    queryFn: async (): Promise<PoseVariant[]> => {
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

  const byId = new Map(poses.map((p) => [p.pose_id, p]));

  return (
    <Card className="p-5 bg-card/60 backdrop-blur border-primary/15 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-serif text-xl flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Pose Sheet
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Locked-identity pose variants — same face, different framing. Used as i2v anchor frames in any studio.
          </p>
        </div>
        <Button
          onClick={() => generate.mutate()}
          disabled={generate.isPending}
          className="bg-primary text-primary-foreground"
        >
          {generate.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
          {poses.length > 0 ? 'Regenerate' : 'Generate Pose Sheet'}
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {PLACEHOLDER_POSES.map((p) => {
          const v = byId.get(p.id);
          return (
            <div key={p.id} className="space-y-1.5">
              <div className="relative aspect-square rounded-lg overflow-hidden border border-border/40 bg-muted/20">
                {v ? (
                  <img src={v.image_url} alt={v.label} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground/60 gap-1">
                    {generate.isPending || isLoading ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <ImageIcon className="h-5 w-5" />
                    )}
                    <span className="text-[10px]">Not generated</span>
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                  <span className="text-[11px] font-medium text-white">{p.label}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
