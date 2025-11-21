import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { Platform } from '@/hooks/useSocialPublishing';

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
  const getOptimizationTips = (): OptimizationTip[] => {
    const tips: OptimizationTip[] = [];
    const captionLength = caption.length;

    switch (platform) {
      case 'instagram':
        if (aspectRatio !== '9:16') {
          tips.push({
            type: 'warning',
            message: 'Empfohlen: 9:16 Format für beste Reels Performance'
          });
        } else {
          tips.push({
            type: 'success',
            message: 'Perfektes Format für Instagram Reels'
          });
        }
        
        if (captionLength > 2200) {
          tips.push({
            type: 'warning',
            message: `Caption zu lang (${captionLength}/2200 Zeichen)`
          });
        }

        tips.push({
          type: 'info',
          message: 'Nutze 3-5 relevante Hashtags für beste Reichweite'
        });
        break;

      case 'tiktok':
        if (aspectRatio !== '9:16') {
          tips.push({
            type: 'warning',
            message: 'TikTok funktioniert am besten mit 9:16 Videos'
          });
        }

        if (captionLength > 150) {
          tips.push({
            type: 'warning',
            message: `Caption wird gekürzt (${captionLength}/150 Zeichen)`
          });
        }

        tips.push({
          type: 'info',
          message: 'Erste 3 Sekunden sind entscheidend - starte mit Hook!'
        });
        break;

      case 'linkedin':
        if (aspectRatio === '9:16') {
          tips.push({
            type: 'warning',
            message: 'LinkedIn bevorzugt 16:9 oder 1:1 Format'
          });
        }

        if (captionLength < 50) {
          tips.push({
            type: 'info',
            message: 'Längere Captions (100-300 Zeichen) performen besser auf LinkedIn'
          });
        }

        tips.push({
          type: 'info',
          message: 'Professioneller Ton und Mehrwert wichtig für B2B Audience'
        });
        break;

      case 'youtube':
        if (captionLength > 100) {
          tips.push({
            type: 'warning',
            message: 'Titel sollte unter 100 Zeichen bleiben für beste CTR'
          });
        }

        tips.push({
          type: 'info',
          message: 'Füge relevante Tags für bessere Auffindbarkeit hinzu'
        });

        tips.push({
          type: 'info',
          message: 'Detaillierte Beschreibung verbessert SEO'
        });
        break;
    }

    return tips;
  };

  const tips = getOptimizationTips();

  const getIcon = (type: OptimizationTip['type']) => {
    switch (type) {
      case 'success':
        return <CheckCircle2 className="h-4 w-4 text-success" />;
      case 'warning':
        return <AlertCircle className="h-4 w-4 text-warning" />;
      case 'info':
        return <Info className="h-4 w-4 text-info" />;
    }
  };

  const platformSpecs = {
    instagram: {
      name: 'Instagram',
      icon: '📸',
      optimalRatio: '9:16',
      maxLength: '60s (Reels)',
      captionLimit: '2,200 Zeichen'
    },
    tiktok: {
      name: 'TikTok',
      icon: '🎵',
      optimalRatio: '9:16',
      maxLength: '10 Minuten',
      captionLimit: '150 Zeichen'
    },
    linkedin: {
      name: 'LinkedIn',
      icon: '💼',
      optimalRatio: '16:9 / 1:1',
      maxLength: '10 Minuten',
      captionLimit: '3,000 Zeichen'
    },
    youtube: {
      name: 'YouTube',
      icon: '📺',
      optimalRatio: '16:9',
      maxLength: 'Unbegrenzt',
      captionLimit: 'Titel: 100, Beschreibung: 5,000'
    }
  };

  const spec = platformSpecs[platform];

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-2xl">{spec.icon}</span>
        <h3 className="font-semibold">{spec.name} Optimierung</h3>
      </div>

      <div className="space-y-2 mb-4 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Optimales Format:</span>
          <Badge variant="outline">{spec.optimalRatio}</Badge>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Max. Länge:</span>
          <span className="font-medium">{spec.maxLength}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Caption Limit:</span>
          <span className="font-medium">{spec.captionLimit}</span>
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
