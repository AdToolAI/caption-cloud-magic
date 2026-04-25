import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Palette, Check, Loader2, Sparkles } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/useTranslation';
import {
  useBrandKits,
  useBrandKitAutoApply,
  type BrandKit,
} from '@/hooks/useBrandKitAutoApply';
import type { AssemblyConfig } from '@/types/video-composer';

interface BrandKitApplyPanelProps {
  brandKitId: string | null;
  autoSync: boolean;
  assemblyConfig: AssemblyConfig;
  onChangeBrandKit: (id: string | null) => void;
  onChangeAutoSync: (sync: boolean) => void;
  onApplyAssembly: (next: AssemblyConfig) => void;
}

/**
 * Composer-side Brand Kit selector + one-click "Apply to all scenes" button.
 * Auto-applies watermark logo, text overlay colors/fonts and color grading.
 */
export default function BrandKitApplyPanel({
  brandKitId,
  autoSync,
  assemblyConfig,
  onChangeBrandKit,
  onChangeAutoSync,
  onApplyAssembly,
}: BrandKitApplyPanelProps) {
  const { t } = useTranslation();
  const { data: brandKits, isLoading } = useBrandKits();
  const { apply } = useBrandKitAutoApply();
  const [applying, setApplying] = useState(false);

  const selectedKit: BrandKit | undefined = useMemo(
    () => brandKits?.find((k) => k.id === brandKitId),
    [brandKits, brandKitId]
  );

  const handleApply = () => {
    if (!selectedKit) {
      toast({
        title: t('videoComposer.brandKit.noKitSelected') || 'No brand kit selected',
        variant: 'destructive',
      });
      return;
    }
    setApplying(true);
    try {
      const next = apply(assemblyConfig, selectedKit);
      onApplyAssembly(next);
      toast({
        title: t('videoComposer.brandKit.applied') || 'Brand kit applied',
        description: selectedKit.brand_name || undefined,
      });
    } finally {
      setApplying(false);
    }
  };

  const hasNoKits = !isLoading && (!brandKits || brandKits.length === 0);

  return (
    <Card className="border-amber-500/30 bg-card/80 shadow-[0_0_24px_-12px_hsl(45_90%_55%/0.4)]">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Palette className="h-4 w-4 text-amber-500" />
            {t('videoComposer.brandKit.title') || 'Brand Kit'}
          </CardTitle>
          {selectedKit && (
            <Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-400">
              <Sparkles className="h-3 w-3 mr-1" />
              {t('videoComposer.brandKit.activeBadge') || 'Brand active'}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasNoKits ? (
          <p className="text-sm text-muted-foreground">
            {t('videoComposer.brandKit.empty') ||
              'No brand kits found yet. Create one in the Brand Studio first.'}
          </p>
        ) : (
          <>
            <div className="space-y-2">
              <Label className="text-xs">
                {t('videoComposer.brandKit.selectLabel') || 'Choose a brand kit'}
              </Label>
              <Select
                value={brandKitId ?? 'none'}
                onValueChange={(val) => onChangeBrandKit(val === 'none' ? null : val)}
                disabled={isLoading}
              >
                <SelectTrigger className="bg-background/50">
                  <SelectValue
                    placeholder={t('videoComposer.brandKit.placeholder') || 'Select brand kit'}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    {t('videoComposer.brandKit.none') || 'No brand kit'}
                  </SelectItem>
                  {brandKits?.map((kit) => (
                    <SelectItem key={kit.id} value={kit.id}>
                      <div className="flex items-center gap-2">
                        {kit.logo_url && (
                          <img
                            src={kit.logo_url}
                            alt=""
                            className="h-4 w-4 object-contain rounded"
                          />
                        )}
                        {kit.primary_color && (
                          <div
                            className="h-3 w-3 rounded-full border border-border"
                            style={{ backgroundColor: kit.primary_color }}
                          />
                        )}
                        <span>{kit.brand_name || 'Unnamed'}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedKit && (
              <div className="rounded-lg border border-border/40 bg-background/40 p-3 space-y-3">
                {/* Color swatches */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground w-16">
                    {t('videoComposer.brandKit.colors') || 'Colors'}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {[selectedKit.primary_color, selectedKit.secondary_color, selectedKit.accent_color]
                      .filter(Boolean)
                      .map((c, i) => (
                        <div
                          key={`${c}-${i}`}
                          className="h-6 w-6 rounded-md border border-border shadow-sm"
                          style={{ backgroundColor: c! }}
                          title={c!}
                        />
                      ))}
                  </div>
                </div>

                {/* Logo */}
                {selectedKit.logo_url && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground w-16">
                      {t('videoComposer.brandKit.logo') || 'Logo'}
                    </span>
                    <img
                      src={selectedKit.logo_url}
                      alt=""
                      className="h-8 max-w-[140px] object-contain"
                    />
                  </div>
                )}

                {/* Font preview */}
                {selectedKit.font_pairing?.heading && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground w-16">
                      {t('videoComposer.brandKit.font') || 'Font'}
                    </span>
                    <span
                      className="text-base font-semibold"
                      style={{ fontFamily: selectedKit.font_pairing.heading }}
                    >
                      {selectedKit.brand_name || 'Brand Name'}
                    </span>
                  </div>
                )}

                {/* Auto-sync */}
                <div className="flex items-center justify-between pt-2 border-t border-border/30">
                  <div className="space-y-0.5">
                    <Label className="text-xs">
                      {t('videoComposer.brandKit.autoSync') || 'Auto-sync brand changes'}
                    </Label>
                    <p className="text-[10px] text-muted-foreground">
                      {t('videoComposer.brandKit.autoSyncDesc') ||
                        'Re-apply when the brand kit is updated'}
                    </p>
                  </div>
                  <Switch checked={autoSync} onCheckedChange={onChangeAutoSync} />
                </div>

                {/* Apply button */}
                <Button
                  onClick={handleApply}
                  disabled={applying}
                  className="w-full bg-amber-500 text-amber-950 hover:bg-amber-400"
                  size="sm"
                >
                  {applying ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  {t('videoComposer.brandKit.applyAll') || 'Apply to all scenes'}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
