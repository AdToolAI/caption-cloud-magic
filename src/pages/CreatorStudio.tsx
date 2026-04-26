import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Coins, Eye, Send, Sparkles, TrendingUp, Award, Loader2, AlertCircle } from 'lucide-react';
import { useMyMarketplaceTemplates, useCreatorEarnings } from '@/hooks/useMarketplace';
import { SubmitToMarketplaceDialog } from '@/components/marketplace/SubmitToMarketplaceDialog';
import type { MarketplaceTemplate } from '@/types/marketplace';

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-muted text-muted-foreground' },
  pending_review: { label: 'In Review', className: 'bg-amber-500/20 text-amber-600 dark:text-amber-400' },
  published: { label: 'Live', className: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' },
  rejected: { label: 'Rejected', className: 'bg-destructive/20 text-destructive' },
  unlisted: { label: 'Unlisted', className: 'bg-muted text-muted-foreground' },
};

export default function CreatorStudio() {
  const { data: templates = [], isLoading } = useMyMarketplaceTemplates();
  const { data: earnings } = useCreatorEarnings();
  const [submitTpl, setSubmitTpl] = useState<MarketplaceTemplate | null>(null);

  const totalEarned = earnings?.total ?? 0;
  const publishedCount = templates.filter(t => t.marketplace_status === 'published').length;
  const pendingCount = templates.filter(t => t.marketplace_status === 'pending_review').length;
  const totalSales = templates.reduce((acc, t) => acc + (t.total_purchases ?? 0), 0);

  return (
    <>
      <Helmet>
        <title>Creator Studio | AdTool</title>
        <meta name="description" content="Veröffentliche deine eigenen Motion-Studio-Templates und verdiene Credits, wenn die Community sie nutzt." />
      </Helmet>

      <div className="container mx-auto py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Creator Studio</h1>
          <p className="text-muted-foreground">Teile deine Templates und verdiene 70% pro Verkauf.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <StatCard icon={<Coins className="h-5 w-5" />} label="Total Earned" value={`${totalEarned} Credits`} accent="emerald" />
          <StatCard icon={<TrendingUp className="h-5 w-5" />} label="Total Sales" value={String(totalSales)} accent="blue" />
          <StatCard icon={<Sparkles className="h-5 w-5" />} label="Live Templates" value={String(publishedCount)} accent="primary" />
          <StatCard icon={<Award className="h-5 w-5" />} label="In Review" value={String(pendingCount)} accent="amber" />
        </div>

        <Tabs defaultValue="templates">
          <TabsList>
            <TabsTrigger value="templates">My Templates</TabsTrigger>
            <TabsTrigger value="earnings">Earnings History</TabsTrigger>
          </TabsList>

          <TabsContent value="templates" className="mt-6">
            {isLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
            ) : templates.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground mb-3">
                  Du hast noch keine Templates erstellt. Baue eines im Motion Studio und teile es hier mit der Community.
                </p>
                <Button asChild><a href="/video-composer">Zum Motion Studio</a></Button>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {templates.map(t => {
                  const status = STATUS_BADGE[t.marketplace_status] ?? STATUS_BADGE.draft;
                  return (
                    <Card key={t.id} className="overflow-hidden flex flex-col">
                      <div className="aspect-video bg-muted">
                        {t.thumbnail_url ? (
                          <img src={t.thumbnail_url} alt={t.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">No thumbnail</div>
                        )}
                      </div>
                      <div className="p-4 flex-1 flex flex-col gap-3">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-semibold line-clamp-1">{t.name}</h3>
                          <Badge className={status.className}>{status.label}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2">{t.description}</p>

                        {t.marketplace_status === 'rejected' && t.rejection_reason && (
                          <div className="text-xs bg-destructive/10 border border-destructive/30 rounded p-2 flex gap-2">
                            <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                            <span className="text-destructive">{t.rejection_reason}</span>
                          </div>
                        )}

                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{t.pricing_type === 'free' ? 'Free' : `${t.price_credits} Credits`}</span>
                          <span>{t.total_purchases} sales · {t.total_revenue_credits} earned</span>
                        </div>

                        {(t.marketplace_status === 'draft' || t.marketplace_status === 'rejected') && (
                          <Button size="sm" onClick={() => setSubmitTpl(t)}>
                            <Send className="h-4 w-4 mr-2" />Submit to Marketplace
                          </Button>
                        )}
                        {t.marketplace_status === 'published' && (
                          <Button size="sm" variant="outline" asChild>
                            <a href={`/marketplace?id=${t.id}`}><Eye className="h-4 w-4 mr-2" />View Public Page</a>
                          </Button>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="earnings" className="mt-6">
            <Card className="p-4">
              {!earnings || earnings.ledger.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Noch keine Verkäufe. Sobald jemand dein Template kauft, erscheint es hier.</p>
              ) : (
                <div className="space-y-2">
                  {earnings.ledger.map(e => (
                    <div key={e.id} className="flex items-center justify-between border-b last:border-0 py-2 text-sm">
                      <div>
                        <div className="font-medium">Template Purchase</div>
                        <div className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString()}</div>
                      </div>
                      <div className="font-bold text-emerald-600 dark:text-emerald-400">+{e.credits_earned} Credits</div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <SubmitToMarketplaceDialog
        template={submitTpl}
        open={!!submitTpl}
        onOpenChange={(open) => !open && setSubmitTpl(null)}
      />
    </>
  );
}

function StatCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent: 'emerald' | 'blue' | 'amber' | 'primary' }) {
  const accentMap = {
    emerald: 'text-emerald-500',
    blue: 'text-blue-500',
    amber: 'text-amber-500',
    primary: 'text-primary',
  };
  return (
    <Card className="p-4">
      <div className={`flex items-center gap-2 ${accentMap[accent]}`}>{icon}<span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span></div>
      <div className="text-2xl font-bold mt-2">{value}</div>
    </Card>
  );
}
