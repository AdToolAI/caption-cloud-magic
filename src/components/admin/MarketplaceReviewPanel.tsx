import { useState } from 'react';
import { usePendingMarketplaceTemplates, useReviewTemplate } from '@/hooks/useMarketplace';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Check, X, Coins } from 'lucide-react';

export function MarketplaceReviewPanel() {
  const { data: pending = [], isLoading } = usePendingMarketplaceTemplates();
  const review = useReviewTemplate();
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (pending.length === 0) {
    return <Card className="p-8 text-center text-muted-foreground">Keine Templates warten aktuell auf Freigabe. ✨</Card>;
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">{pending.length} Template(s) warten auf Review</div>

      {pending.map(t => (
        <Card key={t.id} className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="aspect-video bg-muted rounded-md overflow-hidden">
              {t.preview_video_url ? (
                <video src={t.preview_video_url} controls className="w-full h-full object-cover" />
              ) : t.thumbnail_url ? (
                <img src={t.thumbnail_url} alt={t.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">No preview</div>
              )}
            </div>

            <div className="md:col-span-2 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-lg">{t.name}</h3>
                  <p className="text-sm text-muted-foreground">{t.description}</p>
                </div>
                <Badge className="bg-amber-500/90 text-white shrink-0 gap-1">
                  <Coins className="h-3 w-3" />{t.price_credits} Credits
                </Badge>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <Stat label="Use Case" value={t.use_case} />
                <Stat label="Style" value={t.style} />
                <Stat label="Format" value={t.aspect_ratio} />
                <Stat label="Duration" value={`${t.duration_seconds}s`} />
              </div>

              <div className="text-xs text-muted-foreground">
                Creator: <code className="bg-muted px-1 rounded">{t.creator_user_id?.slice(0, 8)}…</code> ·
                Submitted: {new Date(t.updated_at).toLocaleString()}
              </div>

              <div className="flex flex-col sm:flex-row gap-2 mt-2">
                <Button
                  onClick={() => review.mutate({ templateId: t.id, decision: 'approve' })}
                  disabled={review.isPending}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  <Check className="h-4 w-4 mr-2" />Approve
                </Button>
                <div className="flex flex-1 gap-2">
                  <Textarea
                    placeholder="Reason for rejection…"
                    value={rejectReasons[t.id] ?? ''}
                    onChange={e => setRejectReasons(prev => ({ ...prev, [t.id]: e.target.value }))}
                    rows={1}
                    className="min-h-[40px]"
                  />
                  <Button
                    variant="destructive"
                    onClick={() => review.mutate({ templateId: t.id, decision: 'reject', rejectionReason: rejectReasons[t.id] ?? 'Quality standards not met' })}
                    disabled={review.isPending}
                  >
                    <X className="h-4 w-4 mr-2" />Reject
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
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
