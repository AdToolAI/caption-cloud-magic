import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { Platform } from '@/hooks/useSocialPublishing';
import { useTranslation } from '@/hooks/useTranslation';

interface Props {
  platform: Platform;
  videoUrl: string;
  caption: string;
  aspectRatio?: string;
}

interface OptimizationTip {
  type: 'success' | 'warning' | 'info';
  message: string;
}

export function PlatformOptimizationHelper({ platform, videoUrl, caption, aspectRatio }: Props) {
  const { t } = useTranslation();

  const getOptimizationTips = (): OptimizationTip[] => {
    const tips: OptimizationTip[] = [];
    const captionLength = caption.length;
    const pt = (key: string, params?: Record<string, string | number>) => t(`composer.platformTips.${platform}.${key}`, params);

    switch (platform) {
      case 'instagram':
        if (aspectRatio !== '9:16') {
          tips.push({ type: 'warning', message: pt('wrongRatio') });
        } else {
          tips.push({ type: 'success', message: pt('perfectRatio') });
        }
        if (captionLength > 2200) {
          tips.push({ type: 'warning', message: pt('captionTooLong', { count: captionLength }) });
        }
        tips.push({ type: 'info', message: pt('hashtagTip') });
        break;
      case 'tiktok':
        if (aspectRatio !== '9:16') {
          tips.push({ type: 'warning', message: pt('wrongRatio') });
        }
        if (captionLength > 150) {
          tips.push({ type: 'warning', message: pt('captionTooLong', { count: captionLength }) });
        }
        tips.push({ type: 'info', message: pt('hookTip') });
        break;
      case 'linkedin':
        if (aspectRatio === '9:16') {
          tips.push({ type: 'warning', message: pt('wrongRatio') });
        }
        if (captionLength < 50) {
          tips.push({ type: 'info', message: pt('shortCaption') });
        }
        tips.push({ type: 'info', message: pt('toneTip') });
        break;
      case 'youtube':
        if (captionLength > 100) {
          tips.push({ type: 'warning', message: pt('titleTooLong') });
        }
        tips.push({ type: 'info', message: pt('tagsTip') });
        tips.push({ type: 'info', message: pt('descTip') });
        break;
    }
    return tips;
  };

  const tips = getOptimizationTips();

  const getIcon = (type: OptimizationTip['type']) => {
    switch (type) {
      case 'success': return <CheckCircle2 className="h-4 w-4 text-success" />;
      case 'warning': return <AlertCircle className="h-4 w-4 text-warning" />;
      case 'info': return <Info className="h-4 w-4 text-info" />;
    }
  };

  const spec = t(`composer.platformSpecs.${platform}`) as any;

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-2xl">{spec?.icon}</span>
        <h3 className="font-semibold">{t('composer.platformOptimization', { name: spec?.name || platform })}</h3>
      </div>

      <div className="space-y-2 mb-4 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t('composer.optimalFormat')}</span>
          <Badge variant="outline">{spec?.ratio}</Badge>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t('composer.maxLength')}</span>
          <span className="font-medium">{spec?.length}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t('composer.captionLimit')}</span>
          <span className="font-medium">{spec?.caption}</span>
        </div>
      </div>

      <div className="space-y-2">
        {tips.map((tip, idx) => (
          <div key={idx} className="flex items-start gap-2 text-sm p-2 rounded-lg bg-muted/30">
            {getIcon(tip.type)}
            <p className="flex-1">{tip.message}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
