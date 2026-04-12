import { useMemo } from 'react';
import { Clock, Monitor, Smartphone, Square, Zap, Crown } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/hooks/useTranslation';
import { formatPriceForLanguage } from '@/lib/currency';
import { calculateProjectCost, getRequiredSceneCount } from '@/types/sora-long-form';
import type { Sora2LongFormProject, TargetDuration, AspectRatio, ModelType } from '@/types/sora-long-form';

interface FormatStepProps {
  project: Sora2LongFormProject;
  onUpdate: (updates: Partial<Sora2LongFormProject>) => Promise<void>;
  onNext: () => void;
}

const ASPECT_OPTIONS: { value: AspectRatio; icon: React.ComponentType<any>; desc: string }[] = [
  { value: '16:9', icon: Monitor, desc: 'YouTube, TV' },
  { value: '9:16', icon: Smartphone, desc: 'TikTok, Reels' },
  { value: '1:1', icon: Square, desc: 'Instagram' },
];

export function FormatStep({ project, onUpdate, onNext }: FormatStepProps) {
  const { t, language } = useTranslation();

  const DURATION_OPTIONS: { value: TargetDuration; label: string; scenes: number }[] = useMemo(() => [
    { value: 30, label: `30 ${t('soraLf.sec')}`, scenes: 3 },
    { value: 60, label: `60 ${t('soraLf.sec')}`, scenes: 5 },
    { value: 120, label: `120 ${t('soraLf.sec')}`, scenes: 10 },
  ], [t]);

  const MODEL_OPTIONS = useMemo(() => [
    { value: 'sora-2-standard' as ModelType, label: t('soraLf.modelStandard'), icon: Zap, desc: t('soraLf.modelStandardDesc'), costPerSec: 0.25 },
    { value: 'sora-2-pro' as ModelType, label: t('soraLf.modelPro'), icon: Crown, desc: t('soraLf.modelProDesc'), costPerSec: 0.53 },
  ], [t]);

  const sceneCount = getRequiredSceneCount(project.target_duration);
  const estimatedCost = calculateProjectCost(
    Array(sceneCount).fill({ duration: 12 }),
    project.model
  );

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          {t('soraLf.chooseVideoDuration')}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {DURATION_OPTIONS.map((option) => {
            const isSelected = project.target_duration === option.value;
            const cost = calculateProjectCost(
              Array(option.scenes).fill({ duration: 12 }),
              project.model
            );

            return (
              <Card
                key={option.value}
                className={cn(
                  'p-6 cursor-pointer transition-all hover:scale-[1.02]',
                  isSelected
                    ? 'border-primary bg-primary/5 ring-2 ring-primary'
                    : 'border-border hover:border-primary/50'
                )}
                onClick={() => onUpdate({ target_duration: option.value })}
              >
                <div className="text-center">
                  <h4 className="text-2xl font-bold">{option.label}</h4>
                  <p className="text-muted-foreground mt-1">{option.scenes} {t('soraLf.scenes')}</p>
                  <div className="mt-3 pt-3 border-t border-border">
                    <p className="text-sm text-muted-foreground">{t('soraLf.estimatedCost')}</p>
                    <p className="text-lg font-semibold text-primary">
                      ~{formatPriceForLanguage(cost, language)}
                    </p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">{t('soraLf.aspectRatio')}</h3>
        <div className="grid grid-cols-3 gap-4">
          {ASPECT_OPTIONS.map((option) => {
            const Icon = option.icon;
            const isSelected = project.aspect_ratio === option.value;

            return (
              <Card
                key={option.value}
                className={cn(
                  'p-4 cursor-pointer transition-all hover:scale-[1.02]',
                  isSelected
                    ? 'border-primary bg-primary/5 ring-2 ring-primary'
                    : 'border-border hover:border-primary/50'
                )}
                onClick={() => onUpdate({ aspect_ratio: option.value })}
              >
                <div className="text-center">
                  <Icon className="h-8 w-8 mx-auto mb-2" />
                  <h4 className="font-semibold">{option.value}</h4>
                  <p className="text-xs text-muted-foreground">{option.desc}</p>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">{t('soraLf.soraModel')}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {MODEL_OPTIONS.map((option) => {
            const Icon = option.icon;
            const isSelected = project.model === option.value;

            return (
              <Card
                key={option.value}
                className={cn(
                  'p-4 cursor-pointer transition-all hover:scale-[1.02]',
                  isSelected
                    ? 'border-primary bg-primary/5 ring-2 ring-primary'
                    : 'border-border hover:border-primary/50'
                )}
                onClick={() => onUpdate({ model: option.value })}
              >
                <div className="flex items-center gap-4">
                  <div className={cn(
                    'h-12 w-12 rounded-xl flex items-center justify-center',
                    option.value === 'sora-2-pro' 
                      ? 'bg-gradient-to-br from-amber-500 to-orange-600'
                      : 'bg-gradient-to-br from-blue-500 to-violet-600'
                  )}>
                    <Icon className="h-6 w-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold">{option.label}</h4>
                      {option.value === 'sora-2-pro' && (
                        <Badge variant="secondary" className="bg-amber-500/20 text-amber-600">{t('soraLf.premium')}</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{option.desc}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatPriceForLanguage(option.costPerSec, language)} {t('soraLf.perSecond')}
                    </p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      <Card className="p-6 bg-primary/5 border-primary/20">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-semibold">{t('soraLf.summary')}</h4>
            <p className="text-sm text-muted-foreground mt-1">
              {project.target_duration} {t('soraLf.seconds')} • {sceneCount} {t('soraLf.scenes')} • {project.aspect_ratio} • Sora 2 {project.model === 'sora-2-pro' ? 'Pro' : t('soraLf.modelStandard')}
            </p>
            <p className="text-lg font-semibold text-primary mt-2">
              {t('soraLf.estimatedCost')}: ~{formatPriceForLanguage(estimatedCost, language)}
            </p>
          </div>
          <Button size="lg" onClick={onNext}>
            {t('soraLf.nextToScript')}
          </Button>
        </div>
      </Card>
    </div>
  );
}
