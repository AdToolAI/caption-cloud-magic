import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Check, X, Coins, ShieldAlert, FileText, ExternalLink } from 'lucide-react';

interface PendingChar {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  reference_image_url: string;
  portrait_url: string | null;
  pricing_type: 'free' | 'premium';
  price_credits: number;
  origin_type: 'ai_generated' | 'licensed_real_person' | 'self_portrait' | null;
  origin_metadata: Record<string, unknown> | null;
  license_release_path: string | null;
  sample_video_urls: string[] | null;
  voice_sample_url: string | null;
  tags: string[] | null;
  nsfw_flag: boolean;
  marketplace_status: string;
  updated_at: string;
}

function usePendingCharacters() {
  return useQuery({
    queryKey: ['admin-marketplace-characters-pending'],
    queryFn: async (): Promise<PendingChar[]> => {
      const { data, error } = await supabase
        .from('brand_characters')
        .select('*')
        .in('marketplace_status', ['pending_review', 'under_investigation'])
        .order('updated_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as PendingChar[];
    },
  });
}

function useReviewCharacter() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: { characterId: string; decision: 'approve' | 'reject'; rejectionReason?: string }) => {
      const { data, error } = await supabase.functions.invoke('review-marketplace-character', { body: input });
      if (error) throw error;
      return data as { ok: boolean; status?: string; error?: string };
    },
    onSuccess: (res) => {
      if (res.ok) {
        toast({ title: `Character ${res.status === 'published' ? 'approved' : 'rejected'}` });
        qc.invalidateQueries({ queryKey: ['admin-marketplace-characters-pending'] });
        qc.invalidateQueries({ queryKey: ['marketplace-characters'] });
      } else {
        toast({ title: 'Review failed', description: res.error ?? 'Unknown', variant: 'destructive' });
      }
    },
    onError: (e: unknown) => toast({ title: 'Review failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' }),
  });
}

function useTakedown() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: { characterId: string; reason: string; refundBuyers: boolean }) => {
      const { data, error } = await supabase.functions.invoke('takedown-marketplace-character', { body: input });
      if (error) throw error;
      return data as { ok: boolean; refunded_count?: number; error?: string };
    },
    onSuccess: (res) => {
      if (res.ok) {
        toast({ title: 'Taken down', description: `Refunded ${res.refunded_count ?? 0} buyer(s).` });
        qc.invalidateQueries({ queryKey: ['admin-marketplace-characters-pending'] });
        qc.invalidateQueries({ queryKey: ['marketplace-characters'] });
      } else toast({ title: 'Takedown failed', description: res.error ?? 'Unknown', variant: 'destructive' });
    },
  });
}

function LicenseLink({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    supabase.storage.from('character-licenses').createSignedUrl(path, 60 * 5).then(({ data }) => {
      if (active) setUrl(data?.signedUrl ?? null);
    });
    return () => { active = false; };
  }, [path]);
  if (!url) return <span className="text-xs text-muted-foreground">Loading license…</span>;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
      <FileText className="h-3 w-3" /> Open model release <ExternalLink className="h-3 w-3" />
    </a>
  );
}

