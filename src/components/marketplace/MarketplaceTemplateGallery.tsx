import { useState } from 'react';
import { useMarketplaceTemplates, useMyOwnedTemplates, useTemplatePurchase } from '@/hooks/useMarketplace';
import { MarketplaceTemplateCard } from './MarketplaceTemplateCard';
import { MarketplaceTemplateDetailDialog } from './MarketplaceTemplateDetailDialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Store } from 'lucide-react';
import type { MarketplaceTemplate, PricingType } from '@/types/marketplace';

interface Props {
  onTemplateSelected?: (t: MarketplaceTemplate) => void;
}

export function MarketplaceTemplateGallery({ onTemplateSelected }: Props) {
  const [tab, setTab] = useState<'all' | PricingType>('all');
  const [sort, setSort] = useState<'trending' | 'top_rated' | 'newest' | 'price_asc' | 'price_desc'>('trending');
  const [previewTpl, setPreviewTpl] = useState<MarketplaceTemplate | null>(null);

  const { data: templates = [], isLoading } = useMarketplaceTemplates({
    pricingType: tab,
    sort,
  });
  const { data: ownedIds = [] } = useMyOwnedTemplates();
  const purchase = useTemplatePurchase();

  const ownedSet = new Set(ownedIds);

  const handlePurchase = async (t: MarketplaceTemplate) => {
    const res = await purchase.mutateAsync(t.id);
    if (res.ok && (res.already_owned || res.purchase_id)) {
      onTemplateSelected?.(t);
      setPreviewTpl(null);
    }
  };

  const handleUse = (t: MarketplaceTemplate) => {
    onTemplateSelected?.(t);
    setPreviewTpl(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2"><Store className="h-6 w-6" />Template Marketplace</h2>
          <p className="text-sm text-muted-foreground">Discover community-created templates. Earn credits when others buy yours.</p>
        </div>
        <Select value={sort} onValueChange={v => setSort(v as typeof sort)}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="trending">🔥 Trending</SelectItem>
            <SelectItem value="top_rated">⭐ Top Rated</SelectItem>
            <SelectItem value="newest">🆕 Newest</SelectItem>
            <SelectItem value="price_asc">Price ↑</SelectItem>
            <SelectItem value="price_desc">Price ↓</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Tabs value={tab} onValueChange={v => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="all">All ({templates.length})</TabsTrigger>
          <TabsTrigger value="free">🎁 Free</TabsTrigger>
          <TabsTrigger value="premium">💎 Premium</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No templates available in this category yet. Be the first creator!
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {templates.map(t => (
                <MarketplaceTemplateCard
                  key={t.id}
                  template={t}
                  isOwned={ownedSet.has(t.id)}
                  onPreview={setPreviewTpl}
                  onUse={handleUse}
                  onPurchase={handlePurchase}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <MarketplaceTemplateDetailDialog
        template={previewTpl}
        isOwned={previewTpl ? ownedSet.has(previewTpl.id) : false}
        open={!!previewTpl}
        onOpenChange={(open) => !open && setPreviewTpl(null)}
        onPurchase={handlePurchase}
        onUse={handleUse}
      />
    </div>
  );
}
