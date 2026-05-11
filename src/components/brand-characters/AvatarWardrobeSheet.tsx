import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Sparkles, Loader2, Shirt } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';

interface OutfitVariant {
  id: string;
  outfit_id: string;
  label: string;
  image_url: string;
}

const PLACEHOLDER_OUTFITS = [
  { id: 'casual', label: 'Casual' },
  { id: 'formal', label: 'Formal' },
  { id: 'action', label: 'Action' },
  { id: 'brand', label: 'Brand' },
];

interface Props { avatarId: string }

export function AvatarWardrobeSheet({ avatarId }: Props) {
  const qc = useQueryClient();
  const { data: outfits = [] } = useQuery({
    queryKey: ['avatar-wardrobe', avatarId],
    queryFn: async (): Promise<OutfitVariant[]> => {
      const { data, error } = await (supabase as any)
        .from('avatar_wardrobe_variants')
        .select('id, outfit_id, label, image_url')
        .eq('avatar_id', avatarId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data || [];
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

  const byId = new Map(outfits.map((o) => [o.outfit_id, o]));

  return (
    <Card className="p-5 bg-card/60 backdrop-blur border-primary/15 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-serif text-xl flex items-center gap-2">
            <Shirt className="h-4 w-4 text-primary" /> Wardrobe Sheet
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Locked-identity outfit variants — same face, different wardrobe. Drop into any studio for tonal control.
          </p>
        </div>
        <Button
          onClick={() => generate.mutate()}
          disabled={generate.isPending}
          className="bg-primary text-primary-foreground"
        >
          {generate.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
          {outfits.length > 0 ? 'Regenerate' : 'Generate Wardrobe Sheet'}
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {PLACEHOLDER_OUTFITS.map((p) => {
          const v = byId.get(p.id);
          return (
            <div
              key={p.id}
              className="relative aspect-square rounded-lg overflow-hidden border border-border/40 bg-muted/20"
              title={p.label}
            >
              {v ? (
                <img src={v.image_url} alt={p.label} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-[10px] text-muted-foreground/70 text-center px-1 leading-tight">
                  {generate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : p.label}
                </div>
              )}
              <div className="absolute bottom-1 left-1 right-1 text-[9px] uppercase tracking-wider text-foreground/90 bg-background/60 backdrop-blur px-1.5 py-0.5 rounded">
                {p.label}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
