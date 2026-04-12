import { useMemo } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/hooks/useTranslation';
import type { Sora2LongFormProject, Sora2Scene, TransitionType } from '@/types/sora-long-form';

interface TransitionEditorProps {
  project: Sora2LongFormProject;
  scenes: Sora2Scene[];
  onUpdateScenes: (scenes: Sora2Scene[]) => Promise<void>;
  onNext: () => void;
  onBack: () => void;
}

export function TransitionEditor({
  project,
  scenes,
  onUpdateScenes,
  onNext,
  onBack,
}: TransitionEditorProps) {
  const { t } = useTranslation();

  const TRANSITION_OPTIONS = useMemo(() => [
    { value: 'none' as TransitionType, label: t('soraLf.transitionNone') },
    { value: 'fade' as TransitionType, label: t('soraLf.transitionFade') },
    { value: 'crossfade' as TransitionType, label: t('soraLf.transitionCrossfade') },
    { value: 'slide' as TransitionType, label: t('soraLf.transitionSlide') },
    { value: 'zoom' as TransitionType, label: t('soraLf.transitionZoom') },
    { value: 'wipe' as TransitionType, label: t('soraLf.transitionWipe') },
  ], [t]);

  const updateTransition = (index: number, type: TransitionType, duration?: number) => {
    const newScenes = [...scenes];
    newScenes[index] = {
      ...newScenes[index],
      transition_type: type,
      ...(duration !== undefined && { transition_duration: duration }),
    };
    onUpdateScenes(newScenes);
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-semibold">{t('soraLf.adjustTransitions')}</h3>
        <p className="text-sm text-muted-foreground mt-1">{t('soraLf.adjustTransitionsDesc')}</p>
      </div>

      <div className="space-y-4">
        {scenes.map((scene, index) => (
          <div key={scene.id} className="flex items-stretch gap-4">
            <Card className="flex-shrink-0 w-48 p-3">
              <div className="aspect-video rounded-lg overflow-hidden bg-muted mb-2">
                {scene.generated_video_url ? (
                  <video
                    src={scene.generated_video_url}
                    className="w-full h-full object-cover"
                    muted
                    loop
                    onMouseEnter={(e) => e.currentTarget.play()}
                    onMouseLeave={(e) => e.currentTarget.pause()}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-sm">
                    {t('soraLf.sceneLabel').replace('{index}', String(index + 1))}
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground text-center">
                {scene.duration} {t('soraLf.seconds')}
              </p>
            </Card>

            {index < scenes.length - 1 && (
              <Card className="flex-1 p-4">
                <div className="flex items-center gap-4 h-full">
                  <div className="flex-1">
                    <Label className="text-xs text-muted-foreground">{t('soraLf.transitionSelectLabel')}</Label>
                    <Select
                      value={scene.transition_type}
                      onValueChange={(v) => updateTransition(index, v as TransitionType)}
                    >
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TRANSITION_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {scene.transition_type !== 'none' && (
                    <div className="flex-1">
                      <Label className="text-xs text-muted-foreground">
                        {t('soraLf.transitionDurationLabel').replace('{value}', scene.transition_duration.toFixed(1))}
                      </Label>
                      <Slider
                        value={[scene.transition_duration]}
                        onValueChange={([v]) => updateTransition(index, scene.transition_type, v)}
                        min={0.1}
                        max={2}
                        step={0.1}
                        className="mt-2"
                      />
                    </div>
                  )}

                  <div className="flex-shrink-0 flex items-center">
                    <div className={cn(
                      'h-8 w-16 rounded flex items-center justify-center text-xs font-medium',
                      scene.transition_type === 'none' && 'bg-muted text-muted-foreground',
                      scene.transition_type === 'fade' && 'bg-blue-500/20 text-blue-600',
                      scene.transition_type === 'crossfade' && 'bg-purple-500/20 text-purple-600',
                      scene.transition_type === 'slide' && 'bg-green-500/20 text-green-600',
                      scene.transition_type === 'zoom' && 'bg-orange-500/20 text-orange-600',
                      scene.transition_type === 'wipe' && 'bg-pink-500/20 text-pink-600',
                    )}>
                      {TRANSITION_OPTIONS.find(tr => tr.value === scene.transition_type)?.label}
                    </div>
                  </div>
                </div>
              </Card>
            )}
          </div>
        ))}
      </div>

      <Card className="p-4">
        <Label className="text-sm font-medium mb-3 block">{t('soraLf.quickActions')}</Label>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => onUpdateScenes(scenes.map(s => ({ ...s, transition_type: 'crossfade' as TransitionType })))}>
            {t('soraLf.allCrossfade')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => onUpdateScenes(scenes.map(s => ({ ...s, transition_type: 'fade' as TransitionType })))}>
            {t('soraLf.allFade')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => onUpdateScenes(scenes.map(s => ({ ...s, transition_type: 'none' as TransitionType })))}>
            {t('soraLf.allNone')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => onUpdateScenes(scenes.map(s => ({ ...s, transition_duration: 0.5 })))}>
            {t('soraLf.durationHalf')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => onUpdateScenes(scenes.map(s => ({ ...s, transition_duration: 1.0 })))}>
            {t('soraLf.durationOne')}
          </Button>
        </div>
      </Card>

      <Card className="p-4 bg-muted/50">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t('soraLf.transitionsDefined').replace('{count}', String(scenes.filter(s => s.transition_type !== 'none').length))}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onBack}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t('soraLf.back')}
            </Button>
            <Button onClick={onNext}>
              {t('soraLf.toExport')}
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
