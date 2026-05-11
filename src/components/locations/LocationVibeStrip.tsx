import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Sparkles, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface VibeVariant { id: string; vibe_id: string; label: string; image_url: string }

const PLACEHOLDER_VIBES = [
  { id: 'golden-hour', label: 'Golden Hour' },
  { id: 'blue-hour', label: 'Blue Hour' },
  { id: 'overcast', label: 'Overcast' },
  { id: 'night-neon', label: 'Night / Neon' },
  { id: 'foggy-dawn', label: 'Foggy Dawn' },
];

export function LocationVibeStrip({ locationId }: { locationId: string }) {
  const qc = useQueryClient();
  const { data: vibes = [] } = useQuery({
    queryKey: ['location-vibes', locationId],
    queryFn: async (): Promise<VibeVariant[]> => {
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

  const byId = new Map(vibes.map((v) => [v.vibe_id, v]));

  return (
    <div className="border-t border-border/40 px-3 py-2.5 space-y-2 bg-background/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          <Sparkles className="h-2.5 w-2.5 text-primary" /> Vibes
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[10px] text-primary hover:text-primary"
          disabled={generate.isPending}
          onClick={() => generate.mutate()}
        >
          {generate.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
          {vibes.length > 0 ? 'Regen' : 'Generate'}
        </Button>
      </div>
      <div className="grid grid-cols-5 gap-1">
        {PLACEHOLDER_VIBES.map((p) => {
          const v = byId.get(p.id);
          return (
            <div key={p.id} className="relative aspect-square rounded overflow-hidden border border-border/30 bg-muted/20" title={p.label}>
              {v ? (
                <img src={v.image_url} alt={p.label} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-[8px] text-muted-foreground/60 text-center px-0.5 leading-tight">
                  {generate.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : p.label}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
