import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Eye, Heart, MessageCircle, Share2, TrendingUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useTranslation } from '@/hooks/useTranslation';

interface ContentMetricsTableProps {
  metrics: any[];
  onMetricsSaved: () => void;
}

export function ContentMetricsTable({ metrics, onMetricsSaved }: ContentMetricsTableProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    platform: 'instagram',
    caption: '',
    postedAt: new Date().toISOString().split('T')[0],
    views: '',
    likes: '',
    comments: '',
    shares: '',
  });

  const handleSave = async () => {
    if (!formData.caption) {
      toast({
        title: t('goals.error'),
        description: t('goals.metrics.captionRequired'),
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.functions.invoke('save-post-metrics', {
        body: {
          platform: formData.platform,
          caption: formData.caption,
          postedAt: new Date(formData.postedAt).toISOString(),
          views: formData.views ? parseInt(formData.views) : 0,
          likes: formData.likes ? parseInt(formData.likes) : 0,
          comments: formData.comments ? parseInt(formData.comments) : 0,
          shares: formData.shares ? parseInt(formData.shares) : 0,
        },
      });

      if (error) throw error;

      toast({
        title: t('goals.success'),
        description: t('goals.metrics.saved'),
      });

      setDialogOpen(false);
      setFormData({
        platform: 'instagram',
        caption: '',
        postedAt: new Date().toISOString().split('T')[0],
        views: '',
        likes: '',
        comments: '',
        shares: '',
      });
      onMetricsSaved();
    } catch (error) {
      console.error('Error saving metrics:', error);
      toast({
        title: t('goals.error'),
        description: t('goals.metrics.saveError'),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-foreground">
          📹 {t('goals.metrics.title')}
        </h3>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              {t('goals.metrics.addMetrics')}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t('goals.metrics.addMetrics')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label>{t('goals.platform')}</Label>
                <Select value={formData.platform} onValueChange={(v) => setFormData({ ...formData, platform: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="instagram">Instagram</SelectItem>
                    <SelectItem value="tiktok">TikTok</SelectItem>
                    <SelectItem value="facebook">Facebook</SelectItem>
                    <SelectItem value="linkedin">LinkedIn</SelectItem>
                    <SelectItem value="x">X (Twitter)</SelectItem>
                    <SelectItem value="youtube">YouTube</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>{t('goals.metrics.caption')}</Label>
                <Input
                  value={formData.caption}
                  onChange={(e) => setFormData({ ...formData, caption: e.target.value })}
                  placeholder={t('goals.metrics.captionPlaceholder')}
                />
              </div>

              <div>
                <Label>{t('goals.metrics.postedAt')}</Label>
                <Input
                  type="date"
                  value={formData.postedAt}
                  onChange={(e) => setFormData({ ...formData, postedAt: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t('goals.metrics.views')}</Label>
                  <Input
                    type="number"
                    value={formData.views}
                    onChange={(e) => setFormData({ ...formData, views: e.target.value })}
                    placeholder="0"
                  />
                </div>
                <div>
                  <Label>{t('goals.metrics.likes')}</Label>
                  <Input
                    type="number"
                    value={formData.likes}
                    onChange={(e) => setFormData({ ...formData, likes: e.target.value })}
                    placeholder="0"
                  />
                </div>
                <div>
                  <Label>{t('goals.metrics.comments')}</Label>
                  <Input
                    type="number"
                    value={formData.comments}
                    onChange={(e) => setFormData({ ...formData, comments: e.target.value })}
                    placeholder="0"
                  />
                </div>
                <div>
                  <Label>{t('goals.metrics.shares')}</Label>
                  <Input
                    type="number"
                    value={formData.shares}
                    onChange={(e) => setFormData({ ...formData, shares: e.target.value })}
                    placeholder="0"
                  />
                </div>
              </div>

              <Button onClick={handleSave} className="w-full" disabled={saving}>
                {saving ? t('goals.saving') : t('goals.save')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('goals.metrics.content')}</TableHead>
              <TableHead>{t('goals.platform')}</TableHead>
              <TableHead className="text-center">
                <Eye className="h-4 w-4 inline mr-1" />
                {t('goals.metrics.views')}
              </TableHead>
              <TableHead className="text-center">
                <Heart className="h-4 w-4 inline mr-1" />
                {t('goals.metrics.likes')}
              </TableHead>
              <TableHead className="text-center">
                <MessageCircle className="h-4 w-4 inline mr-1" />
                {t('goals.metrics.comments')}
              </TableHead>
              <TableHead className="text-center">
                <Share2 className="h-4 w-4 inline mr-1" />
                {t('goals.metrics.shares')}
              </TableHead>
              <TableHead className="text-center">
                <TrendingUp className="h-4 w-4 inline mr-1" />
                {t('goals.metrics.engagementRate')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {metrics && metrics.length > 0 ? (
              metrics.map((metric) => (
                <TableRow key={metric.id}>
                  <TableCell className="max-w-xs truncate">
                    {metric.caption_text || 'No caption'}
                  </TableCell>
                  <TableCell className="capitalize">{metric.provider}</TableCell>
                  <TableCell className="text-center">{metric.impressions || 0}</TableCell>
                  <TableCell className="text-center">{metric.likes || 0}</TableCell>
                  <TableCell className="text-center">{metric.comments || 0}</TableCell>
                  <TableCell className="text-center">{metric.shares || 0}</TableCell>
                  <TableCell className="text-center font-semibold">
                    {metric.engagement_rate ? `${metric.engagement_rate.toFixed(2)}%` : '-'}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  {t('goals.metrics.noData')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