export function CharacterMarketplaceReviewPanel() {
  const { data: pending = [], isLoading } = usePendingCharacters();
  const review = useReviewCharacter();
  const takedown = useTakedown();
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const counts = useMemo(() => ({
    pending: pending.filter((p) => p.marketplace_status === 'pending_review').length,
    investigating: pending.filter((p) => p.marketplace_status === 'under_investigation').length,
  }), [pending]);

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (pending.length === 0) return <Card className="p-8 text-center text-muted-foreground">No characters waiting for review. ✨</Card>;

  return (
    <Tabs defaultValue="pending" className="space-y-4">
      <TabsList>
        <TabsTrigger value="pending">Pending review ({counts.pending})</TabsTrigger>
        <TabsTrigger value="investigating">Under investigation ({counts.investigating})</TabsTrigger>
      </TabsList>

      {(['pending', 'investigating'] as const).map((bucket) => (
        <TabsContent key={bucket} value={bucket} className="space-y-4">
          {pending.filter((p) => (bucket === 'pending' ? p.marketplace_status === 'pending_review' : p.marketplace_status === 'under_investigation')).map((c) => (
            <Card key={c.id} className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="aspect-[4/5] bg-muted rounded-md overflow-hidden">
                  <img src={c.portrait_url || c.reference_image_url} alt={c.name} className="w-full h-full object-cover" />
                </div>

                <div className="md:col-span-2 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-lg">{c.name}</h3>
                      <p className="text-sm text-muted-foreground">{c.description || '—'}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Badge className={c.pricing_type === 'free' ? 'bg-emerald-600' : 'bg-amber-500/90 text-white gap-1'}>
                        {c.pricing_type === 'premium' && <Coins className="h-3 w-3" />}
                        {c.pricing_type === 'free' ? 'Free' : `${c.price_credits} Credits`}
                      </Badge>
                      {c.nsfw_flag && <Badge variant="destructive" className="gap-1"><ShieldAlert className="h-3 w-3" /> NSFW</Badge>}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                    <Stat label="Origin" value={c.origin_type?.replace('_', ' ')} />
                    <Stat label="Tags" value={(c.tags ?? []).slice(0, 3).join(', ') || '—'} />
                    <Stat label="Samples" value={`${c.sample_video_urls?.length ?? 0} clips`} />
                  </div>

                  {c.origin_type === 'licensed_real_person' && (
                    <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs space-y-1">
                      <div className="font-medium text-amber-600 dark:text-amber-400">Real person — license required</div>
                      {c.license_release_path
                        ? <LicenseLink path={c.license_release_path} />
                        : <div className="text-destructive">⚠ No license file uploaded</div>}
                    </div>
                  )}

                  <div className="text-xs text-muted-foreground">
                    Creator: <code className="bg-muted px-1 rounded">{c.user_id?.slice(0, 8)}…</code> · Submitted: {new Date(c.updated_at).toLocaleString()}
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 mt-2">
                    {bucket === 'pending' && (
                      <>
                        <Button onClick={() => review.mutate({ characterId: c.id, decision: 'approve' })} disabled={review.isPending} className="bg-emerald-600 hover:bg-emerald-700">
                          <Check className="h-4 w-4 mr-2" /> Approve & Publish
                        </Button>
                        <div className="flex flex-1 gap-2">
                          <Textarea
                            placeholder="Reason for rejection…"
                            value={reasons[c.id] ?? ''}
                            onChange={(e) => setReasons((p) => ({ ...p, [c.id]: e.target.value }))}
                            rows={1}
                            className="min-h-[40px]"
                          />
                          <Button
                            variant="destructive"
                            disabled={review.isPending}
                            onClick={() => review.mutate({ characterId: c.id, decision: 'reject', rejectionReason: reasons[c.id] || 'Does not meet marketplace standards' })}
                          >
                            <X className="h-4 w-4 mr-2" /> Reject
                          </Button>
                        </div>
                      </>
                    )}
                    {bucket === 'investigating' && (
                      <>
                        <Button onClick={() => review.mutate({ characterId: c.id, decision: 'approve' })} disabled={review.isPending} className="bg-emerald-600 hover:bg-emerald-700">
                          <Check className="h-4 w-4 mr-2" /> Clear & Restore
                        </Button>
                        <Button
                          variant="destructive"
                          disabled={takedown.isPending}
                          onClick={() => {
                            if (!confirm(`Permanently take down "${c.name}" and refund all buyers?`)) return;
                            takedown.mutate({ characterId: c.id, reason: reasons[c.id] || 'Policy violation', refundBuyers: true });
                          }}
                        >
                          <ShieldAlert className="h-4 w-4 mr-2" /> Takedown + Refund
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </TabsContent>
      ))}
    </Tabs>
  );
}

function Stat({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div className="bg-muted/50 rounded p-2">
      <div className="text-muted-foreground">{label}</div>
      <div className="font-medium capitalize">{value || '—'}</div>
    </div>
  );
}
